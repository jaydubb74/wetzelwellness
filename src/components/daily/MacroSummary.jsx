import { macroTotals, varianceBand, formatVariance } from '../../utils/scoring.js';

const BAND_BAR  = { green: 'bg-brand-500',   yellow: 'bg-amber-400',   red: 'bg-red-400' };
const BAND_TEXT = { green: 'text-brand-600', yellow: 'text-amber-600', red: 'text-red-500' };

// `status` ({ band, text }) overrides the default colouring with a variance band.
function MacroBar({ label, value, target, color, status }) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const over = target > 0 && value > target;
  const barColor = status ? BAND_BAR[status.band] : over ? 'bg-amber-400' : color;
  const valueColor = status ? BAND_TEXT[status.band] : over ? 'text-amber-500' : 'text-slate-700';

  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
        <span className={`text-xs font-semibold ${valueColor}`}>
          {status && <span className="font-medium mr-1.5">{status.text}</span>}
          {value}
          <span className="text-slate-500 font-normal">/{target}g</span>
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full macro-bar ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * `final` is true for past days. While today is underway, protein below
 * target is just progress; once the day is over (or protein passes target)
 * it's shown against the ±10% / ±20% variance bands.
 */
export default function MacroSummary({ meals, targets, final = false }) {
  const totals = macroTotals(meals);
  const protein = varianceBand(totals.protein, targets.protein);
  const proteinStatus = protein && (final || totals.protein > targets.protein)
    ? { band: protein.band, text: formatVariance(protein.variance) }
    : null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Daily Macros</h2>
        <span className="text-xs text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full">
          {totals.calories} / {targets.calories} kcal
        </span>
      </div>
      <div className="space-y-2.5">
        <MacroBar label="Protein" value={totals.protein} target={targets.protein} color="bg-brand-500" status={proteinStatus} />
        <MacroBar label="Fat"     value={totals.fat}     target={targets.fat}     color="bg-sky-400"   />
        <MacroBar label="Carbs"   value={totals.carbs}   target={targets.carbs}   color="bg-amber-400" />
      </div>
    </div>
  );
}
