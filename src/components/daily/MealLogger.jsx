import { useState } from 'react';
import { parseMealMacros } from '../../services/llm.js';
import * as storage from '../../services/storage.js';

export default function MealLogger({ timeBlock, meals, onAdd, onRemove }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(null); // { description, macros, breakdown }
  const [error, setError] = useState('');
  const [savedMeals, setSavedMeals] = useState(() => storage.getSavedMeals());
  const [justSaved, setJustSaved] = useState(false);

  const blockMeals = meals.filter(m => m.timeBlock === timeBlock);

  // ── Analyze ─────────────────────────────────────────────────────────────────

  async function handleAnalyze() {
    const desc = input.trim();
    if (!desc) return;
    setError('');
    setLoading(true);
    setPending(null);
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

  // ── Quick-add from favourites ────────────────────────────────────────────────

  function handleQuickAdd(fav) {
    onAdd({ timeBlock, description: fav.description, macros: fav.macros });
  }

  function handleRemoveFavorite(id, e) {
    e.stopPropagation();
    const updated = storage.removeFavoriteMeal(id);
    setSavedMeals(updated);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !loading) handleAnalyze();
    if (e.key === 'Escape') handleDiscard();
  }

  return (
    <div className="space-y-2">
      {/* ── Favourite quick-picks ──────────────────────────────────────────── */}
      {savedMeals.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pb-0.5">
          {savedMeals.map(fav => (
            <button
              key={fav.id}
              onClick={() => handleQuickAdd(fav)}
              title={`P:${fav.macros.protein}g · F:${fav.macros.fat}g · C:${fav.macros.carbs}g · ${fav.macros.calories} kcal`}
              className="group/fav flex items-center gap-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full transition-colors"
            >
              <span>⭐</span>
              <span className="max-w-[160px] truncate">
                {fav.description}
              </span>
              <span
                role="button"
                onClick={e => handleRemoveFavorite(fav.id, e)}
                className="ml-0.5 opacity-0 group-hover/fav:opacity-100 text-amber-400 hover:text-red-400 transition-opacity leading-none"
                title="Remove favourite"
              >
                ×
              </span>
            </button>
          ))}
        </div>
      )}

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

      {/* ── Input row ──────────────────────────────────────────────────────── */}
      {!pending && (
        <div className="flex gap-2">
          <input
            className="input text-sm"
            placeholder="Describe a meal or food (press Enter)"
            value={input}
            onChange={e => setInput(e.target.value)}
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
            ) : (
              'Analyze'
            )}
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg">{error}</p>
      )}
    </div>
  );
}
