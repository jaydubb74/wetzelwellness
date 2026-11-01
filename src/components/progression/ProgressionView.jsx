import { useState, useMemo } from 'react';
import { today, getWeekDates, getMonthDates, offsetDate, offsetMonth, weekLabel, monthLabel, formatShort, formatFull } from '../../utils/dates.js';
import { useCompliance } from '../../hooks/useCompliance.js';
import * as storage from '../../services/storage.js';
import { EXERCISE_GOALS, formatVariance, scorePeriod } from '../../utils/scoring.js';

const BAND_TEXT = { green: 'text-brand-600', yellow: 'text-amber-600', red: 'text-red-500' };

// `detail` spells out what the percentage counts, e.g. "1 of 5 logged days".
function ComplianceCard({ label, icon, pct, detail, description }) {
  if (pct === null) {
    return (
      <div className="card-sm text-center">
        <p className="text-lg mb-1">{icon}</p>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-300 mt-1">–</p>
        <p className="text-xs text-slate-400 mt-0.5">No data yet</p>
      </div>
    );
  }

  const color = pct >= 80 ? 'text-brand-600' : pct >= 50 ? 'text-amber-500' : 'text-red-500';
  const barColor = pct >= 80 ? 'bg-brand-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';

  return (
    <div className="card-sm text-center">
      <p className="text-lg mb-1">{icon}</p>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{pct}%</p>
      {detail && <p className="text-xs font-medium text-slate-600 mt-0.5">{detail}</p>}
      <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full macro-bar ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {description && <p className="text-[11px] text-slate-400 mt-1.5">{description}</p>}
    </div>
  );
}

function DotLegend() {
  return (
    <div className="flex items-center gap-3 text-xs text-slate-400">
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-brand-500 inline-block"/>Good (≥80%)</span>
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"/>Partial</span>
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block"/>Missed</span>
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-200 inline-block"/>No log</span>
    </div>
  );
}

function CalendarGrid({ dates, daily, onSelect, selectedDate, onNavigateToDate }) {
  const tod = today();

  return (
    <div>
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-slate-400 py-1">{d}</div>
        ))}
      </div>

      {/* Fill empty days at the start of the month */}
      {(() => {
        const firstDay = new Date(dates[0] + 'T00:00:00').getDay();
        const cells = [];
        for (let i = 0; i < firstDay; i++) cells.push(<div key={'e' + i} />);

        for (const date of dates) {
          const data = daily[date];
          let dotColor = 'bg-slate-200';
          if (data) {
            const avg = (data.protein.score + data.supplements + data.hydration) / 3;
            dotColor = avg >= 0.8 ? 'bg-brand-500' : avg >= 0.5 ? 'bg-amber-400' : 'bg-red-400';
          }

          const isToday = date === tod;
          const isSelected = date === selectedDate;

          cells.push(
            <button
              key={date}
              onClick={() => {
                onSelect(date);
                if (onNavigateToDate) onNavigateToDate(date);
              }}
              className={`
                flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition-colors
                ${isSelected ? 'bg-brand-50 ring-1 ring-brand-300' : 'hover:bg-slate-50'}
              `}
              title={`Open ${date} in Daily view`}
            >
              <span className={`text-[11px] font-medium ${isToday ? 'text-brand-600' : 'text-slate-600'}`}>
                {new Date(date + 'T00:00:00').getDate()}
              </span>
              <span className={`w-2 h-2 rounded-full ${dotColor}`} />
            </button>
          );
        }

        return (
          <div className="grid grid-cols-7 gap-1">
            {cells}
          </div>
        );
      })()}
    </div>
  );
}

// `exercise` is scoring.exerciseForRange output: targets are already scaled to
// the period's length (3/week → ~13 for a month).
function ExerciseProgress({ goals, exercise }) {
  const categories = [
    { id: 'zone2',    icon: '🚴', label: 'Zone 2' },
    { id: 'hiit',     icon: '⚡', label: 'HIIT' },
    { id: 'strength', icon: '🏋️', label: 'Strength' },
  ];

  return (
    <div className="space-y-2.5">
      {categories.map(cat => {
        const goal = goals[cat.id];
        const exact = exercise.targets[cat.id];
        if (!goal || !exact) return null;
        const count = exercise.counts[cat.id] || 0;
        const target = Math.max(1, Math.round(exact));
        const met = count >= exact;

        return (
          <div key={cat.id} className="flex items-center gap-3">
            <span className="text-base w-6 text-center">{cat.icon}</span>
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600 font-medium">{goal.label}</span>
                <span className={met ? 'text-brand-600 font-semibold' : 'text-slate-500'}>
                  {count}/{target} {met ? '✓' : ''}
                </span>
              </div>
              {target <= 7 ? (
                <div className="flex gap-1">
                  {Array.from({ length: target }, (_, i) => (
                    <div
                      key={i}
                      className={`h-2 flex-1 rounded-full ${i < count ? (met ? 'bg-brand-500' : 'bg-amber-400') : 'bg-slate-200'}`}
                    />
                  ))}
                </div>
              ) : (
                // Too many sessions for one segment each (month view)
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${met ? 'bg-brand-500' : 'bg-amber-400'}`}
                    style={{ width: `${Math.min(count / exact, 1) * 100}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function downloadWeekReport(anchor, settings) {
  const dates = getWeekDates(anchor);
  const logs = storage.getAllLogs();
  const { daily, tracked, summary, exercise } = scorePeriod(dates, logs, settings);
  const label = weekLabel(anchor);

  const lines = [
    `# Wetzel Wellness — Weekly Report`,
    `## ${label}`,
    `Generated: ${formatFull(today())}`,
    ``,
  ];

  // Weekly overview
  const pct = (v) => (v == null ? 'N/A' : `${v}%`);
  const goals = settings.exerciseGoals;

  lines.push(`## Weekly Overview (${tracked}/7 days logged)`);
  lines.push(`- Nutrition compliance: ${pct(summary.nutrition)} (protein within ±10% of target)`);
  lines.push(`- Supplement compliance: ${pct(summary.supplements)}`);
  lines.push(`- Hydration compliance: ${pct(summary.hydration)} (≥80% of water target)`);
  for (const k of EXERCISE_GOALS) {
    lines.push(`- ${goals[k]?.label ?? k}: ${exercise.counts[k]}/${Math.round(exercise.targets[k])} sessions`);
  }
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // Day-by-day
  lines.push(`## Day-by-Day Breakdown`);
  lines.push(``);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  for (const date of dates) {
    const d = new Date(date + 'T00:00:00');
    const dayName = dayNames[d.getDay()];
    lines.push(`### ${dayName}, ${formatShort(date)}`);

    const log = logs[date];
    const day = daily[date];
    if (!day) {
      lines.push(`_Nothing logged_`);
      lines.push(``);
      continue;
    }

    // Nutrition — against the goals that applied that day
    const { protein, totals, targets } = day;
    const meals = log.meals || [];
    lines.push(`**Nutrition:** protein ${protein.band ? `${formatVariance(protein.variance)} (${protein.band})` : 'no target'}`);
    lines.push(`- Protein: ${Math.round(totals.protein)}g / ${targets.macroTargets.protein}g`);
    lines.push(`- Fat: ${Math.round(totals.fat)}g / ${targets.macroTargets.fat}g`);
    lines.push(`- Carbs: ${Math.round(totals.carbs)}g / ${targets.macroTargets.carbs}g`);
    lines.push(`- Calories: ${Math.round(totals.calories)} / ${targets.macroTargets.calories}`);
    if (meals.length > 0) {
      lines.push(`- Meals logged: ${meals.map(m => m.description).join(', ')}`);
    }

    // Supplements
    const supps = targets.supplements;
    const checkedCount = supps.filter(s => log.supplements?.[s.id]).length;
    const missedNames = supps.filter(s => !log.supplements?.[s.id]).map(s => s.name);
    lines.push(`**Supplements:** ${Math.round(day.supplements * 100)}% (${checkedCount}/${supps.length})`);
    if (missedNames.length > 0) lines.push(`- Missed: ${missedNames.join(', ')}`);

    // Hydration
    const water = log.water || 0;
    const waterPct = targets.waterTarget > 0 ? Math.round((water / targets.waterTarget) * 100) : 100;
    lines.push(`**Hydration:** ${waterPct}% — ${water}/${targets.waterTarget} glasses${log.electrolytes ? ' + electrolytes ✓' : ''}`);

    // Exercise
    const exercises = log.exercises || [];
    if (exercises.length > 0) {
      lines.push(`**Exercise:** ${exercises.map(e => `${e.type || e.category}${e.duration ? ` (${e.duration} min)` : ''}`).join(', ')}`);
    } else {
      lines.push(`**Exercise:** Rest day`);
    }

    // Oura
    const sleepScore = log.oura?.sleep?.score;
    const readinessScore = log.oura?.readiness?.score;
    if (sleepScore != null || readinessScore != null) {
      lines.push(`**Oura:** sleep ${sleepScore ?? '–'} · readiness ${readinessScore ?? '–'}`);
    }

    lines.push(``);
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wellness-week-${dates[0]}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProgressionView({ settings, onNavigateToDate }) {
  const [period, setPeriod] = useState('week'); // 'week' | 'month'
  const [anchor, setAnchor] = useState(today());
  const [selectedDate, setSelectedDate] = useState(today());

  const dates = useMemo(() => {
    return period === 'week' ? getWeekDates(anchor) : getMonthDates(anchor);
  }, [period, anchor]);

  const { daily, summary, met, exercise, tracked } = useCompliance(dates, settings);
  // What the day-based percentages count: days that hit the goal, out of days logged
  const days = n => `${n} of ${tracked} logged day${tracked === 1 ? '' : 's'}`;

  const periodLabel = period === 'week' ? weekLabel(anchor) : monthLabel(anchor);

  function prev() {
    setAnchor(a => period === 'week' ? offsetDate(a, -7) : offsetMonth(a, -1));
  }
  function next() {
    setAnchor(a => period === 'week' ? offsetDate(a, 7) : offsetMonth(a, 1));
  }

  return (
    <div className="space-y-4">
      {/* Period controls */}
      <div className="flex items-center justify-between">
        <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden text-sm">
          {['week', 'month'].map(p => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setAnchor(today()); }}
              className={`px-4 py-2 font-medium capitalize transition-colors ${
                period === p ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={prev} className="btn-ghost px-2">←</button>
          <span className="text-xs text-slate-600 font-medium min-w-[120px] text-center">{periodLabel}</span>
          <button onClick={next} className="btn-ghost px-2">→</button>
        </div>
      </div>

      {/* Compliance cards */}
      <div className="grid grid-cols-2 gap-3">
        <ComplianceCard
          label="Nutrition"
          icon="🥗"
          pct={summary.nutrition}
          detail={days(met.nutrition)}
          description="Protein within ±10% of goal"
        />
        <ComplianceCard
          label="Supplements"
          icon="💊"
          pct={summary.supplements}
          detail={days(met.supplements)}
          description="Took at least 80% of the list"
        />
        <ComplianceCard
          label="Hydration"
          icon="💧"
          pct={summary.hydration}
          detail={days(met.hydration)}
          description="Drank at least 80% of the water goal"
        />
        <ComplianceCard
          label="Exercise"
          icon="🏋️"
          pct={summary.exercise}
          detail="avg. progress toward goals"
          description="Per-goal breakdown below"
        />
      </div>

      {tracked === 0 && (
        <div className="card text-center py-8 text-slate-400">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-sm">No logs found for this period.</p>
          <p className="text-xs mt-1">Start logging on the Daily tab to see your compliance here.</p>
        </div>
      )}

      {/* Calendar heatmap */}
      {tracked > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-800">Daily Heatmap</h3>
            <div className="flex items-center gap-2">
              {period === 'week' && (
                <button
                  onClick={() => downloadWeekReport(anchor, settings)}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
                  title="Download week summary as text file"
                >
                  ↓ Week Report
                </button>
              )}
              <DotLegend />
            </div>
          </div>
          <CalendarGrid
            dates={dates}
            daily={daily}
            onSelect={setSelectedDate}
            selectedDate={selectedDate}
            onNavigateToDate={onNavigateToDate}
          />

          {/* Selected day detail */}
          {daily[selectedDate] && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                {formatShort(selectedDate)}
              </p>
              <div className="flex gap-4">
                {(() => {
                  const { protein } = daily[selectedDate];
                  return (
                    <div className="text-center">
                      <p className={`text-lg font-bold ${BAND_TEXT[protein.band] || 'text-slate-400'}`}>
                        {protein.band ? formatVariance(protein.variance) : '–'}
                      </p>
                      <p className="text-[11px] text-slate-400">Protein</p>
                    </div>
                  );
                })()}
                {[
                  { label: 'Supplements',  value: daily[selectedDate].supplements,  color: 'text-sky-600' },
                  { label: 'Hydration',    value: daily[selectedDate].hydration,    color: 'text-amber-600' },
                ].map(item => (
                  <div key={item.label} className="text-center">
                    <p className={`text-lg font-bold ${item.color}`}>{Math.round(item.value * 100)}%</p>
                    <p className="text-[11px] text-slate-400">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Exercise progress for viewed period */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800">{period === 'week' ? "This Week's Exercise" : "Month Exercise"}</h3>
          <span className="text-xs text-slate-400">{periodLabel}</span>
        </div>
        <ExerciseProgress goals={settings.exerciseGoals} exercise={exercise} />
      </div>
    </div>
  );
}
