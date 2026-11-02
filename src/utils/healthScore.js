// ── Health-consistency score ───────────────────────────────────────────────────
//
// A daily score for consistency with the habits you've set — not a measure of
// health, and not a medically validated formula. The weights below are
// product-design choices. Weights, targets, scoring curves, and completion
// rules live here, apart from the screens that show them.
//
//   Daily score = nutrition × 34% + movement × 33% + sleep × 33%
//
// Dates: every day is the device's local calendar day. Food, steps, and
// workouts count toward the day they're logged for. Oura's sleep score counts
// toward the day you woke up, so a day's sleep is "last night's sleep".
//
// Every component, pillar, and daily score has a status:
//   final        the data is complete and won't change
//   provisional  a live value: the day isn't over, or Oura's final step
//                count for it hasn't been fetched yet
//   incomplete   required data or a target is missing — no points (never
//                zero, never assumed success)
// A pillar, and the daily score, take the least complete status of their
// parts. Missing parts are never filled in, and their weight is never moved
// onto the others.

import { today, offsetDate } from './dates.js';
import { macroTotals, targetsFor, sessionsForDay, exerciseCategory } from './scoring.js';

export const HEALTH_SCORE_CONFIG = {
  // Percent weights; each set sums to 100
  weights: { nutrition: 34, movement: 33, sleep: 33 },
  nutrition: { foodQuality: 50, protein: 25, calories: 25 },
  movement: { everyday: 75, adherence: 25 },

  // No component or pillar scores above this
  cap: 125,

  // Protein within ±10% of target earns full points (over or under), the
  // same band the macro display uses
  proteinTolerance: 0.10,
  // Outside a target band, points fall in a straight line to 0 at this far
  // (as a fraction) beyond the band's edge — e.g. 25% over the calorie max
  bandFalloff: 0.25,

  // Oura Sleep Score: 85 earns 100 points (scaled below that); each point
  // above 85 adds one, up to 115
  sleep: { fullCreditAt: 85, maxPoints: 115 },

  foodGroups: [
    { key: 'vegetables',  label: 'Vegetables' },
    { key: 'fruit',       label: 'Fruit' },
    { key: 'wholeGrains', label: 'Whole grains' },
    { key: 'legumes',     label: 'Legumes' },
    { key: 'nuts',        label: 'Nuts' },
  ],
};

const cfg = HEALTH_SCORE_CONFIG;

export const PLAN_OPTIONS = [
  { key: 'strength', label: 'Strength' },
  { key: 'zone2',    label: 'Zone 2' },
  { key: 'stretch',  label: 'Stretch' },
  { key: 'recovery', label: 'Recovery' },
];

// ── Small helpers ──────────────────────────────────────────────────────────────

const round1 = v => Math.round(v * 10) / 10;
const STATUS_RANK = { final: 0, provisional: 1, incomplete: 2 };
const leastComplete = statuses =>
  statuses.reduce((worst, s) => (STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst), 'final');

function component(key, label, weight, fields) {
  return { key, label, weight, points: null, detail: '', note: '', ...fields };
}
const incomplete = note => ({ status: 'incomplete', points: null, note });

/**
 * Points for hitting a band: 100 anywhere inside [lo, hi], falling in a
 * straight line to 0 at `falloff` beyond either edge. Going over is treated
 * the same as going under — exceeding a target never earns more.
 */
export function bandPoints(value, lo, hi, falloff = cfg.bandFalloff) {
  if (value >= lo && value <= hi) return 100;
  if (value < lo) {
    const zeroAt = lo * (1 - falloff);
    return value <= zeroAt ? 0 : (100 * (value - zeroAt)) / (lo - zeroAt);
  }
  const zeroAt = hi * (1 + falloff);
  return value >= zeroAt ? 0 : (100 * (zeroAt - value)) / (zeroAt - hi);
}

/** Oura Sleep Score → points (85 → 100, 100 → 115). */
export function sleepPoints(score) {
  const { fullCreditAt, maxPoints } = cfg.sleep;
  const points = score <= fullCreditAt
    ? (score / fullCreditAt) * 100
    : Math.min(100 + (score - fullCreditAt), maxPoints);
  return Math.min(points, cfg.cap);
}

/**
 * Weighted combination of 0–125 values, rounded to one decimal. Done in
 * whole units (hundredths × percent) so 90/85/60 gives exactly 78.45 → 78.5
 * instead of drifting to 78.4499… under floating point.
 */
export function weightedPoints(values, weights) {
  let units = 0;
  for (const [key, weight] of Object.entries(weights)) {
    units += Math.round(values[key] * 100) * weight; // value in hundredths × percent
  }
  return Math.round(units / 1000) / 10;
}

/** 'past' | 'today' | 'future' for a local date key. */
export function dayPhase(date) {
  const t = today();
  return date < t ? 'past' : date === t ? 'today' : 'future';
}

/**
 * True when a past day's Oura copy was fetched while that day was still
 * under way, so its step count is partial.
 */
export function fetchedBeforeDayEnded(oura, date) {
  const dayEnd = new Date(offsetDate(date, 1) + 'T00:00:00').getTime();
  return Boolean(oura) && (oura.fetchedAt || 0) < dayEnd;
}

// ── Weekly plan ────────────────────────────────────────────────────────────────

const currentCategories = day => [...new Set(day.map(exerciseCategory))];

/**
 * The plan in force on `date`: a list of exercise categories, ['recovery'],
 * [] for a day left unplanned, or null when no plan existed yet.
 */
export function planFor(date, planHistory = []) {
  const version = planHistory
    .filter(v => v.from <= date)
    .reduce((latest, v) => (!latest || v.from > latest.from ? v : latest), null);
  if (!version) return null;
  const weekday = new Date(date + 'T00:00:00').getDay();
  return currentCategories(version.days?.[weekday] || []);
}

/** The latest plan version's days (what the Settings editor shows). */
export function upcomingPlanDays(planHistory = []) {
  const latest = planHistory.reduce((l, v) => (!l || v.from > l.from ? v : l), null);
  return latest?.days?.map(currentCategories) || Array.from({ length: 7 }, () => []);
}

/**
 * Returns a new plan history with `days` taking effect tomorrow, so today's
 * plan (and every earlier day's) stays as it was set in advance.
 */
export function editPlan(planHistory = [], days, todayKey = today()) {
  const from = offsetDate(todayKey, 1);
  return [...planHistory.filter(v => v.from < from), { from, days }];
}

// ── Pillars ────────────────────────────────────────────────────────────────────

function pillar(key, label, components) {
  const status = leastComplete(components.map(c => c.status));
  const points = status === 'incomplete'
    ? null
    : Math.min(round1(components.reduce((sum, c) => sum + (c.points * c.weight) / 100, 0)), cfg.cap);
  return {
    key,
    label,
    weight: cfg.weights[key],
    status,
    points,
    components,
    note: components.find(c => c.status === 'incomplete')?.note || '',
  };
}

/**
 * Servings per food group for the day: the meals' estimates plus any
 * adjustments you made (so meals logged afterwards still add to the totals).
 */
export function foodGroupServings(log) {
  // Older logs stored the day's totals outright
  if (log?.foodGroups) return { servings: log.foodGroups, adjusted: true, unestimated: 0 };
  const meals = log?.meals || [];
  const adjust = log?.foodGroupAdjust || {};
  const servings = Object.fromEntries(cfg.foodGroups.map(g => [g.key, 0]));
  let unestimated = 0;
  for (const m of meals) {
    if (!m.groups) { unestimated++; continue; }
    for (const g of cfg.foodGroups) servings[g.key] += m.groups[g.key] || 0;
  }
  for (const g of cfg.foodGroups) servings[g.key] = Math.max(0, servings[g.key] + (adjust[g.key] || 0));
  return { servings, adjusted: Object.values(adjust).some(Boolean), unestimated };
}

function nutritionPillar(log, targets, live) {
  const w = cfg.nutrition;
  const meals = log?.meals || [];
  const noFood = meals.length === 0;
  const totals = macroTotals(meals);

  // Food quality: share of each targeted group's servings met, averaged
  const groups = cfg.foodGroups.filter(g => targets.foodGroupTargets?.[g.key] > 0);
  const { servings, unestimated } = foodGroupServings(log);
  let foodQuality;
  if (!groups.length) foodQuality = incomplete('Set food-group targets in Settings');
  else if (noFood) foodQuality = incomplete('No food logged');
  else if (unestimated) {
    foodQuality = incomplete(`${unestimated} meal${unestimated === 1 ? ' has' : 's have'} no food-group estimate yet`);
  } else {
    const met = groups.map(g => Math.min((servings[g.key] || 0) / targets.foodGroupTargets[g.key], 1));
    foodQuality = {
      status: live,
      points: round1((met.reduce((a, b) => a + b, 0) / met.length) * 100),
      detail: groups.map(g => `${g.label} ${servings[g.key] || 0}/${targets.foodGroupTargets[g.key]}`).join(' · '),
    };
  }

  // Protein: full points within ±10% of target
  const pTarget = targets.macroTargets?.protein;
  let protein;
  if (!(pTarget > 0)) protein = incomplete('Set a protein target in Settings');
  else if (noFood) protein = incomplete('No food logged');
  else {
    const tol = cfg.proteinTolerance;
    protein = {
      status: live,
      points: round1(bandPoints(totals.protein, pTarget * (1 - tol), pTarget * (1 + tol))),
      detail: `${totals.protein}g vs ${pTarget}g (full points within ±${Math.round(tol * 100)}%)`,
    };
  }

  // Calories: full points inside your range; less above or below it
  const { min, max } = targets.calorieRange || {};
  let calories;
  if (!(min > 0 && max >= min)) calories = incomplete('Set a calorie range in Settings');
  else if (noFood) calories = incomplete('No food logged');
  else {
    calories = {
      status: live,
      points: round1(bandPoints(totals.calories, min, max)),
      detail: `${totals.calories.toLocaleString()} kcal vs ${min.toLocaleString()}–${max.toLocaleString()}`,
    };
  }

  return pillar('nutrition', 'Nutrition', [
    component('foodQuality', 'Food quality', w.foodQuality, foodQuality),
    component('protein', 'Protein', w.protein, protein),
    component('calories', 'Calories', w.calories, calories),
  ]);
}

function movementPillar(date, log, targets, settings, live) {
  const w = cfg.movement;

  // Everyday movement: steps vs target (entered steps win over Oura's)
  const target = targets.stepsTarget;
  const manual = log?.steps;
  const steps = manual ?? log?.oura?.activity?.steps ?? null;
  let everyday;
  if (!(target > 0)) everyday = incomplete('Set a daily steps target in Settings');
  else if (steps == null) {
    everyday = incomplete(live === 'provisional' ? 'No steps yet — sync Oura or enter steps' : 'No steps recorded');
  } else {
    // A past day's Oura count is final only if fetched after that day ended
    const partial = manual == null && live === 'final' && fetchedBeforeDayEnded(log.oura, date);
    everyday = {
      status: partial ? 'provisional' : live,
      points: round1(Math.min((steps / target) * 100, cfg.cap)),
      detail: `${steps.toLocaleString()} vs ${target.toLocaleString()} steps (${manual != null ? 'entered' : 'Oura'})`,
      note: partial ? "Waiting for Oura's final count" : '',
    };
  }

  // Plan adherence: did the planned sessions happen, or was it a planned
  // recovery day (full points, no workout needed)?
  const plan = planFor(date, settings.planHistory);
  let adherence;
  if (!plan) adherence = incomplete('No weekly plan yet — set one in Settings (starts the next day)');
  else if (!plan.length) adherence = incomplete('Nothing planned for this day');
  else if (plan.includes('recovery')) {
    adherence = { status: live, points: 100, detail: 'Planned recovery day' };
  } else {
    const sessions = sessionsForDay(log);
    const done = plan.filter(cat => sessions[cat] > 0);
    const label = key => PLAN_OPTIONS.find(o => o.key === key)?.label || key;
    adherence = {
      status: live,
      points: round1((done.length / plan.length) * 100),
      detail: `Planned ${plan.map(label).join(', ')} — done ${done.length ? done.map(label).join(', ') : 'none yet'}`,
    };
  }

  return pillar('movement', 'Movement', [
    component('everyday', 'Everyday movement', w.everyday, everyday),
    component('adherence', 'Plan adherence', w.adherence, adherence),
  ]);
}

function sleepPillar(log, phase) {
  const score = log?.oura?.sleep?.score;
  const sleep = score == null
    ? incomplete(phase === 'today' ? 'Not synced from Oura yet' : 'No Oura sleep score')
    : { status: 'final', points: round1(sleepPoints(score)), detail: `Oura Sleep Score ${score}` };
  return pillar('sleep', "Last night's sleep", [component('sleepScore', 'Oura Sleep Score', 100, sleep)]);
}

// ── Days and periods ───────────────────────────────────────────────────────────

/**
 * The health-consistency score for one day, with every pillar and component
 * for the breakdown. `points` is null whenever the score is incomplete.
 * Readiness is returned for context only — it isn't part of the score.
 */
export function scoreHealthDay(date, log, settings) {
  const phase = dayPhase(date);
  const live = phase === 'today' ? 'provisional' : 'final';
  const targets = targetsFor(date, log, settings);

  const pillars = {
    nutrition: nutritionPillar(log, targets, live),
    movement: movementPillar(date, log, targets, settings, live),
    sleep: sleepPillar(log, phase),
  };
  const list = Object.values(pillars);
  const status = phase === 'future' ? 'incomplete' : leastComplete(list.map(p => p.status));
  const points = status === 'incomplete'
    ? null
    : weightedPoints(
        Object.fromEntries(list.map(p => [p.key, p.points])),
        cfg.weights,
      );

  return { date, phase, status, points, pillars, readiness: log?.oura?.readiness?.score ?? null };
}

/**
 * Averages over a set of dates, counting only finalized values: the daily
 * score over days whose score is final, and each pillar over days where that
 * pillar is final. Each comes with how many days it's based on.
 */
export function averageHealth(dates, logs, settings) {
  const sums = { score: [], nutrition: [], movement: [], sleep: [] };
  for (const date of dates) {
    const day = scoreHealthDay(date, logs[date], settings);
    if (day.status === 'final') sums.score.push(day.points);
    for (const p of Object.values(day.pillars)) {
      if (p.status === 'final') sums[p.key].push(p.points);
    }
  }
  const avg = list => (list.length ? round1(list.reduce((a, b) => a + b, 0) / list.length) : null);
  return Object.fromEntries(
    Object.entries(sums).map(([k, list]) => [k, { average: avg(list), days: list.length, of: dates.length }])
  );
}

/** The seven finished days before `todayKey` (yesterday and the six before). */
export function lastSevenDays(todayKey = today()) {
  return Array.from({ length: 7 }, (_, i) => offsetDate(todayKey, i - 7));
}
