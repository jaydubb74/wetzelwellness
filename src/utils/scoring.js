// ── Scoring ────────────────────────────────────────────────────────────────────
//
// The single source of truth for compliance and exercise math. The Daily view,
// Progression, and the week report all score through here so they can't
// disagree. Pure functions over logs + settings; no storage access.

import { today } from './dates.js';

export const EXERCISE_GOALS = ['zone2', 'hiit', 'strength'];

// Protein variance bands, by |actual − target| / target (over or under).
const GREEN_MAX = 0.10;
const YELLOW_MAX = 0.20;

/**
 * How far `actual` is from `target`, and which band that falls in.
 * Returns null when there's no target to compare against.
 *
 * @returns {{ variance: number, band: 'green'|'yellow'|'red', score: number } | null}
 *   variance is signed (+0.12 = 12% over); score is 1 at target, 0 at ≥100% off.
 */
export function varianceBand(actual, target) {
  if (!(target > 0)) return null;
  const variance = (actual - target) / target;
  // Round so exact boundaries (198g vs 180g = 10%) don't fall out on float error
  const dev = Math.round(Math.abs(variance) * 1e4) / 1e4;
  const band = dev <= GREEN_MAX ? 'green' : dev <= YELLOW_MAX ? 'yellow' : 'red';
  return { variance, band, score: Math.max(0, 1 - dev) };
}

/** "+12%", "−25%", or "on target" for display. */
export function formatVariance(variance) {
  const pct = Math.round(variance * 100);
  if (pct === 0) return 'on target';
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`;
}

export function macroTotals(meals = []) {
  return meals.reduce(
    (acc, m) => ({
      protein:  acc.protein  + (m.macros?.protein  || 0),
      fat:      acc.fat      + (m.macros?.fat      || 0),
      carbs:    acc.carbs    + (m.macros?.carbs    || 0),
      calories: acc.calories + (m.macros?.calories || 0),
    }),
    { protein: 0, fat: 0, carbs: 0, calories: 0 }
  );
}

/**
 * Did the user log anything themselves? Oura data alone doesn't count, so a
 * day that only has a ring sync shows as "no log" rather than "missed".
 */
export function hasManualEntry(log) {
  if (!log) return false;
  return (log.meals?.length > 0)
    || (log.exercises?.length > 0)
    || (log.water > 0)
    || Boolean(log.electrolytes)
    || Object.values(log.supplements || {}).some(Boolean);
}

// ── Per-day goals ──────────────────────────────────────────────────────────────

/** The goals a day is scored against, frozen into the log as it's edited. */
export function snapshotTargets(settings) {
  return {
    macroTargets: { ...settings.macroTargets },
    waterTarget: settings.waterTarget,
    exerciseGoals: Object.fromEntries(
      Object.entries(settings.exerciseGoals || {}).map(([k, g]) => [k, g.target])
    ),
    supplements: (settings.supplements || [])
      .filter(s => s.active)
      .map(({ id, name }) => ({ id, name })),
  };
}

/**
 * Today (and later) follows current settings, so goal changes apply straight
 * away; past days keep the goals frozen into their log, so changing a goal
 * never rescores history. Logs with no snapshot fall back to current settings.
 */
export function targetsFor(date, log, settings) {
  if (date >= today() || !log?.targets) return snapshotTargets(settings);
  return log.targets;
}

// ── Daily compliance ───────────────────────────────────────────────────────────

/**
 * Scores one day against its own goals. Returns null for days with nothing
 * logged by hand (shown grey, not counted as tracked).
 */
export function scoreDay(date, log, settings) {
  if (!hasManualEntry(log)) return null;
  const targets = targetsFor(date, log, settings);
  const totals = macroTotals(log.meals);

  const protein = {
    actual: totals.protein,
    target: targets.macroTargets.protein,
    ...(varianceBand(totals.protein, targets.macroTargets.protein)
      ?? { variance: null, band: null, score: 0 }),
  };

  const supps = targets.supplements;
  const supplements = supps.length
    ? supps.filter(s => log.supplements?.[s.id]).length / supps.length
    : 1;

  const hydration = targets.waterTarget > 0
    ? Math.min((log.water || 0) / targets.waterTarget, 1)
    : 1;

  return { protein, supplements, hydration, totals, targets };
}

// ── Exercise ───────────────────────────────────────────────────────────────────

/**
 * Sessions per goal for one day, from hand-logged exercise only (Oura
 * workouts aren't used). The "Hit Movement Goal" entry counts toward HIIT.
 */
export function sessionsForDay(log) {
  const counts = { zone2: 0, hiit: 0, strength: 0 };
  for (const ex of log?.exercises || []) {
    const cat = ex.category === 'movement' ? 'hiit' : ex.category;
    if (cat in counts) counts[cat]++;
  }
  return counts;
}

/**
 * Sessions vs goals over any date range. Each day contributes 1/7 of its
 * weekly target, so a week, a month, and a quarter are scored on the same
 * scale (a 30-day month at 3×/week targets ~12.9 sessions).
 *
 * @returns {{ counts: object, targets: object, score: number|null }}
 *   score is the average per-goal achievement (0–100); null when nothing in
 *   the range was logged by hand (nothing to judge).
 */
export function exerciseForRange(dates, logs, settings) {
  const counts = { zone2: 0, hiit: 0, strength: 0 };
  const targets = { zone2: 0, hiit: 0, strength: 0 };
  for (const date of dates) {
    const log = logs[date];
    const goals = targetsFor(date, log, settings).exerciseGoals;
    const sessions = sessionsForDay(log);
    for (const k of EXERCISE_GOALS) {
      targets[k] += (goals[k] || 0) / 7;
      counts[k] += sessions[k];
    }
  }
  for (const k of EXERCISE_GOALS) targets[k] = Math.round(targets[k] * 100) / 100;

  const active = EXERCISE_GOALS.filter(k => targets[k] > 0);
  const score = active.length && dates.some(d => hasManualEntry(logs[d]))
    ? Math.round(active.reduce((sum, k) => sum + Math.min(counts[k] / targets[k], 1), 0) / active.length * 100)
    : null;
  return { counts, targets, score };
}

// ── Periods ────────────────────────────────────────────────────────────────────

/**
 * Compliance over a set of dates.
 * - daily[date]: scoreDay() result, only for days with manual entries
 * - summary: % of tracked days that hit each goal (null with none tracked),
 *   plus the exercise score
 * - met: how many tracked days hit each goal (the numerators behind summary)
 */
export function scorePeriod(dates, logs, settings) {
  const daily = {};
  let tracked = 0, proteinMet = 0, suppsMet = 0, hydrationMet = 0;

  for (const date of dates) {
    const day = scoreDay(date, logs[date], settings);
    if (!day) continue;
    daily[date] = day;
    tracked++;
    if (day.protein.band === 'green') proteinMet++;
    if (day.supplements >= 0.8) suppsMet++;
    if (day.hydration >= 0.8) hydrationMet++;
  }

  const pct = n => (tracked > 0 ? Math.round((n / tracked) * 100) : null);
  const exercise = exerciseForRange(dates, logs, settings);

  return {
    daily,
    tracked,
    exercise,
    met: { nutrition: proteinMet, supplements: suppsMet, hydration: hydrationMet },
    summary: {
      nutrition:   pct(proteinMet),
      supplements: pct(suppsMet),
      hydration:   pct(hydrationMet),
      exercise:    exercise.score,
    },
  };
}
