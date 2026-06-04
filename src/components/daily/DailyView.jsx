import { useState, useEffect, useRef, useMemo } from 'react';
import { getLocalDateKey, isToday, formatDisplay, offsetDate } from '../../utils/dates.js';
import { useDailyLog } from '../../hooks/useDailyLog.js';
import * as googleTasks from '../../services/googleTasks.js';
import * as storage from '../../services/storage.js';
import MacroSummary from './MacroSummary.jsx';
import MealLogger from './MealLogger.jsx';
import SupplementChecklist from './SupplementChecklist.jsx';
import ExerciseLogger from './ExerciseLogger.jsx';
import TimeBlock, { BlockSection } from './TimeBlock.jsx';

export default function DailyView({ settings, jumpDate, onJumpConsumed }) {
  // Always initialize to the LOCAL calendar date, never UTC.
  const [selectedDate, setSelectedDate] = useState(getLocalDateKey);
  const [syncStatus, setSyncStatus] = useState('');

  // Track whether the user has intentionally navigated to a prior date.
  // We use a ref so reconcile() reads the latest value without adding it as a
  // useEffect dependency (which would recreate the listener on every nav click).
  const browsingHistoryRef = useRef(false);

  // ── Date reconciliation ──────────────────────────────────────────────────────
  //
  // Scenarios handled:
  //   1. App open across midnight — interval ticks and advances selectedDate.
  //   2. Phone/laptop woken from sleep — visibilitychange fires and advances.
  //   3. New-day app open — useState(getLocalDateKey) already starts on today.
  //   4. User viewing history — browsingHistoryRef prevents auto-advance.

  useEffect(() => {
    function reconcile() {
      if (browsingHistoryRef.current) return; // user is intentionally in history
      const todayKey = getLocalDateKey();
      setSelectedDate(prev => (prev < todayKey ? todayKey : prev));
    }

    function onVisibilityChange() {
      if (!document.hidden) reconcile();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    // Poll every 60 s so midnight rollover is caught without a page refresh.
    const timer = setInterval(reconcile, 60_000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(timer);
    };
  }, []); // intentionally empty — reconcile reads ref, not captured state

  // Jump to a date requested from another view (e.g. heatmap click)
  useEffect(() => {
    if (!jumpDate) return;
    browsingHistoryRef.current = jumpDate !== getLocalDateKey();
    setSelectedDate(jumpDate);
    onJumpConsumed?.();
  }, [jumpDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation helpers ───────────────────────────────────────────────────────

  function goBack() {
    browsingHistoryRef.current = true;
    setSelectedDate(d => offsetDate(d, -1));
  }

  function goForward() {
    const next = offsetDate(selectedDate, 1);
    // Reaching today clears history mode
    if (next >= getLocalDateKey()) browsingHistoryRef.current = false;
    setSelectedDate(next);
  }

  function goToday() {
    browsingHistoryRef.current = false;
    setSelectedDate(getLocalDateKey());
  }

  // ── Log + derived data ───────────────────────────────────────────────────────

  const {
    log,
    addMeal, removeMeal,
    toggleSupplement,
    setWater, setElectrolytes,
    addExercise, removeExercise,
  } = useDailyLog(selectedDate);

  const todayKey = getLocalDateKey();
  const viewingToday = selectedDate === todayKey;

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

  // Weekly exercise counts — uses getLocalDateKey (not toISOString) for day keys
  const weekCounts = useMemo(() => {
    const allLogs = storage.getAllLogs();
    const counts = { zone2: 0, hiit: 0, strength: 0 };
    const anchor = new Date(selectedDate + 'T00:00:00');
    const sunday = new Date(anchor);
    sunday.setDate(anchor.getDate() - anchor.getDay());
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      const ds = getLocalDateKey(d); // ← was toISOString().split('T')[0] — bug fixed
      const l = allLogs[ds];
      if (!l) continue;
      for (const ex of l.exercises || []) {
        const cat = ex.category === 'movement' ? 'hiit' : ex.category;
        if (cat in counts) counts[cat]++;
      }
    }
    return counts;
  }, [selectedDate, log]);

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
        <button onClick={goBack} className="btn-ghost">← Prev</button>
        <div className="text-center">
          <p className="font-semibold text-slate-900 text-sm">{formatDisplay(selectedDate)}</p>
          {!viewingToday && (
            <button
              onClick={goToday}
              className="text-xs text-brand-500 hover:text-brand-600 mt-0.5"
            >
              Back to today
            </button>
          )}
        </div>
        <button
          onClick={goForward}
          disabled={viewingToday}
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
