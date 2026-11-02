import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fetchOuraDay } from '../oura.js';

const realFetch = globalThis.fetch;

function stubOura(responses) {
  const requested = [];
  globalThis.fetch = async (url) => {
    const endpoint = new URL(url, 'https://app.test').searchParams.get('endpoint');
    requested.push(endpoint);
    const r = responses[endpoint];
    if (r instanceof Error) return new Response('{}', { status: 500 });
    return new Response(JSON.stringify({ data: r || [] }));
  };
  return requested;
}

beforeEach(() => {
  // Legacy personal access token path: no OAuth refresh involved
  const store = new Map([['ww_settings', JSON.stringify({ ouraToken: 'test-token' })]]);
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
});
afterEach(() => { globalThis.fetch = realFetch; });

describe('fetchOuraDay', () => {
  it('requests sleep, readiness, and daily activity (for steps) — no workouts', async () => {
    const requested = stubOura({});
    await fetchOuraDay('2026-11-01');
    expect(requested.sort()).toEqual(['daily_activity', 'daily_readiness', 'daily_sleep', 'sleep']);
  });

  it('maps sleep, readiness, and steps', async () => {
    stubOura({
      daily_sleep: [{ score: 84 }],
      sleep: [
        { type: 'rest', total_sleep_duration: 1200 },
        { type: 'long_sleep', total_sleep_duration: 27000, deep_sleep_duration: 5400, rem_sleep_duration: 6300, lowest_heart_rate: 48, average_hrv: 61.4 },
      ],
      daily_readiness: [{ score: 77, temperature_deviation: -0.2 }],
      daily_activity: [{ steps: 9120, score: 80, active_calories: 450 }],
    });
    const day = await fetchOuraDay('2026-11-01');

    expect(day.sleep).toMatchObject({ score: 84, totalSeconds: 27000, restingHeartRate: 48, averageHrv: 61.4 });
    expect(day.readiness).toEqual({ score: 77, temperatureDeviation: -0.2 });
    expect(day.activity).toEqual({ steps: 9120 }); // steps only
    expect(day).not.toHaveProperty('workouts');
    expect(day.errors).toBeUndefined();
  });

  it('keeps sleep when readiness fails, and reports the failure', async () => {
    stubOura({ daily_sleep: [{ score: 84 }], daily_readiness: new Error('down') });
    const day = await fetchOuraDay('2026-11-01');

    expect(day.sleep.score).toBe(84);
    expect(day.readiness).toBeNull();
    expect(day.errors.readiness).toMatch(/500/);
  });
});
