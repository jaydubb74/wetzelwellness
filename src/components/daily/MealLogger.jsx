import { useState, useRef, useEffect } from 'react';
import { parseMealMacros, saveMealCorrection, FOOD_GROUP_KEYS } from '../../services/llm.js';
import * as storage from '../../services/storage.js';
import { useSavedMeals } from '../../hooks/useSavedMeals.js';

const MACRO_FIELDS = [
  { key: 'protein',  label: 'Protein',  unit: 'g' },
  { key: 'fat',      label: 'Fat',      unit: 'g' },
  { key: 'carbs',    label: 'Carbs',    unit: 'g' },
  { key: 'calories', label: 'Calories', unit: 'kcal' },
];
const PORTIONS = [0.5, 1, 1.5, 2];
const GROUP_LABELS = { vegetables: 'Vegetables', fruit: 'Fruit', wholeGrains: 'Whole grains', legumes: 'Legumes', nuts: 'Nuts' };

function scaleGroups(groups, multiplier) {
  return Object.fromEntries(FOOD_GROUP_KEYS.map(k => [k, Math.round((groups[k] || 0) * multiplier * 2) / 2]));
}

// "Vegetables 1 · Whole grains 2", or "none" when every group is zero
function describeGroups(groups) {
  const parts = FOOD_GROUP_KEYS.filter(k => groups[k] > 0).map(k => `${GROUP_LABELS[k]} ${groups[k]}`);
  return parts.length ? parts.join(' · ') : 'none';
}

function toMacros(values, multiplier = 1) {
  return Object.fromEntries(MACRO_FIELDS.map(({ key }) => {
    const n = Number(values[key]);
    return [key, Number.isFinite(n) && n >= 0 ? Math.round(n * multiplier) : 0];
  }));
}

function MacroInputs({ values, onChange }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {MACRO_FIELDS.map(f => (
        <label key={f.key} className="block">
          <span className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-0.5">
            {f.label}
          </span>
          <span className="relative block">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              className="input text-sm px-2 py-1.5 pr-8"
              value={values[f.key] ?? ''}
              onChange={e => onChange(f.key, e.target.value)}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 pointer-events-none">
              {f.unit}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

export default function MealLogger({ timeBlock, meals, onAdd, onRemove, onUpdate }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // { description, original: macros, groups, fromCache, breakdown } while confirming
  const [pending, setPending] = useState(null);
  const [edits, setEdits] = useState({});    // macro field → string, editable
  const [portion, setPortion] = useState(1);
  const [error, setError] = useState('');
  const savedMeals = useSavedMeals();
  const [justSaved, setJustSaved] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  // Editing a meal that's already logged: { id, values: macro field → string }
  const [editing, setEditing] = useState(null);
  const wrapperRef = useRef(null);

  const blockMeals = meals.filter(m => m.timeBlock === timeBlock);

  const filteredMeals = savedMeals.filter(m =>
    !input.trim() || m.description.toLowerCase().includes(input.trim().toLowerCase())
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (!wrapperRef.current?.contains(e.target)) setDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Analyze ─────────────────────────────────────────────────────────────────

  async function handleAnalyze() {
    const desc = input.trim();
    if (!desc) return;
    setError('');
    setLoading(true);
    setPending(null);
    setDropdownOpen(false);
    try {
      const result = await parseMealMacros(desc);
      const original = toMacros(result);
      setPending({ description: desc, original, groups: result.groups || null, fromCache: result.fromCache, breakdown: result.breakdown || [] });
      setEdits(Object.fromEntries(MACRO_FIELDS.map(({ key }) => [key, String(original[key])])));
      setPortion(1);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Confirm / discard analyzed result ───────────────────────────────────────

  // The meal as it will be logged: edited values × portion
  function finalMeal() {
    const perServing = toMacros(edits);
    // Remember hand corrections (per serving) for next time this is typed
    if (MACRO_FIELDS.some(({ key }) => perServing[key] !== pending.original[key])) {
      saveMealCorrection(pending.description, perServing, pending.groups || undefined);
    }
    return {
      description: portion === 1 ? pending.description : `${pending.description} (×${portion})`,
      macros: toMacros(perServing, portion),
      // Meals without an estimate leave `groups` off, so the day's food
      // quality shows as incomplete rather than assuming zero servings
      ...(pending.groups ? { groups: scaleGroups(pending.groups, portion) } : {}),
    };
  }

  function reset() {
    setPending(null);
    setInput('');
    setError('');
  }

  function handleConfirm() {
    if (!pending) return;
    onAdd({ timeBlock, ...finalMeal() });
    reset();
  }

  function handleDiscard() {
    reset();
  }

  // ── Save as favourite (+ add to log) ────────────────────────────────────────

  function handleSaveAndAdd() {
    if (!pending) return;
    const meal = finalMeal();
    storage.saveFavoriteMeal(meal);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
    onAdd({ timeBlock, ...meal });
    reset();
  }

  // ── Quick-add from saved meals ───────────────────────────────────────────────

  function handleQuickAdd(fav) {
    onAdd({ timeBlock, description: fav.description, macros: fav.macros, ...(fav.groups ? { groups: fav.groups } : {}) });
    setInput('');
    setDropdownOpen(false);
  }

  function handleRemoveFavorite(id, e) {
    e.stopPropagation();
    storage.removeFavoriteMeal(id);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !loading) handleAnalyze();
    // Escape just closes the suggestions; what you typed stays
    if (e.key === 'Escape') setDropdownOpen(false);
  }

  const shown = pending ? toMacros(edits, portion) : null;

  function startEdit(meal) {
    setEditing({
      id: meal.id,
      values: Object.fromEntries(MACRO_FIELDS.map(({ key }) => [key, String(meal.macros?.[key] ?? 0)])),
    });
  }

  function saveEdit() {
    onUpdate(editing.id, { macros: toMacros(editing.values) });
    setEditing(null);
  }

  return (
    <div className="space-y-2">
      {/* ── Logged meals ───────────────────────────────────────────────────── */}
      {blockMeals.map(meal => (
        editing?.id === meal.id ? (
          <div key={meal.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
            <p className="text-sm text-slate-800 font-medium">{meal.description}</p>
            <MacroInputs
              values={editing.values}
              onChange={(key, v) => setEditing(e => ({ ...e, values: { ...e.values, [key]: v } }))}
            />
            <div className="flex gap-2">
              <button onClick={saveEdit} className="btn-primary text-xs py-1.5 px-3">Save</button>
              <button onClick={() => setEditing(null)} className="btn-ghost text-xs py-1.5 px-3">Cancel</button>
            </div>
          </div>
        ) : (
          <div key={meal.id} className="flex items-start gap-1 group">
            <div className="flex-1 bg-slate-50 rounded-xl px-3 py-2 min-w-0">
              <p className="text-sm text-slate-800 font-medium">{meal.description}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                P: {meal.macros?.protein ?? '–'}g &nbsp;·&nbsp;
                F: {meal.macros?.fat ?? '–'}g &nbsp;·&nbsp;
                C: {meal.macros?.carbs ?? '–'}g &nbsp;·&nbsp;
                {meal.macros?.calories ?? '–'} kcal
              </p>
            </div>
            {onUpdate && (
              <button
                onClick={() => startEdit(meal)}
                className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors px-2 rounded-lg min-h-[44px]"
                aria-label={`Edit ${meal.description}`}
              >
                Edit
              </button>
            )}
            <button
              onClick={() => onRemove(meal.id)}
              className="text-slate-500 hover:text-red-500 transition-colors p-2 rounded-lg min-w-[44px] min-h-[44px]"
              aria-label={`Remove ${meal.description}`}
              title="Remove"
            >
              ✕
            </button>
          </div>
        )
      ))}

      {/* ── Pending confirmation card ──────────────────────────────────────── */}
      {pending && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 space-y-3">
          <div className="flex justify-between items-start">
            <p className="text-sm font-medium text-slate-800">{pending.description}</p>
            {pending.fromCache && (
              <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full ml-2 shrink-0">
                saved estimate
              </span>
            )}
          </div>
          {pending.breakdown.length > 0 && (
            <ul className="text-xs text-slate-500 space-y-0.5 pl-1">
              {pending.breakdown.map((item, i) => (
                <li key={i}>
                  {item.item} — P:{item.protein}g F:{item.fat}g C:{item.carbs}g
                </li>
              ))}
            </ul>
          )}

          {/* Editable estimate (per serving) */}
          <div>
            <p className="text-xs text-slate-600 mb-1">Per serving — fix anything that looks off:</p>
            <MacroInputs
              values={edits}
              onChange={(key, v) => setEdits(e => ({ ...e, [key]: v }))}
            />
          </div>

          {/* Portion */}
          <div className="flex items-center gap-1.5" role="group" aria-label="Portion">
            <span className="text-xs text-slate-600 mr-1">Portion</span>
            {PORTIONS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPortion(p)}
                aria-pressed={portion === p}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  portion === p
                    ? 'bg-brand-700 text-white border-brand-700'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {p}×
              </button>
            ))}
          </div>

          <p className="text-xs font-semibold text-brand-700">
            Total: {shown.protein}g P · {shown.fat}g F · {shown.carbs}g C · {shown.calories} kcal
          </p>
          <p className="text-xs text-slate-600">
            {pending.groups
              ? <>Food groups (estimate): {describeGroups(scaleGroups(pending.groups, portion))}</>
              : <>No food-group estimate for this one — you can set servings for the day below.</>}
          </p>

          <div className="flex flex-wrap gap-2">
            <button onClick={handleConfirm} className="btn-primary text-xs py-1.5 px-3">
              Add to log
            </button>
            <button
              onClick={handleSaveAndAdd}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
            >
              ⭐ Save & Add
            </button>
            <button onClick={handleDiscard} className="btn-ghost text-xs py-1.5 px-3">
              Discard
            </button>
          </div>
        </div>
      )}

      {justSaved && (
        <p className="text-xs text-brand-700" role="status">✓ Saved to your meals</p>
      )}

      {/* ── Input row with saved-meals dropdown ─────────────────────────────── */}
      {!pending && (
        <div ref={wrapperRef} className="relative">
          <div className="flex gap-2">
            <input
              className="input text-sm"
              placeholder={savedMeals.length > 0 ? 'Select a saved meal or type a new one…' : 'Describe a meal or food (press Enter)'}
              aria-label="Describe a meal or pick a saved one"
              value={input}
              onChange={e => { setInput(e.target.value); setDropdownOpen(true); }}
              onFocus={() => { if (savedMeals.length > 0) setDropdownOpen(true); }}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              onClick={handleAnalyze}
              disabled={loading || !input.trim()}
              className="btn-primary shrink-0 text-xs px-3"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-label="Analyzing" />
              ) : 'Analyze'}
            </button>
          </div>

          {/* Saved meals dropdown table */}
          {dropdownOpen && filteredMeals.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
              <div className="overflow-y-auto max-h-52">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-3 py-2 text-slate-600 font-medium">Meal</th>
                      <th className="text-right px-2 py-2 text-slate-600 font-medium">P</th>
                      <th className="text-right px-2 py-2 text-slate-600 font-medium">F</th>
                      <th className="text-right px-2 py-2 text-slate-600 font-medium">C</th>
                      <th className="text-right px-2 py-2 text-slate-600 font-medium">kcal</th>
                      <th className="w-6"><span className="sr-only">Delete</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMeals.map((fav, i) => (
                      <tr
                        key={fav.id}
                        tabIndex={0}
                        aria-label={`Add ${fav.description}`}
                        className={`cursor-pointer hover:bg-amber-50 focus:bg-amber-50 transition-colors ${i < filteredMeals.length - 1 ? 'border-b border-slate-50' : ''}`}
                        onClick={() => handleQuickAdd(fav)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleQuickAdd(fav); }
                        }}
                      >
                        <td className="px-3 py-2 text-slate-800 font-medium">
                          <span className="block max-w-[180px] truncate">{fav.description}</span>
                        </td>
                        <td className="px-2 py-2 text-right text-slate-600 tabular-nums">{fav.macros.protein}g</td>
                        <td className="px-2 py-2 text-right text-slate-600 tabular-nums">{fav.macros.fat}g</td>
                        <td className="px-2 py-2 text-right text-slate-600 tabular-nums">{fav.macros.carbs}g</td>
                        <td className="px-2 py-2 text-right text-slate-600 tabular-nums">{fav.macros.calories}</td>
                        <td className="px-2 py-2">
                          <button
                            onClick={e => handleRemoveFavorite(fav.id, e)}
                            className="text-slate-500 hover:text-red-500 transition-colors leading-none p-2 -m-2"
                            aria-label={`Delete saved meal ${fav.description}`}
                            title="Delete saved meal"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-lg" role="alert">{error}</p>
      )}
    </div>
  );
}
