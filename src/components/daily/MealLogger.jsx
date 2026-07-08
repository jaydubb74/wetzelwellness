import { useState, useRef, useEffect } from 'react';
import { parseMealMacros } from '../../services/llm.js';
import * as storage from '../../services/storage.js';

export default function MealLogger({ timeBlock, meals, onAdd, onRemove }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [savedMeals, setSavedMeals] = useState(() => storage.getSavedMeals());
  const [justSaved, setJustSaved] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
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
      setPending({ description: desc, macros: result, breakdown: result.breakdown || [] });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Confirm / discard analyzed result ───────────────────────────────────────

  function handleConfirm() {
    if (!pending) return;
    onAdd({ timeBlock, description: pending.description, macros: pending.macros });
    setPending(null);
    setInput('');
    setError('');
  }

  function handleDiscard() {
    setPending(null);
    setInput('');
  }

  // ── Save as favourite (+ add to log) ────────────────────────────────────────

  function handleSaveAndAdd() {
    if (!pending) return;
    const updated = storage.saveFavoriteMeal({
      description: pending.description,
      macros: {
        protein:  pending.macros.protein,
        fat:      pending.macros.fat,
        carbs:    pending.macros.carbs,
        calories: pending.macros.calories,
      },
    });
    setSavedMeals(updated);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
    handleConfirm();
  }

  // ── Quick-add from saved meals ───────────────────────────────────────────────

  function handleQuickAdd(fav) {
    onAdd({ timeBlock, description: fav.description, macros: fav.macros });
    setInput('');
    setDropdownOpen(false);
  }

  function handleRemoveFavorite(id, e) {
    e.stopPropagation();
    const updated = storage.removeFavoriteMeal(id);
    setSavedMeals(updated);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !loading) handleAnalyze();
    if (e.key === 'Escape') { setDropdownOpen(false); handleDiscard(); }
  }

  return (
    <div className="space-y-2">
      {/* ── Logged meals ───────────────────────────────────────────────────── */}
      {blockMeals.map(meal => (
        <div key={meal.id} className="flex items-start gap-2 group">
          <div className="flex-1 bg-slate-50 rounded-xl px-3 py-2">
            <p className="text-sm text-slate-800 font-medium">{meal.description}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              P: {meal.macros?.protein ?? '–'}g &nbsp;·&nbsp;
              F: {meal.macros?.fat ?? '–'}g &nbsp;·&nbsp;
              C: {meal.macros?.carbs ?? '–'}g &nbsp;·&nbsp;
              {meal.macros?.calories ?? '–'} kcal
            </p>
          </div>
          <button
            onClick={() => onRemove(meal.id)}
            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-opacity p-1 rounded-lg"
            title="Remove"
          >
            ✕
          </button>
        </div>
      ))}

      {/* ── Pending confirmation card ──────────────────────────────────────── */}
      {pending && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 space-y-2">
          <div className="flex justify-between items-start">
            <p className="text-sm font-medium text-slate-800">{pending.description}</p>
            {pending.macros.fromCache && (
              <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full ml-2 shrink-0">
                cached
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
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs font-semibold text-brand-700">
              Total: {pending.macros.protein}g P · {pending.macros.fat}g F · {pending.macros.carbs}g C · {pending.macros.calories} kcal
            </span>
          </div>
          <div className="flex flex-wrap gap-2 pt-0.5">
            <button onClick={handleConfirm} className="btn-primary text-xs py-1.5 px-3">
              Add to log
            </button>
            <button
              onClick={handleSaveAndAdd}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
            >
              {justSaved ? '✓ Saved!' : '⭐ Save & Add'}
            </button>
            <button onClick={handleDiscard} className="btn-ghost text-xs py-1.5 px-3">
              Discard
            </button>
          </div>
        </div>
      )}

      {/* ── Input row with saved-meals dropdown ─────────────────────────────── */}
      {!pending && (
        <div ref={wrapperRef} className="relative">
          <div className="flex gap-2">
            <input
              className="input text-sm"
              placeholder={savedMeals.length > 0 ? 'Select a saved meal or type a new one…' : 'Describe a meal or food (press Enter)'}
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
                <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
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
                      <th className="text-left px-3 py-2 text-slate-500 font-medium">Meal</th>
                      <th className="text-right px-2 py-2 text-slate-500 font-medium">P</th>
                      <th className="text-right px-2 py-2 text-slate-500 font-medium">F</th>
                      <th className="text-right px-2 py-2 text-slate-500 font-medium">C</th>
                      <th className="text-right px-2 py-2 text-slate-500 font-medium">kcal</th>
                      <th className="w-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMeals.map((fav, i) => (
                      <tr
                        key={fav.id}
                        className={`cursor-pointer hover:bg-amber-50 transition-colors ${i < filteredMeals.length - 1 ? 'border-b border-slate-50' : ''}`}
                        onClick={() => handleQuickAdd(fav)}
                      >
                        <td className="px-3 py-2 text-slate-800 font-medium">
                          <span className="block max-w-[180px] truncate">{fav.description}</span>
                        </td>
                        <td className="px-2 py-2 text-right text-slate-500 tabular-nums">{fav.macros.protein}g</td>
                        <td className="px-2 py-2 text-right text-slate-500 tabular-nums">{fav.macros.fat}g</td>
                        <td className="px-2 py-2 text-right text-slate-500 tabular-nums">{fav.macros.carbs}g</td>
                        <td className="px-2 py-2 text-right text-slate-500 tabular-nums">{fav.macros.calories}</td>
                        <td className="px-2 py-2">
                          <button
                            onClick={e => handleRemoveFavorite(fav.id, e)}
                            className="text-slate-300 hover:text-red-400 transition-colors leading-none"
                            title="Remove"
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
        <p className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg">{error}</p>
      )}
    </div>
  );
}
