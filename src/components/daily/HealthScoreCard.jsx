import { useState } from 'react';

const STATUS_LABEL = { final: 'Final', provisional: 'Provisional', incomplete: 'Incomplete' };

const fmt = points => (points == null ? '—' : points.toFixed(1));

function StatusTag({ status }) {
  const tone = status === 'incomplete'
    ? 'bg-slate-100 text-slate-600 border-slate-200'
    : status === 'provisional'
      ? 'bg-sky-50 text-sky-700 border-slate-200'
      : 'bg-white text-slate-600 border-slate-200';
  return (
    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full border ${tone}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function summaryLine(day) {
  if (day.status === 'provisional') return "Live — today isn't over, so this can still change";
  if (day.status === 'final') return 'Final for this day';
  const missing = Object.values(day.pillars).filter(p => p.status === 'incomplete').map(p => p.label.toLowerCase());
  return `Needs ${missing.join(' and ')} to be complete`;
}

function Breakdown({ pillars }) {
  return (
    <div className="space-y-4 pt-3 border-t border-slate-100">
      {Object.values(pillars).map(p => (
        <div key={p.key}>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-semibold text-slate-800">
              {p.label} <span className="font-normal text-slate-500">· {p.weight}% of score</span>
            </p>
            <p className="text-xs text-slate-600 tabular-nums">{fmt(p.points)}</p>
          </div>
          <ul className="mt-1 space-y-1.5">
            {p.components.map(c => (
              <li key={c.key} className="text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-slate-700">
                    {c.label} <span className="text-slate-500">· {c.weight}%</span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="tabular-nums text-slate-800">{fmt(c.points)}</span>
                    <StatusTag status={c.status} />
                  </span>
                </div>
                {(c.detail || c.note) && (
                  <p className="text-slate-500 mt-0.5">{[c.detail, c.note].filter(Boolean).join(' — ')}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * The day's health-consistency score (see utils/healthScore.js): the daily
 * score, its three pillars, averages over the previous seven days, and Oura
 * Readiness shown separately as context.
 */
export default function HealthScoreCard({ day, sevenDay }) {
  const [open, setOpen] = useState(false);
  const pillars = Object.values(day.pillars);

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Health consistency</h2>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-bold text-slate-900 tabular-nums">{fmt(day.points)}</span>
            <StatusTag status={day.status} />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{summaryLine(day)}</p>
        </div>
        {day.readiness != null && (
          <div
            className="text-right bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5"
            title="Oura Readiness — recovery context, not part of the score"
          >
            <p className="text-[11px] text-slate-500 uppercase tracking-wide">Readiness</p>
            <p className="text-base font-semibold text-slate-800 tabular-nums leading-tight">{day.readiness}</p>
            <p className="text-[10px] text-slate-500">recovery context</p>
          </div>
        )}
      </div>

      {/* Pillars */}
      <div className="grid grid-cols-3 gap-2">
        {pillars.map(p => (
          <div key={p.key} className="bg-slate-50 rounded-xl px-2.5 py-2 min-w-0 flex flex-col">
            <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide leading-tight">{p.label}</p>
            {/* Pinned to the bottom so values line up when a label wraps */}
            <div className="mt-auto pt-1">
              <p className="text-lg font-semibold text-slate-900 tabular-nums">{fmt(p.points)}</p>
              <p className="text-[11px] text-slate-500 truncate" title={p.note || STATUS_LABEL[p.status]}>
                {p.status === 'incomplete' ? p.note : STATUS_LABEL[p.status]}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Previous seven days */}
      <div className="text-xs text-slate-600">
        <p className="font-semibold text-slate-700 mb-1">Previous 7 days (final days only)</p>
        <div className="grid grid-cols-4 gap-2">
          {[
            { key: 'score', label: 'Score' },
            { key: 'nutrition', label: 'Nutrition' },
            { key: 'movement', label: 'Movement' },
            { key: 'sleep', label: 'Sleep' },
          ].map(({ key, label }) => (
            <div key={key} className="min-w-0">
              <p className="text-slate-500 truncate">{label}</p>
              <p className="font-semibold text-slate-800 tabular-nums">{fmt(sevenDay[key].average)}</p>
              <p className="text-[11px] text-slate-500">{sevenDay[key].days} of {sevenDay[key].of} days</p>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="text-xs font-medium text-brand-700 hover:text-brand-600"
      >
        {open ? 'Hide how it’s calculated' : 'Show how it’s calculated'}
      </button>
      {open && <Breakdown pillars={day.pillars} />}

      <p className="text-[11px] text-slate-500">
        Measures consistency with the habits and targets you’ve set — not overall health.
      </p>
    </div>
  );
}
