import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  varianceBand, formatVariance, hasManualEntry, snapshotTargets, targetsFor,
  scoreDay, sessionsForDay, exerciseForRange, scorePeriod,
} from '../scoring.js';
import { getWeekDates, getMonthDates } from '../dates.js';

const settings = {
  macroTargets: { protein: 180, fat: 75, carbs: 200, calories: 2200 },
  waterTarget: 8,
  exerciseGoals: {
    zone2:    { target: 3, label: 'Zone 2 Cardio' },
    hiit:     { target: 2, label: 'HIIT' },
    strength: { target: 3, label: 'Strength Training' },
  },
  supplements: [
    { id: 's1', name: 'Vitamin D3', timing: 'morning-empty', active: true },
    { id: 's2', name: 'Creatine', timing: 'with-food-morning', active: true },
    { id: 's3', name: 'Zinc', timing: 'nighttime', active: false },
  ],
};

const meal = protein => ({ macros: { protein, fat: 0, carbs: 0, calories: 0 } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-15T12:00:00'));
});
afterEach(() => vi.useRealTimers());

describe('varianceBand', () => {
  it('is green within ±10%, yellow to ±20%, red beyond — over or under', () => {
    expect(varianceBand(180, 180).band).toBe('green');
    expect(varianceBand(198, 180).band).toBe('green');  // exactly +10%
    expect(varianceBand(162, 180).band).toBe('green');  // exactly −10%
    expect(varianceBand(199, 180).band).toBe('yellow');
    expect(varianceBand(216, 180).band).toBe('yellow'); // exactly +20%
    expect(varianceBand(144, 180).band).toBe('yellow'); // exactly −20%
    expect(varianceBand(217, 180).band).toBe('red');
    expect(varianceBand(100, 180).band).toBe('red');
  });

  it('returns null without a target', () => {
    expect(varianceBand(50, 0)).toBeNull();
  });

  it('formats signed percentages', () => {
    expect(formatVariance(0.123)).toBe('+12%');
    expect(formatVariance(-0.25)).toBe('−25%');
    expect(formatVariance(0.001)).toBe('on target');
  });
});

describe('hasManualEntry', () => {
  it('ignores days that only carry Oura data', () => {
    expect(hasManualEntry({ meals: [], supplements: {}, water: 0, exercises: [], oura: { sleep: {} } })).toBe(false);
    expect(hasManualEntry({ meals: [], supplements: { s1: false }, water: 0, exercises: [] })).toBe(false);
  });

  it('counts any hand-entered item', () => {
    expect(hasManualEntry({ meals: [meal(20)] })).toBe(true);
    expect(hasManualEntry({ water: 1 })).toBe(true);
    expect(hasManualEntry({ supplements: { s1: true } })).toBe(true);
    expect(hasManualEntry({ exercises: [{ category: 'strength' }] })).toBe(true);
  });
});

describe('per-day goals', () => {
  it('scores a past day against the goals frozen into it, not current settings', () => {
    const frozen = { ...snapshotTargets(settings), macroTargets: { ...settings.macroTargets, protein: 150 } };
    const log = { meals: [meal(150)], targets: frozen };

    expect(scoreDay('2026-11-10', log, settings).protein.band).toBe('green');
    // Today always follows current settings
    expect(scoreDay('2026-11-15', log, settings).protein.band).toBe('yellow');
  });

  it('falls back to current settings for logs with no snapshot', () => {
    expect(targetsFor('2026-11-10', { meals: [] }, settings).macroTargets.protein).toBe(180);
  });

  it('scores supplements against the list that was active that day', () => {
    const frozen = { ...snapshotTargets(settings), supplements: [{ id: 's1', name: 'Vitamin D3' }] };
    const day = scoreDay('2026-11-10', { supplements: { s1: true }, targets: frozen }, settings);
    expect(day.supplements).toBe(1); // s2 was added later; doesn't count against this day
  });

  it('snapshots only active supplements', () => {
    expect(snapshotTargets(settings).supplements.map(s => s.id)).toEqual(['s1', 's2']);
  });
});

describe('sessionsForDay', () => {
  it('counts hand-logged sessions and ignores Oura workouts', () => {
    const log = {
      exercises: [{ category: 'strength' }, { category: 'zone2' }],
      oura: { workouts: [{ category: 'strength' }, { category: 'zone2' }] },
    };
    expect(sessionsForDay(log)).toEqual({ zone2: 1, hiit: 0, strength: 1 });
  });

  it('counts the movement goal toward HIIT', () => {
    expect(sessionsForDay({ exercises: [{ category: 'movement' }] })).toEqual({ zone2: 0, hiit: 1, strength: 0 });
  });
});

describe('exerciseForRange', () => {
  it('uses weekly targets for a week', () => {
    const dates = getWeekDates('2026-11-15');
    const logs = { [dates[1]]: { exercises: [{ category: 'strength' }] } };
    const { counts, targets, score } = exerciseForRange(dates, logs, settings);
    expect(targets).toEqual({ zone2: 3, hiit: 2, strength: 3 });
    expect(counts.strength).toBe(1);
    expect(score).toBe(Math.round((0 + 0 + 1 / 3) / 3 * 100));
  });

  it('scales targets to the length of a month instead of using weekly ones', () => {
    const dates = getMonthDates('2026-11-15'); // 30 days
    const logs = {};
    // One strength session every week for 4 weeks
    for (const d of ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']) {
      logs[d] = { exercises: [{ category: 'strength' }] };
    }
    const { targets, score } = exerciseForRange(dates, logs, settings);
    expect(targets.strength).toBeCloseTo(12.86, 2);
    // 4 of ~12.9 strength sessions is far from "all targets met"
    expect(score).toBeLessThan(15);
  });

  it('is null when nothing was logged by hand', () => {
    const dates = getWeekDates('2026-11-15');
    expect(exerciseForRange(dates, {}, settings).score).toBeNull();
    const ouraOnly = { [dates[0]]: { meals: [], exercises: [], oura: { sleep: { score: 80 } } } };
    expect(exerciseForRange(dates, ouraOnly, settings).score).toBeNull();
  });
});

describe('scorePeriod', () => {
  it('leaves Oura-only days out of compliance', () => {
    const dates = ['2026-11-10', '2026-11-11'];
    const logs = {
      '2026-11-10': { meals: [meal(180)], supplements: { s1: true, s2: true }, water: 8, exercises: [] },
      '2026-11-11': { meals: [], supplements: {}, water: 0, exercises: [], oura: { sleep: { score: 80 } } },
    };
    const { tracked, daily, summary, met } = scorePeriod(dates, logs, settings);
    expect(tracked).toBe(1);
    expect(met).toEqual({ nutrition: 1, supplements: 1, hydration: 1 });
    expect(daily['2026-11-11']).toBeUndefined();
    expect(summary).toMatchObject({ nutrition: 100, supplements: 100, hydration: 100 });
  });

  it('counts nutrition as met only inside the green band', () => {
    const dates = ['2026-11-10', '2026-11-11', '2026-11-12'];
    const logs = {
      '2026-11-10': { meals: [meal(185)] }, // green
      '2026-11-11': { meals: [meal(210)] }, // yellow (+17%)
      '2026-11-12': { meals: [meal(100)] }, // red
    };
    expect(scorePeriod(dates, logs, settings).summary.nutrition).toBe(33);
  });
});
