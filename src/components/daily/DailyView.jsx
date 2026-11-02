import { useState, useEffect, useRef, useMemo } from 'react';
import { getLocalDateKey, isToday, formatDisplay, offsetDate, getWeekDates } from '../../utils/dates.js';
import { exerciseForRange, targetsFor } from '../../utils/scoring.js';
import { scoreHealthDay, averageHealth, lastSevenDays } from '../../utils/healthScore.js';
import { useDailyLog } from '../../hooks/useDailyLog.js';
import * as storage from '../../services/storage.js';
import MacroSummary from './MacroSummary.jsx';
import MealLogger from './MealLogger.jsx';
import SupplementChecklist from './SupplementChecklist.jsx';
import ExerciseLogger from './ExerciseLogger.jsx';
import HealthActivity from './HealthActivity.jsx';
import HealthScoreCard from './HealthScoreCard.jsx';
import FoodGroupsCard from './FoodGroupsCard.jsx';
import TimeBlock, { BlockSection, BLOCK_ORDER, currentBlock } from './TimeBlock.jsx';
import { useOura } from '../../hooks/useOura.js';

export default function DailyView({ settings, jumpDate, onJumpConsumed }) {
  // Always initialize to the LOCAL calendar date, never UTC.
  const [selectedDate, setSelectedDate] = useState(getLocalDateKey);

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
    log, update,
    addMeal, removeMeal, updateMeal,
    toggleSupplement,
    setWater, setElectrolytes,
    addExercise, removeExercise,
    setSteps, setFoodGroups,
  } = useDailyLog(selectedDate);

  // Oura data for the selected day (auto-fetches into log.oura)
  const { oura, syncing: ouraSyncing, error: ouraError, refresh: refreshOura } = useOura(selectedDate, log, update);

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

  // Exercise for the week containing the selected day
  const weekExercise = useMemo(
    () => exerciseForRange(getWeekDates(selectedDate), storage.getAllLogs(), settings),
    [selectedDate, log, settings]
  );

  // The goals this day is scored against (frozen for past days)
  const dayTargets = targetsFor(selectedDate, log, settings);

  // Health-consistency score for the day, and the seven days before it
  const healthDay = useMemo(() => scoreHealthDay(selectedDate, log, settings), [selectedDate, log, settings]);
  const healthWeek = useMemo(
    () => averageHealth(lastSevenDays(selectedDate), storage.getAllLogs(), settings),
    [selectedDate, log, settings]
  );

  // On today, blocks that have already passed start collapsed to a one-line
  // summary and the current/upcoming ones start open; past days start fully
  // open. Worked out once per day shown, so crossing a block boundary while
  // you're typing doesn't collapse anything under you.
  const nowBlock = useMemo(() => (viewingToday ? currentBlock() : null), [selectedDate, viewingToday]);
  const startsOpen = id => !nowBlock || BLOCK_ORDER.indexOf(id) >= BLOCK_ORDER.indexOf(nowBlock);
  const blockKey = id => `${id}-${selectedDate}-${startsOpen(id)}`;

  const BLOCK_SUPP_TIMINGS = {
    morning: ['morning-empty', 'with-food-morning'],
    midmorning: [],
    midday: ['afternoon'],
    evening: ['nighttime'],
  };
  function blockSummary(id) {
    const meals = (log.meals || []).filter(m => m.timeBlock === id);
    const protein = meals.reduce((sum, m) => sum + (m.macros?.protein || 0), 0);
    const supps = BLOCK_SUPP_TIMINGS[id].flatMap(t => suppsByTiming[t]);
    const parts = [meals.length ? `${meals.length} meal${meals.length === 1 ? '' : 's'}, ${protein}g protein` : 'no meals'];
    if (supps.length) parts.push(`${supps.filter(sp => log.supplements?.[sp.id]).length}/${supps.length} supplements`);
    if (id === 'midmorning') parts.push(`${log.water || 0}/${dayTargets.waterTarget} water`);
    return parts.join(' · ');
  }

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
              className="text-xs text-brand-700 hover:text-brand-600 mt-0.5"
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

      {/* Health-consistency score */}
      <HealthScoreCard day={healthDay} sevenDay={healthWeek} />

      {/* Macro summary */}
      <MacroSummary meals={log.meals || []} targets={dayTargets.macroTargets} final={selectedDate < todayKey} />

      <FoodGroupsCard log={log} targets={dayTargets} onSetFoodGroups={setFoodGroups} />

      {/* ── Morning ──────────────────────────────────────────────────────── */}
      <TimeBlock key={blockKey('morning')} id="morning" defaultOpen={startsOpen('morning')} summary={blockSummary('morning')}>
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
            onUpdate={updateMeal}
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
      <TimeBlock key={blockKey('midmorning')} id="midmorning" defaultOpen={startsOpen('midmorning')} summary={blockSummary('midmorning')}>
        <BlockSection title="Snack">
          <MealLogger
            timeBlock="midmorning"
            meals={log.meals}
            onAdd={addMeal}
            onRemove={removeMeal}
            onUpdate={updateMeal}
          />
        </BlockSection>
        <BlockSection title="Hydration">
          <SupplementChecklist
            supplements={[]}
            checked={log.supplements}
            onToggle={toggleSupplement}
            showHydration
            water={log.water}
            waterTarget={dayTargets.waterTarget}
            electrolytes={log.electrolytes}
            onWater={setWater}
            onElectrolytes={setElectrolytes}
          />
        </BlockSection>
      </TimeBlock>

      {/* ── Mid-Day ──────────────────────────────────────────────────────── */}
      <TimeBlock key={blockKey('midday')} id="midday" defaultOpen={startsOpen('midday')} summary={blockSummary('midday')}>
        <BlockSection title="Lunch">
          <MealLogger
            timeBlock="midday"
            meals={log.meals}
            onAdd={addMeal}
            onRemove={removeMeal}
            onUpdate={updateMeal}
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
      <TimeBlock key={blockKey('evening')} id="evening" defaultOpen={startsOpen('evening')} summary={blockSummary('evening')}>
        <BlockSection title="Dinner">
          <MealLogger
            timeBlock="evening"
            meals={log.meals}
            onAdd={addMeal}
            onRemove={removeMeal}
            onUpdate={updateMeal}
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

      {/* ── Daily Health + Movement ──────────────────────────────────────── */}
      <div className="card space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">🩺 Daily Health + Movement</h3>
        <HealthActivity
          oura={oura}
          syncing={ouraSyncing}
          error={ouraError}
          onRefresh={refreshOura}
          exercises={log.exercises || []}
          onRemoveExercise={removeExercise}
          steps={log.steps ?? null}
          stepsTarget={dayTargets.stepsTarget}
          onSetSteps={setSteps}
        />
        <ExerciseLogger
          weekCounts={weekExercise.counts}
          goals={settings.exerciseGoals}
          onAdd={addExercise}
        />
      </div>
    </div>
  );
}
