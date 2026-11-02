import { HEALTH_SCORE_CONFIG, foodGroupServings } from '../../utils/healthScore.js';

const STEP = 0.5;

/**
 * The day's servings for each food group you've set a target for. Starts
 * from the AI estimates on your meals; adjusting any group switches the day
 * to your own numbers (which you can reset).
 */
export default function FoodGroupsCard({ log, targets, onSetFoodGroups }) {
  const groups = HEALTH_SCORE_CONFIG.foodGroups.filter(g => targets.foodGroupTargets?.[g.key] > 0);
  if (!groups.length) return null;

  const { servings, source, unestimated } = foodGroupServings(log);

  function adjust(key, delta) {
    const next = Math.max(0, Math.round(((servings[key] || 0) + delta) * 2) / 2);
    onSetFoodGroups({ ...servings, [key]: next });
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Food groups</h3>
        {source === 'manual' ? (
          <button onClick={() => onSetFoodGroups(null)} className="text-xs font-medium text-brand-700 hover:text-brand-600">
            Use meal estimates
          </button>
        ) : (
          <span className="text-[11px] text-slate-500">AI estimates from meals</span>
        )}
      </div>

      {source === 'meals' && unestimated > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
          {unestimated} meal{unestimated === 1 ? ' has' : 's have'} no estimate, so food quality is incomplete.
          Adjust the servings below to set the day’s totals yourself.
        </p>
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
      {source === 'manual' && <p className="text-[11px] text-slate-500">Adjusted by you for this day.</p>}
    </div>
  );
}
