import { useState, useMemo } from 'react';
import { today, getWeekDates, getPastDays, getMonthDates, offsetDate, weekLabel, monthLabel, dayOfWeekInitial, formatShort } from '../../utils/dates.js';
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

function CalendarGrid({ dates, daily, onSelect, selectedDate }) {
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
              onClick={() => onSelect(date)}
              className={`
                flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition-colors
                ${isSelected ? 'bg-brand-50 ring-1 ring-brand-300' : 'hover:bg-slate-50'}
              `}
              title={date}
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

export default function ProgressionView({ settings }) {
  const [period, setPeriod] = useState('week'); // 'week' | 'month'
  const [anchor, setAnchor] = useState(today());
  const [selectedDate, setSelectedDate] = useState(today());

  const dates = useMemo(() => {
    return period === 'week' ? getWeekDates(anchor) : getMonthDates(anchor);
  }, [period, anchor]);

  const { daily, summary, weeklyExercise, tracked } = useCompliance(dates, settings);

  const periodLabel = period === 'week' ? weekLabel(anchor) : monthLabel(anchor);

  function prev() {
    setAnchor(a => offsetDate(a, period === 'week' ? -7 : -28));
  }
  function next() {
    setAnchor(a => offsetDate(a, period === 'week' ? 7 : 28));
    if (anchor === today()) return;
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
            <DotLegend />
          </div>
          <CalendarGrid
            dates={dates}
            daily={daily}
            onSelect={setSelectedDate}
            selectedDate={selectedDate}
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

      {/* Weekly exercise progress */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800">This Week's Exercise</h3>
          <span className="text-xs text-slate-400">{weekLabel(today())}</span>
        </div>
        <ExerciseProgress goals={settings.exerciseGoals} weekCounts={weeklyExercise} />
      </div>
    </div>
  );
}
