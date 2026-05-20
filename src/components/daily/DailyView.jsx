import { useState, useMemo } from 'react';
import { today, formatDisplay, offsetDate } from '../../utils/dates.js';
import { useDailyLog } from '../../hooks/useDailyLog.js';
import * as googleTasks from '../../services/googleTasks.js';
import * as storage from '../../services/storage.js';
import MacroSummary from './MacroSummary.jsx';
import MealLogger from './MealLogger.jsx';
import SupplementChecklist from './SupplementChecklist.jsx';
import ExerciseLogger from './ExerciseLogger.jsx';
import TimeBlock, { BlockSection } from './TimeBlock.jsx';

export default function DailyView({ settings }) {
  const [selectedDate, setSelectedDate] = useState(today());
  const [syncStatus, setSyncStatus] = useState('');

  const {
    log,
    addMeal, removeMeal,
    toggleSupplement,
    setWater, setElectrolytes,
    addExercise, removeExercise,
  } = useDailyLog(selectedDate);

  const isToday = selectedDate === today();

  // Supplements bucketed by timing
  const suppsByTiming = useMemo(() => {
    const active = (settings.supplements || []).filter(s => s.active);
    return {
      'morning-empty':     active.filter(s => s.timing === 'morning-empty'),
      'with-food-morning': active.filter(s => s.timing === 'with-food-morning'),
      afternoon:           active.filter(s => s.timing === 'afternoon'),
      nighttime:           active.filter(s => s.timing === 'nighttime'),
    };
  }, [settings.supplements]);

  // Weekly exercise counts (for progress pills in ExerciseLogger)
  const weekCounts = useMemo(() => {
    const allLogs = storage.getAllLogs();
    const counts = { zone2: 0, hiit: 0, strength: 0 };
    // Current ISO week (Sun–Sat)
    const now = new Date(selectedDate + 'T00:00:00');
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - now.getDay());
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      const ds = d.toISOString().split('T')[0];
      const l = allLogs[ds];
      if (!l) continue;
      for (const ex of l.exercises || []) {
        if (ex.category in counts) counts[ex.category]++;
      }
    }
    return counts;
  }, [selectedDate, log]); // re-compute when log changes

  async function handleSync() {
    setSyncStatus('syncing');
    try {
      await googleTasks.pushDailySummary(selectedDate, log, settings);
      setSyncStatus('done');
    } catch (e) {
      setSyncStatus('error:' + e.message);
    }
    setTimeout(() => setSyncStatus(''), 3000);
  }

  // Inject week counts into exercises array as a sentinel so ExerciseLogger can read it
  const exercisesWithMeta = [...(log.exercises || []), { _weekCounts: weekCounts }];

  return (
    <div className="space-y-4">
      {/* Date navigator */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setSelectedDate(d => offsetDate(d, -1))}
          className="btn-ghost"
        >
          ← Prev
        </button>
        <div className="text-center">
          <p className="font-semibold text-slate-900 text-sm">{formatDisplay(selectedDate)}</p>
          {!isToday && (
            <button
              onClick={() => setSelectedDate(today())}
              className="text-xs text-brand-500 hover:text-brand-600 mt-0.5"
            >
              Back to today
            </button>
          )}
        </div>
        <button
          onClick={() => setSelectedDate(d => offsetDate(d, 1))}
          disabled={isToday}
          className="btn-ghost disabled:opacity-30"
        >
          Next →
        </button>
      </div>

      {/* Macro summary */}
      <MacroSummary meals={log.meals || []} targets={settings.macroTargets} />

      {/* ── Morning ──────────────────────────────────────────────────────── */}
      <TimeBlock id="morning" defaultOpen={true}>
        {suppsByTiming['morning-empty'].length > 0 && (
          <BlockSection title="Supplements · Empty Stomach">
            <SupplementChecklist
              supplements={suppsByTiming['morning-empty']}
              checked={log.supplements}
              onToggle={toggleSupplement}
            />
          </BlockSection>
        )}
        <BlockSection title="Breakfast">
          <MealLogger
            timeBlock="morning"
            meals={log.meals}
            onAdd={addMeal}
            onRemove={removeMeal}
          />
        </BlockSection>
        {suppsByTiming['with-food-morning'].length > 0 && (
          <BlockSection title="Supplements · With Food">
            <SupplementChecklist
              supplements={suppsByTiming['with-food-morning']}
              checked={log.supplements}
              onToggle={toggleSupplement}
            />
          </BlockSection>
        )}
      </TimeBlock>

      {/* ── Mid-Morning ──────────────────────────────────────────────────── */}
      <TimeBlock id="midmorning" defaultOpen={true}>
        <BlockSection title="Snack">
          <MealLogger
            timeBlock="midmorning"
            meals={log.meals}
            onAdd={addMeal}
            onRemove={removeMeal}
          />
        </BlockSection>
        <BlockSection title="Hydration">
          <SupplementChecklist
            supplements={[]}
            checked={log.supplements}
            onToggle={toggleSupplement}
            showHydration
            water={log.water}
            waterTarget={settings.waterTarget}
            electrolytes={log.electrolytes}
            onWater={setWater}
            onElectrolytes={setElectrolytes}
          />
        </BlockSection>
      </TimeBlock>

      {/* ── Mid-Day ──────────────────────────────────────────────────────── */}
      <TimeBlock id="midday" defaultOpen={true}>
        <BlockSection title="Lunch">
          <MealLogger
            timeBlock="midday"
            meals={log.meals}
            onAdd={addMeal}
            onRemove={removeMeal}
          />
        </BlockSection>
        {suppsByTiming.afternoon.length > 0 && (
          <BlockSection title="Supplements · Afternoon">
            <SupplementChecklist
              supplements={suppsByTiming.afternoon}
              checked={log.supplements}
              onToggle={toggleSupplement}
            />
          </BlockSection>
        )}
      </TimeBlock>

      {/* ── Evening ──────────────────────────────────────────────────────── */}
      <TimeBlock id="evening" defaultOpen={true}>
        <BlockSection title="Dinner">
          <MealLogger
            timeBlock="evening"
            meals={log.meals}
            onAdd={addMeal}
            onRemove={removeMeal}
          />
        </BlockSection>
        {suppsByTiming.nighttime.length > 0 && (
          <BlockSection title="Supplements · Nighttime">
            <SupplementChecklist
              supplements={suppsByTiming.nighttime}
              checked={log.supplements}
              onToggle={toggleSupplement}
            />
          </BlockSection>
        )}
      </TimeBlock>

      {/* ── Exercise ─────────────────────────────────────────────────────── */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">🏋️ Exercise & Movement</h3>
        <ExerciseLogger
          exercises={exercisesWithMeta}
          goals={settings.exerciseGoals}
          onAdd={addExercise}
          onRemove={removeExercise}
        />
      </div>

      {/* ── Google Tasks sync ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1 pb-2">
        <div className="text-xs text-slate-400">
          {syncStatus.startsWith('error') && (
            <span className="text-red-500">{syncStatus.replace('error:', '')}</span>
          )}
          {syncStatus === 'done' && <span className="text-brand-500">✓ Pushed to Google Tasks</span>}
        </div>
        <button
          onClick={handleSync}
          disabled={syncStatus === 'syncing'}
          className="btn-secondary text-xs gap-1.5"
          title={googleTasks.isConfigured() ? 'Push today\'s log to Google Tasks' : 'Google Tasks not configured — see .env.example'}
        >
          {syncStatus === 'syncing' ? (
            <span className="inline-block w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          ) : '📅'} Push to Google Tasks
        </button>
      </div>
    </div>
  );
}
