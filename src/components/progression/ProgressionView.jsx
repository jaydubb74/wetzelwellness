import { useState, useMemo } from 'react';
import { today, getWeekDates, getMonthDates, offsetDate, offsetMonth, weekLabel, monthLabel, formatShort, formatFull } from '../../utils/dates.js';
import { useCompliance } from '../../hooks/useCompliance.js';
import * as storage from '../../services/storage.js';

function ComplianceCard({ label, icon, pct, description }) {
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
            const avg = (data.nutrition + data.supplements + data.hydration) / 3;
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

function ExerciseProgress({ goals, weekCounts }) {
  const categories = [
    { id: 'zone2',    icon: '🚴', label: 'Zone 2' },
    { id: 'hiit',     icon: '⚡', label: 'HIIT' },
    { id: 'strength', icon: '🏋️', label: 'Strength' },
  ];

  return (
    <div className="space-y-2.5">
      {categories.map(cat => {
        const goal = goals[cat.id];
        if (!goal) return null;
        const count = weekCounts[cat.id] || 0;
        const target = goal.target;
        const met = count >= target;

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
              <div className="flex gap-1">
                {Array.from({ length: target }, (_, i) => (
                  <div
                    key={i}
                    className={`h-2 flex-1 rounded-full ${i < count ? (met ? 'bg-brand-500' : 'bg-amber-400') : 'bg-slate-200'}`}
                  />
                ))}
              </div>
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
  const activeSupps = (settings.supplements || []).filter(s => s.active);
  const label = weekLabel(anchor);

  const lines = [
    `# Wetzel Wellness — Weekly Report`,
    `## ${label}`,
    `Generated: ${formatFull(today())}`,
    ``,
  ];

  // Weekly overview
  let nutritionMet = 0, suppsMet = 0, hydrationMet = 0, tracked = 0;
  const exerciseCounts = { zone2: 0, hiit: 0, strength: 0 };

  for (const date of dates) {
    const log = logs[date];
    if (!log) continue;
    tracked++;
    const protein = (log.meals || []).reduce((s, m) => s + (m.macros?.protein || 0), 0);
    const nutritionScore = settings.macroTargets.protein > 0 ? protein / settings.macroTargets.protein : 0;
    const checkedCount = activeSupps.filter(s => log.supplements?.[s.id]).length;
    const suppScore = activeSupps.length > 0 ? checkedCount / activeSupps.length : 1;
    const hydrationScore = settings.waterTarget > 0 ? Math.min((log.water || 0) / settings.waterTarget, 1) : 1;
    if (nutritionScore >= 0.8) nutritionMet++;
    if (suppScore >= 0.8) suppsMet++;
    if (hydrationScore >= 0.8) hydrationMet++;
    for (const ex of log.exercises || []) {
      if (ex.category in exerciseCounts) exerciseCounts[ex.category]++;
    }
  }

  const pct = (n) => tracked > 0 ? `${Math.round((n / tracked) * 100)}%` : 'N/A';
  const goals = settings.exerciseGoals;

  lines.push(`## Weekly Overview (${tracked}/7 days logged)`);
  lines.push(`- Nutrition compliance: ${pct(nutritionMet)} (protein ≥80% target)`);
  lines.push(`- Supplement compliance: ${pct(suppsMet)}`);
  lines.push(`- Hydration compliance: ${pct(hydrationMet)} (≥${settings.waterTarget} glasses)`);
  lines.push(`- Zone 2 Cardio: ${exerciseCounts.zone2}/${goals.zone2?.target ?? 3} sessions`);
  lines.push(`- HIIT: ${exerciseCounts.hiit}/${goals.hiit?.target ?? 3} sessions`);
  lines.push(`- Strength Training: ${exerciseCounts.strength}/${goals.strength?.target ?? 3} sessions`);
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
    if (!log) {
      lines.push(`_No log recorded_`);
      lines.push(``);
      continue;
    }

    // Nutrition
    const meals = log.meals || [];
    const totals = meals.reduce((acc, m) => ({
      protein: acc.protein + (m.macros?.protein || 0),
      fat: acc.fat + (m.macros?.fat || 0),
      carbs: acc.carbs + (m.macros?.carbs || 0),
      calories: acc.calories + (m.macros?.calories || 0),
    }), { protein: 0, fat: 0, carbs: 0, calories: 0 });

    const proteinPct = settings.macroTargets.protein > 0
      ? Math.round((totals.protein / settings.macroTargets.protein) * 100)
      : 0;
    lines.push(`**Nutrition:** ${proteinPct}% protein target`);
    lines.push(`- Protein: ${Math.round(totals.protein)}g / ${settings.macroTargets.protein}g`);
    lines.push(`- Fat: ${Math.round(totals.fat)}g / ${settings.macroTargets.fat}g`);
    lines.push(`- Carbs: ${Math.round(totals.carbs)}g / ${settings.macroTargets.carbs}g`);
    lines.push(`- Calories: ${Math.round(totals.calories)} / ${settings.macroTargets.calories}`);
    if (meals.length > 0) {
      lines.push(`- Meals logged: ${meals.map(m => m.description).join(', ')}`);
    }

    // Supplements
    const checkedCount = activeSupps.filter(s => log.supplements?.[s.id]).length;
    const suppPct = activeSupps.length > 0 ? Math.round((checkedCount / activeSupps.length) * 100) : 100;
    const checkedNames = activeSupps.filter(s => log.supplements?.[s.id]).map(s => s.name);
    const missedNames = activeSupps.filter(s => !log.supplements?.[s.id]).map(s => s.name);
    lines.push(`**Supplements:** ${suppPct}% (${checkedCount}/${activeSupps.length})`);
    if (missedNames.length > 0) lines.push(`- Missed: ${missedNames.join(', ')}`);

    // Hydration
    const water = log.water || 0;
    const waterPct = settings.waterTarget > 0 ? Math.round((water / settings.waterTarget) * 100) : 100;
    lines.push(`**Hydration:** ${waterPct}% — ${water}/${settings.waterTarget} glasses${log.electrolytes ? ' + electrolytes ✓' : ''}`);

    // Exercise
    const exercises = log.exercises || [];
    if (exercises.length > 0) {
      lines.push(`**Exercise:** ${exercises.map(e => `${e.type || e.category}${e.duration ? ` (${e.duration} min)` : ''}`).join(', ')}`);
    } else {
      lines.push(`**Exercise:** Rest day`);
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

  const { daily, summary, weeklyExercise, tracked } = useCompliance(dates, settings);

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
          description="Protein ≥80% of target"
        />
        <ComplianceCard
          label="Supplements"
          icon="💊"
          pct={summary.supplements}
          description="≥80% of daily list"
        />
        <ComplianceCard
          label="Hydration"
          icon="💧"
          pct={summary.hydration}
          description={`≥80% of ${settings.waterTarget} glasses`}
        />
        <ComplianceCard
          label="Exercise"
          icon="🏋️"
          pct={summary.exercise}
          description="All weekly targets met"
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
                {[
                  { label: 'Nutrition',    value: daily[selectedDate].nutrition,    color: 'text-brand-600' },
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
        <ExerciseProgress goals={settings.exerciseGoals} weekCounts={weeklyExercise} />
      </div>
    </div>
  );
}
