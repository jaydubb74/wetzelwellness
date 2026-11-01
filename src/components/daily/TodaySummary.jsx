import { macroTotals, varianceBand } from '../../utils/scoring.js';

const BAND_STROKE = { green: 'text-brand-500', yellow: 'text-amber-400', red: 'text-red-400' };

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Ring({ label, value, sub, pct, color, description }) {
  const filled = Math.max(0, Math.min(pct, 1)) * CIRCUMFERENCE;
  return (
    <div className="flex flex-col items-center text-center min-w-0" role="img" aria-label={`${label}: ${description}`}>
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90" aria-hidden="true">
          <circle cx="32" cy="32" r={RADIUS} fill="none" strokeWidth="6" stroke="currentColor" className="text-slate-100" />
          <circle
            cx="32" cy="32" r={RADIUS} fill="none" strokeWidth="6" stroke="currentColor"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
            className={`${color} transition-[stroke-dasharray] duration-500`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-slate-900 tabular-nums">
          {value}
        </span>
      </div>
      <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mt-1.5 truncate w-full">{label}</p>
      {sub && <p className="text-[11px] text-slate-500 truncate w-full">{sub}</p>}
    </div>
  );
}

function ScorePill({ label, score }) {
  if (score == null) return null;
  const tone =
    score >= 85 ? 'bg-brand-50 text-brand-700 border-brand-200'
    : score >= 70 ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-rose-50 text-rose-600 border-rose-200';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${tone}`}>
      {label} <span className="font-semibold tabular-nums">{score}</span>
    </span>
  );
}

/**
 * At-a-glance status for one day: protein, supplements, water, and this
 * week's exercise as rings, plus Oura sleep/readiness scores when present.
 * `targets` are the day's goals (scoring.targetsFor); `final` is true for
 * past days, when protein is judged against the variance bands.
 */
export default function TodaySummary({ log, targets, final, weekExercise, oura }) {
  const protein = macroTotals(log.meals).protein;
  const proteinTarget = targets.macroTargets.protein;
  const band = varianceBand(protein, proteinTarget);
  const proteinColor = band && (final || protein > proteinTarget) ? BAND_STROKE[band.band] : 'text-brand-500';

  const supps = targets.supplements;
  const suppsTaken = supps.filter(s => log.supplements?.[s.id]).length;

  const water = log.water || 0;
  const exerciseScore = weekExercise.score;

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-sm font-semibold text-slate-900">{final ? 'Day summary' : 'Today'}</h2>
        <div className="flex gap-1.5">
          <ScorePill label="Sleep" score={oura?.sleep?.score} />
          <ScorePill label="Readiness" score={oura?.readiness?.score} />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Ring
          label="Protein"
          value={`${protein}g`}
          sub={`of ${proteinTarget}g`}
          pct={proteinTarget > 0 ? protein / proteinTarget : 0}
          color={proteinColor}
          description={`${protein} of ${proteinTarget} grams`}
        />
        <Ring
          label="Supps"
          value={`${suppsTaken}/${supps.length}`}
          sub="taken"
          pct={supps.length ? suppsTaken / supps.length : 0}
          color={suppsTaken === supps.length ? 'text-brand-500' : 'text-amber-400'}
          description={`${suppsTaken} of ${supps.length} supplements taken`}
        />
        <Ring
          label="Water"
          value={`${water}/${targets.waterTarget}`}
          sub="glasses"
          pct={targets.waterTarget > 0 ? water / targets.waterTarget : 0}
          color="text-sky-400"
          description={`${water} of ${targets.waterTarget} glasses`}
        />
        <Ring
          label="Exercise"
          value={exerciseScore == null ? '–' : `${exerciseScore}%`}
          sub="this week"
          pct={(exerciseScore || 0) / 100}
          color="text-violet-400"
          description={exerciseScore == null ? 'nothing logged this week' : `${exerciseScore}% of weekly goals`}
        />
      </div>
    </div>
  );
}
