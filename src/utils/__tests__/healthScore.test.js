import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HEALTH_SCORE_CONFIG, weightedPoints, bandPoints, sleepPoints, scoreHealthDay,
  averageHealth, lastSevenDays, planFor, editPlan, upcomingPlanDays,
} from '../healthScore.js';

// Sun–Sat
const PLAN_DAYS = [['recovery'], ['strength'], ['zone2'], ['strength', 'stretch'], ['zone2'], ['strength'], ['stretch', 'zone2']];

const settings = {
  macroTargets: { protein: 185, fat: 75, carbs: 200, calories: 2200 },
  waterTarget: 8,
  supplements: [],
  exerciseGoals: {},
  calorieRange: { min: 2000, max: 2400 },
  foodGroupTargets: { vegetables: 3, fruit: 2, wholeGrains: 3, legumes: null, nuts: null },
  stepsTarget: 10000,
  planHistory: [{ from: '2026-01-01', days: PLAN_DAYS }],
};

const weekday = date => new Date(date + 'T00:00:00').getDay();

// A day that meets every target exactly (sleep 85 = 100 points)
function perfectLog(date, overrides = {}) {
  const planned = PLAN_DAYS[weekday(date)].filter(c => c !== 'recovery');
  return {
    date,
    meals: [{ macros: { protein: 185, fat: 70, carbs: 200, calories: 2200 }, groups: { vegetables: 3, fruit: 2, wholeGrains: 3, legumes: 0, nuts: 0 } }],
    supplements: {},
    water: 0,
    exercises: planned.map(category => ({ category })),
    steps: 10000,
    oura: { sleep: { score: 85 }, readiness: { score: 70 }, fetchedAt: Date.now() },
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-15T12:00:00')); // local time
});
afterEach(() => vi.useRealTimers());

describe('weighting', () => {
  it('uses 34 / 33 / 33', () => {
    expect(HEALTH_SCORE_CONFIG.weights).toEqual({ nutrition: 34, movement: 33, sleep: 33 });
  });

  it('turns nutrition 90, movement 85, sleep 60 into 78.5', () => {
    expect(weightedPoints({ nutrition: 90, movement: 85, sleep: 60 }, HEALTH_SCORE_CONFIG.weights)).toBe(78.5);
  });

  it('scores a day that meets every target at 100', () => {
    const day = scoreHealthDay('2026-11-12', perfectLog('2026-11-12'), settings);
    expect(day.status).toBe('final');
    expect(day.points).toBe(100);
    expect(Object.values(day.pillars).map(p => p.points)).toEqual([100, 100, 100]);
  });
});

describe('caps and curves', () => {
  it('caps a huge step day at 125', () => {
    const day = scoreHealthDay('2026-11-12', perfectLog('2026-11-12', { steps: 40000 }), settings);
    const everyday = day.pillars.movement.components.find(c => c.key === 'everyday');
    expect(everyday.points).toBe(125);
    expect(day.pillars.movement.points).toBeLessThanOrEqual(125);
  });

  it('maps sleep 85 → 100, adds a point per point above, up to 115', () => {
    expect(sleepPoints(85)).toBe(100);
    expect(sleepPoints(92)).toBe(107);
    expect(sleepPoints(100)).toBe(115);
    expect(Math.round(sleepPoints(60) * 10) / 10).toBe(70.6);
  });

  it('never rewards eating more: food quality tops out at 100', () => {
    const log = perfectLog('2026-11-12');
    log.meals[0].groups = { vegetables: 12, fruit: 9, wholeGrains: 10, legumes: 0, nuts: 0 };
    const fq = scoreHealthDay('2026-11-12', log, settings).pillars.nutrition.components.find(c => c.key === 'foodQuality');
    expect(fq.points).toBe(100);
  });

  it('takes points off for calories over the range, and for under it too', () => {
    expect(bandPoints(2200, 2000, 2400)).toBe(100);
    expect(bandPoints(2700, 2000, 2400)).toBe(50);  // falls to 0 at 3,000
    expect(bandPoints(1700, 2000, 2400)).toBe(40);  // eating less doesn't score more
    expect(bandPoints(1400, 2000, 2400)).toBe(0);
  });

  it('gives full protein points within ±10%, fewer beyond either side', () => {
    const protein = grams => {
      const log = perfectLog('2026-11-12');
      log.meals[0].macros.protein = grams;
      return scoreHealthDay('2026-11-12', log, settings).pillars.nutrition.components.find(c => c.key === 'protein').points;
    };
    expect(protein(170)).toBe(100);
    expect(protein(200)).toBe(100);
    expect(protein(230)).toBeLessThan(100);
    expect(protein(140)).toBeLessThan(100);
  });
});

describe('missing data', () => {
  it('leaves the daily score incomplete without moving the missing weight', () => {
    const log = perfectLog('2026-11-12', { oura: { readiness: { score: 70 }, fetchedAt: Date.now() } });
    const day = scoreHealthDay('2026-11-12', log, settings);
    expect(day.pillars.sleep.status).toBe('incomplete');
    expect(day.pillars.sleep.points).toBeNull();
    expect(day.pillars.nutrition.points).toBe(100);
    expect(day.status).toBe('incomplete');
    expect(day.points).toBeNull(); // not 67, not 100
  });

  it('treats a day with no food as incomplete, not zero', () => {
    const day = scoreHealthDay('2026-11-12', perfectLog('2026-11-12', { meals: [] }), settings);
    expect(day.pillars.nutrition.status).toBe('incomplete');
    expect(day.pillars.nutrition.points).toBeNull();
    expect(day.pillars.nutrition.note).toBe('No food logged');
  });

  it('flags meals without a food-group estimate instead of assuming zero', () => {
    const log = perfectLog('2026-11-12');
    delete log.meals[0].groups;
    const fq = scoreHealthDay('2026-11-12', log, settings).pillars.nutrition.components.find(c => c.key === 'foodQuality');
    expect(fq.status).toBe('incomplete');
    expect(fq.note).toMatch(/no food-group estimate/);

    // Setting the day's servings by hand completes it
    log.foodGroups = { vegetables: 3, fruit: 1, wholeGrains: 3, legumes: 0, nuts: 0 };
    const fixed = scoreHealthDay('2026-11-12', log, settings).pillars.nutrition.components.find(c => c.key === 'foodQuality');
    expect(fixed.status).toBe('final');
    expect(fixed.points).toBeCloseTo(83.3, 1); // veg 1, fruit 0.5, grains 1
  });

  it('is incomplete when a target has not been set', () => {
    const unset = { ...settings, calorieRange: { min: null, max: null }, stepsTarget: null };
    const day = scoreHealthDay('2026-11-12', perfectLog('2026-11-12'), unset);
    expect(day.pillars.nutrition.note).toMatch(/calorie range/);
    expect(day.pillars.movement.note).toMatch(/steps target/);
    expect(day.points).toBeNull();
  });
});

describe('weekly plan and recovery days', () => {
  it('gives a planned recovery day full adherence without a workout', () => {
    const sunday = '2026-11-08';
    const day = scoreHealthDay(sunday, perfectLog(sunday, { exercises: [] }), settings);
    const adherence = day.pillars.movement.components.find(c => c.key === 'adherence');
    expect(adherence.points).toBe(100);
    expect(adherence.detail).toBe('Planned recovery day');
  });

  it('scores the share of planned sessions done', () => {
    const wednesday = '2026-11-11'; // strength + stretch
    const day = scoreHealthDay(wednesday, perfectLog(wednesday, { exercises: [{ category: 'strength' }] }), settings);
    expect(day.pillars.movement.components.find(c => c.key === 'adherence').points).toBe(50);
  });

  it('applies plan edits from tomorrow, so a day is planned in advance', () => {
    const allRecovery = Array.from({ length: 7 }, () => ['recovery']);
    const history = editPlan(settings.planHistory, allRecovery, '2026-11-15');
    expect(planFor('2026-11-15', history)).toEqual(['recovery']); // Sunday's existing plan
    expect(planFor('2026-11-16', history)).toEqual(['recovery']); // new plan
    expect(planFor('2026-11-17', history)).toEqual(['recovery']);
    expect(planFor('2026-11-17', settings.planHistory)).toEqual(['zone2']);
    expect(upcomingPlanDays(history)).toEqual(allRecovery);

    // A second edit the same day replaces the pending version
    const again = editPlan(history, PLAN_DAYS, '2026-11-15');
    expect(again).toHaveLength(2);
    expect(planFor('2026-11-17', again)).toEqual(['zone2']);
  });

  it('is incomplete before any plan exists', () => {
    const day = scoreHealthDay('2026-11-12', perfectLog('2026-11-12'), { ...settings, planHistory: [] });
    expect(day.pillars.movement.status).toBe('incomplete');
  });
});

describe('dates and completion', () => {
  it("marks today's score provisional and earlier days final", () => {
    expect(scoreHealthDay('2026-11-15', perfectLog('2026-11-15'), settings).status).toBe('provisional');
    expect(scoreHealthDay('2026-11-14', perfectLog('2026-11-14'), settings).status).toBe('final');
  });

  it('rolls over at local midnight', () => {
    vi.setSystemTime(new Date('2026-11-15T23:30:00'));
    expect(scoreHealthDay('2026-11-15', perfectLog('2026-11-15'), settings).phase).toBe('today');
    vi.setSystemTime(new Date('2026-11-16T00:30:00'));
    expect(scoreHealthDay('2026-11-15', perfectLog('2026-11-15'), settings).status).toBe('final');
  });

  it("counts a day's Oura sleep as last night's sleep, final even while the day is live", () => {
    const day = scoreHealthDay('2026-11-15', perfectLog('2026-11-15'), settings);
    expect(day.pillars.sleep.label).toBe("Last night's sleep");
    expect(day.pillars.sleep.status).toBe('final');
    expect(day.pillars.nutrition.status).toBe('provisional'); // still logging today
  });

  it("keeps a past day's Oura steps provisional until fetched after the day ended", () => {
    const fetchedDuring = new Date('2026-11-14T15:00:00').getTime();
    const log = perfectLog('2026-11-14', { steps: undefined });
    log.oura = { ...log.oura, activity: { steps: 6000 }, fetchedAt: fetchedDuring };
    const everyday = scoreHealthDay('2026-11-14', log, settings).pillars.movement.components.find(c => c.key === 'everyday');
    expect(everyday.status).toBe('provisional');
    expect(everyday.note).toMatch(/final count/);

    log.oura.fetchedAt = new Date('2026-11-15T08:00:00').getTime();
    expect(scoreHealthDay('2026-11-14', log, settings).pillars.movement.components.find(c => c.key === 'everyday').status).toBe('final');
  });

  it('prefers steps entered by hand over Oura', () => {
    const log = perfectLog('2026-11-14', { steps: 12000 });
    log.oura.activity = { steps: 3000 };
    const everyday = scoreHealthDay('2026-11-14', log, settings).pillars.movement.components.find(c => c.key === 'everyday');
    expect(everyday.points).toBe(120);
    expect(everyday.detail).toMatch(/entered/);
  });

  it('keeps readiness out of the score', () => {
    const low = perfectLog('2026-11-12', { oura: { sleep: { score: 85 }, readiness: { score: 40 }, fetchedAt: Date.now() } });
    const high = perfectLog('2026-11-12', { oura: { sleep: { score: 85 }, readiness: { score: 95 }, fetchedAt: Date.now() } });
    expect(scoreHealthDay('2026-11-12', low, settings).points).toBe(scoreHealthDay('2026-11-12', high, settings).points);
    expect(scoreHealthDay('2026-11-12', low, settings).readiness).toBe(40);
  });
});

describe('seven-day averages', () => {
  it('covers the seven finished days before today', () => {
    expect(lastSevenDays('2026-11-15')).toEqual([
      '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14',
    ]);
  });

  it('averages only finalized values and says how many days they cover', () => {
    const dates = lastSevenDays('2026-11-15');
    const logs = {
      '2026-11-12': perfectLog('2026-11-12'),                          // 100
      '2026-11-13': perfectLog('2026-11-13', { oura: { sleep: { score: 68 }, fetchedAt: Date.now() } }), // sleep 80 → 93.4
      '2026-11-14': perfectLog('2026-11-14', { meals: [] }),           // nutrition incomplete
      '2026-11-15': perfectLog('2026-11-15'),                          // today: excluded
    };
    const avg = averageHealth(dates, logs, settings);
    expect(avg.score).toEqual({ average: 96.7, days: 2, of: 7 });
    expect(avg.nutrition).toEqual({ average: 100, days: 2, of: 7 });
    expect(avg.sleep.days).toBe(3);
    expect(avg.sleep.average).toBe(93.3); // (100 + 80 + 100) / 3
  });
});
