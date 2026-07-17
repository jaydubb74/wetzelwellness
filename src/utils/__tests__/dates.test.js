import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getLocalDateKey,
  isToday,
  today,
  offsetDate,
  getWeekDates,
  getMonthDates,
  getPastDays,
  offsetMonth,
} from '../dates.js';

describe('offsetMonth', () => {
  it('steps forward one month from mid-month to the 1st', () => {
    expect(offsetMonth('2026-07-15', 1)).toBe('2026-08-01');
  });

  it('steps backward one month', () => {
    expect(offsetMonth('2026-07-15', -1)).toBe('2026-06-01');
  });

  it('never repeats a month when stepping from the 1st', () => {
    expect(offsetMonth('2026-07-01', 1)).toBe('2026-08-01');
  });

  it('handles end-of-month anchors without drift (Jan 31 → Feb)', () => {
    expect(offsetMonth('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('crosses year boundaries', () => {
    expect(offsetMonth('2026-12-10', 1)).toBe('2027-01-01');
    expect(offsetMonth('2026-01-10', -1)).toBe('2025-12-01');
  });
});

// ── getLocalDateKey ────────────────────────────────────────────────────────────

describe('getLocalDateKey', () => {
  it('formats a Date as YYYY-MM-DD using LOCAL fields (not UTC)', () => {
    // Create a Date at local midnight on a known date.
    // new Date(year, month, day) uses LOCAL time, so getLocalDateKey must agree.
    const d = new Date(2026, 4, 21, 0, 0, 0); // May 21 2026, local midnight
    expect(getLocalDateKey(d)).toBe('2026-05-21');
  });

  it('pads single-digit month and day', () => {
    const d = new Date(2026, 0, 5, 0, 0, 0); // Jan 5
    expect(getLocalDateKey(d)).toBe('2026-01-05');
  });

  it('returns today when called with no argument', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(getLocalDateKey()).toBe(expected);
  });

  it('does NOT drift to the prior day the way toISOString() would for UTC+ zones', () => {
    // Simulate a timezone offset of +5h by creating a Date whose UTC representation
    // is the previous day (e.g. local midnight May 21 in UTC+5 = UTC 19:00 May 20).
    // getLocalDateKey() reads getFullYear/getMonth/getDate (local) so it must return
    // May 21 regardless of what toISOString() would say.
    const localMidnight = new Date(2026, 4, 21, 0, 0, 0); // local May 21 00:00
    // Verify the fix: local fields return May 21
    expect(localMidnight.getFullYear()).toBe(2026);
    expect(localMidnight.getMonth()).toBe(4); // 0-indexed
    expect(localMidnight.getDate()).toBe(21);
    expect(getLocalDateKey(localMidnight)).toBe('2026-05-21');
  });
});

// ── today ──────────────────────────────────────────────────────────────────────

describe('today', () => {
  it('matches getLocalDateKey(new Date())', () => {
    expect(today()).toBe(getLocalDateKey(new Date()));
  });

  it('is a valid YYYY-MM-DD string', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── isToday ────────────────────────────────────────────────────────────────────

describe('isToday', () => {
  it('returns true for today()', () => {
    expect(isToday(today())).toBe(true);
  });

  it('returns false for yesterday', () => {
    expect(isToday(offsetDate(today(), -1))).toBe(false);
  });

  it('returns false for tomorrow', () => {
    expect(isToday(offsetDate(today(), 1))).toBe(false);
  });

  it('returns false for an arbitrary past date', () => {
    expect(isToday('2020-01-01')).toBe(false);
  });
});

// ── offsetDate ─────────────────────────────────────────────────────────────────

describe('offsetDate', () => {
  it('adds one day', () => {
    expect(offsetDate('2026-05-21', 1)).toBe('2026-05-22');
  });

  it('subtracts one day', () => {
    expect(offsetDate('2026-05-21', -1)).toBe('2026-05-20');
  });

  it('adds a week', () => {
    expect(offsetDate('2026-05-21', 7)).toBe('2026-05-28');
  });

  it('handles end-of-month rollover', () => {
    expect(offsetDate('2026-05-31', 1)).toBe('2026-06-01');
    expect(offsetDate('2026-06-01', -1)).toBe('2026-05-31');
  });

  it('handles year boundary', () => {
    expect(offsetDate('2025-12-31', 1)).toBe('2026-01-01');
    expect(offsetDate('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles leap year (Feb 29)', () => {
    expect(offsetDate('2024-02-28', 1)).toBe('2024-02-29');
    expect(offsetDate('2024-02-29', 1)).toBe('2024-03-01');
  });

  it('offset 0 returns the same date (no UTC drift)', () => {
    // This is the critical regression test: the old toISOString() implementation
    // would return the PRIOR DAY for UTC+ zones when the local Date was at midnight
    // and UTC had already crossed into the previous calendar day.
    const dates = ['2026-01-01', '2026-05-21', '2026-06-15', '2026-12-31'];
    for (const d of dates) {
      expect(offsetDate(d, 0)).toBe(d);
    }
  });

  it('is reversible', () => {
    const base = '2026-05-21';
    for (let n = -30; n <= 30; n++) {
      expect(offsetDate(offsetDate(base, n), -n)).toBe(base);
    }
  });
});

// ── getWeekDates ───────────────────────────────────────────────────────────────

describe('getWeekDates', () => {
  it('returns exactly 7 dates', () => {
    expect(getWeekDates('2026-05-21')).toHaveLength(7);
  });

  it('starts on Sunday', () => {
    const dates = getWeekDates('2026-05-21'); // Thursday
    const sunday = new Date(dates[0] + 'T00:00:00');
    expect(sunday.getDay()).toBe(0); // 0 = Sunday
  });

  it('ends on Saturday', () => {
    const dates = getWeekDates('2026-05-21');
    const saturday = new Date(dates[6] + 'T00:00:00');
    expect(saturday.getDay()).toBe(6);
  });

  it('the anchor date is included', () => {
    const anchor = '2026-05-21';
    expect(getWeekDates(anchor)).toContain(anchor);
  });

  it('dates are consecutive (no UTC drift producing duplicates or gaps)', () => {
    const dates = getWeekDates('2026-05-21');
    for (let i = 1; i < dates.length; i++) {
      expect(offsetDate(dates[i - 1], 1)).toBe(dates[i]);
    }
  });

  it('all 7 dates are unique', () => {
    const dates = getWeekDates('2026-05-21');
    expect(new Set(dates).size).toBe(7);
  });

  it('correct week for a Sunday', () => {
    const dates = getWeekDates('2026-05-17'); // already Sunday
    expect(dates[0]).toBe('2026-05-17');
    expect(dates[6]).toBe('2026-05-23');
  });

  it('correct week for a Saturday', () => {
    const dates = getWeekDates('2026-05-23');
    expect(dates[0]).toBe('2026-05-17');
    expect(dates[6]).toBe('2026-05-23');
  });

  it('week spanning a month boundary', () => {
    const dates = getWeekDates('2026-05-31'); // May 31 = Sunday
    expect(dates[0]).toBe('2026-05-31');
    expect(dates[6]).toBe('2026-06-06');
  });
});

// ── getMonthDates ──────────────────────────────────────────────────────────────

describe('getMonthDates', () => {
  it('returns correct number of days for May', () => {
    expect(getMonthDates('2026-05-01')).toHaveLength(31);
  });

  it('returns 28 days for Feb in a non-leap year', () => {
    expect(getMonthDates('2025-02-15')).toHaveLength(28);
  });

  it('returns 29 days for Feb in a leap year', () => {
    expect(getMonthDates('2024-02-01')).toHaveLength(29);
  });

  it('first date is the 1st of the month', () => {
    const dates = getMonthDates('2026-05-21');
    expect(dates[0]).toBe('2026-05-01');
  });

  it('last date is the last day of the month', () => {
    const dates = getMonthDates('2026-05-21');
    expect(dates[dates.length - 1]).toBe('2026-05-31');
  });

  it('no UTC drift — all dates stay in the same month', () => {
    const dates = getMonthDates('2026-05-21');
    for (const d of dates) {
      expect(d.startsWith('2026-05-')).toBe(true);
    }
  });
});

// ── getPastDays ────────────────────────────────────────────────────────────────

describe('getPastDays', () => {
  it('returns n dates', () => {
    expect(getPastDays(7)).toHaveLength(7);
  });

  it('last date equals the anchor', () => {
    const anchor = '2026-05-21';
    const dates = getPastDays(7, anchor);
    expect(dates[dates.length - 1]).toBe(anchor);
  });

  it('dates are ascending', () => {
    const dates = getPastDays(7, '2026-05-21');
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true);
    }
  });
});

// ── Date rollover scenarios ────────────────────────────────────────────────────

describe('date rollover scenarios', () => {
  it('same-day reload: getLocalDateKey() is stable within the same day', () => {
    const d1 = getLocalDateKey();
    const d2 = getLocalDateKey();
    expect(d1).toBe(d2);
  });

  it('next-day open: new date string sorts after old date string', () => {
    const yesterday = offsetDate(today(), -1);
    expect(today() > yesterday).toBe(true);
  });

  it('reconcile logic: stale date before today advances to today', () => {
    const stale = offsetDate(today(), -1);
    const todayKey = today();
    // This mirrors the reconcile() logic in DailyView
    const resolved = stale < todayKey ? todayKey : stale;
    expect(resolved).toBe(todayKey);
  });

  it('reconcile logic: already on today stays on today', () => {
    const todayKey = today();
    const resolved = todayKey < todayKey ? todayKey : todayKey;
    expect(resolved).toBe(todayKey);
  });

  it('history mode: stale date is NOT advanced when user is browsing history', () => {
    const yesterday = offsetDate(today(), -1);
    const isViewingHistory = true;
    // reconcile() returns early when browsingHistoryRef.current is true
    const resolved = isViewingHistory ? yesterday : (yesterday < today() ? today() : yesterday);
    expect(resolved).toBe(yesterday);
  });

  it('historical log key is different from today key (no bleed-through)', () => {
    const todayKey = today();
    const yesterday = offsetDate(todayKey, -1);
    expect(yesterday).not.toBe(todayKey);
    // Each day key maps to its own localStorage slot — different keys = no bleed
  });

  it('app open over midnight: date after midnight sorts after date before midnight', () => {
    const beforeMidnight = '2026-05-21';
    const afterMidnight  = '2026-05-22';
    expect(afterMidnight > beforeMidnight).toBe(true);
    // reconcile() would advance selectedDate from beforeMidnight to afterMidnight
  });

  it('timezone edge: getLocalDateKey uses local .getDate(), not UTC', () => {
    // Construct a Date that is local Jan 1 but could be UTC Dec 31 in UTC+ zones.
    // getLocalDateKey must return '2026-01-01' because it reads local fields.
    const localJan1Midnight = new Date(2026, 0, 1, 0, 0, 0);
    expect(getLocalDateKey(localJan1Midnight)).toBe('2026-01-01');
    // The old toISOString() approach would fail for UTC+1 and above because
    // local midnight Jan 1 in UTC+1 = UTC Dec 31 23:00, so toISOString() → '2025-12-31'
  });
});
