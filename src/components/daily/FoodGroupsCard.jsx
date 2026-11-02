import { HEALTH_SCORE_CONFIG, foodGroupServings } from '../../utils/healthScore.js';

const STEP = 0.5;

/**
 * The day's servings for each food group you've set a target for, added up
 * from the AI estimates on your meals. +/− adjusts a group on top of those
 * estimates, so meals logged later still count.
 */
export default function FoodGroupsCard({ log, targets, estimates, onAdjust }) {
  const groups = HEALTH_SCORE_CONFIG.foodGroups.filter(g => targets.foodGroupTargets?.[g.key] > 0);
  if (!groups.length) return null;

  const { servings, adjusted, unestimated } = foodGroupServings(log);
  const legacyTotals = !!log.foodGroups;

  function adjust(key, delta) {
    const current = servings[key] || 0;
    const next = Math.max(0, Math.round((current + delta) * 2) / 2);
    // Older days stored totals outright; turn those into adjustments first
    const base = legacyTotals
      ? Object.fromEntries(Object.entries(log.foodGroups).map(([k, v]) => [k, v - mealTotal(log.meals, k)]))
      : (log.foodGroupAdjust || {});
    onAdjust({ ...base, [key]: (base[key] || 0) + (next - current) });
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Food groups</h3>
        {adjusted ? (
          <button onClick={() => onAdjust(null)} className="text-xs font-medium text-brand-700 hover:text-brand-600">
            Undo adjustments
          </button>
        ) : (
          <span className="text-[11px] text-slate-500">Filled in from your meals</span>
        )}
      </div>

      {estimates.estimating > 0 ? (
        <p className="text-xs text-slate-500" aria-live="polite">
          Estimating food groups for {unestimated || estimates.estimating} meal{(unestimated || estimates.estimating) === 1 ? '' : 's'}…
        </p>
      ) : unestimated > 0 && (
        <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 flex items-start justify-between gap-2">
          <span>
            Couldn’t estimate {unestimated} meal{unestimated === 1 ? '' : 's'}
            {estimates.error ? ` — ${estimates.error}` : ''}
          </span>
          <button onClick={estimates.retry} className="font-medium text-brand-700 hover:text-brand-600 shrink-0">
            Try again
          </button>
        </div>
      )}

      <div className="space-y-2">
        {groups.map(g => {
          const value = servings[g.key] || 0;
          const target = targets.foodGroupTargets[g.key];
          return (
            <div key={g.key} className="flex items-center gap-2">
              <span className="text-sm text-slate-700 flex-1">{g.label}</span>
              <button
                onClick={() => adjust(g.key, -STEP)}
                aria-label={`One half serving less ${g.label.toLowerCase()}`}
                className="w-10 h-10 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-base font-medium"
              >−</button>
              <span className="w-16 text-center text-sm font-semibold text-slate-800 tabular-nums" aria-live="polite">
                {value} / {target}
              </span>
              <button
                onClick={() => adjust(g.key, STEP)}
                aria-label={`One half serving more ${g.label.toLowerCase()}`}
                className="w-10 h-10 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-base font-medium"
              >+</button>
            </div>
          );
        })}
      </div>
      {adjusted && (
        <p className="text-[11px] text-slate-500">Includes your adjustments — meals you log later still add to these.</p>
      )}
    </div>
  );
}

function mealTotal(meals, key) {
  return (meals || []).reduce((sum, m) => sum + (m.groups?.[key] || 0), 0);
}
