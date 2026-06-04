import { useMemo } from 'react';
import * as storage from '../services/storage.js';
import { getWeekDates } from '../utils/dates.js';

/**
 * Returns compliance metrics for the given array of date strings.
 * metrics.daily[date] = { nutrition, supplements, hydration } (0-1 floats)
 * metrics.summary = { nutrition, supplements, hydration, exercise } (0-100 ints)
 * metrics.weeklyExercise = { zone2, hiit, strength } counts for the current week
 */
export function useCompliance(dates, settings) {
  return useMemo(() => {
    const logs = storage.getAllLogs();
    const activeSupps = (settings.supplements || []).filter(s => s.active);

    const daily = {};
    let nutritionMet = 0, suppsMet = 0, hydrationMet = 0, tracked = 0;

    for (const date of dates) {
      const log = logs[date];
      if (!log) continue;
      tracked++;

      // Nutrition: hit ≥80% of protein target
      const totalProtein = (log.meals || []).reduce((s, m) => s + (m.macros?.protein || 0), 0);
      const nutritionScore = settings.macroTargets.protein > 0
        ? Math.min(totalProtein / settings.macroTargets.protein, 1)
        : 0;

      // Supplements: fraction checked
      const checkedCount = activeSupps.filter(s => log.supplements?.[s.id]).length;
      const suppScore = activeSupps.length > 0 ? checkedCount / activeSupps.length : 1;

      // Hydration: fraction of water target
      const hydrationScore = settings.waterTarget > 0
        ? Math.min((log.water || 0) / settings.waterTarget, 1)
        : 1;

      daily[date] = { nutrition: nutritionScore, supplements: suppScore, hydration: hydrationScore };

      if (nutritionScore >= 0.8) nutritionMet++;
      if (suppScore >= 0.8) suppsMet++;
      if (hydrationScore >= 0.8) hydrationMet++;
    }

    const pct = (n) => tracked > 0 ? Math.round((n / tracked) * 100) : null;

    // Exercise: count sessions across the viewed dates.
    // 'movement' category (Hit Movement Goal button) counts toward 'hiit' goal.
    const weeklyExercise = { zone2: 0, hiit: 0, strength: 0 };
    for (const d of dates) {
      const log = logs[d];
      if (!log) continue;
      for (const ex of log.exercises || []) {
        const cat = ex.category === 'movement' ? 'hiit' : ex.category;
        if (cat in weeklyExercise) weeklyExercise[cat]++;
      }
    }

    // Exercise compliance over the date range: how many weeks hit all targets
    const exerciseCompliance = computeExerciseCompliance(dates, logs, settings);

    return {
      daily,
      summary: {
        nutrition:    pct(nutritionMet),
        supplements:  pct(suppsMet),
        hydration:    pct(hydrationMet),
        exercise:     exerciseCompliance,
      },
      weeklyExercise,
      tracked,
    };
  }, [dates, settings]);
}

function computeExerciseCompliance(dates, logs, settings) {
  if (!dates.length) return null;

  // Group dates into ISO weeks
  const weeks = {};
  for (const d of dates) {
    const wk = getWeekDates(d)[0]; // Sunday anchor
    if (!weeks[wk]) weeks[wk] = [];
    weeks[wk].push(d);
  }

  let weeksTracked = 0, weeksMet = 0;

  for (const [, wkDates] of Object.entries(weeks)) {
    const counts = { zone2: 0, hiit: 0, strength: 0 };
    let hasAnyLog = false;

    for (const d of wkDates) {
      const log = logs[d];
      if (!log) continue;
      hasAnyLog = true;
      for (const ex of log.exercises || []) {
        const cat = ex.category === 'movement' ? 'hiit' : ex.category;
        if (cat in counts) counts[cat]++;
      }
    }

    if (!hasAnyLog) continue;
    weeksTracked++;

    const goals = settings.exerciseGoals;
    const allMet = Object.entries(goals).every(([cat, g]) =>
      counts[cat] >= g.target
    );
    if (allMet) weeksMet++;
  }

  return weeksTracked > 0 ? Math.round((weeksMet / weeksTracked) * 100) : null;
}
