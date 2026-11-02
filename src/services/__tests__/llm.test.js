import { describe, it, expect, afterEach } from 'vitest';
import { applySettingsIntent, parseMealMacros, saveMealCorrection } from '../llm.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe('applySettingsIntent', () => {
  it('sends only tracking preferences and keeps only preference changes', async () => {
    let sentBody = '';
    globalThis.fetch = async (_url, init) => {
      sentBody = init.body;
      const reply = {
        macroTargets: { protein: 200 },
        ouraAuth: { accessToken: 'model-supplied' },
        apiKey: 'model-supplied',
      };
      return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(reply) }] }));
    };

    const patch = await applySettingsIntent('set protein to 200g', {
      macroTargets: { protein: 180, fat: 75, carbs: 200, calories: 2200 },
      supplements: [],
      exerciseGoals: {},
      waterTarget: 8,
      apiKey: 'sk-ant-secret-key',
      ouraClientSecret: 'oura-client-secret',
      ouraAuth: { accessToken: 'oura-access', refreshToken: 'oura-refresh', expiresAt: 0 },
      syncKey: 'family-passphrase',
    });

    for (const secret of ['sk-ant-secret-key', 'oura-client-secret', 'oura-access', 'oura-refresh', 'family-passphrase']) {
      expect(sentBody).not.toContain(secret);
    }
    expect(patch).toEqual({ macroTargets: { protein: 200 } });
  });
});

describe('saveMealCorrection', () => {
  it('returns corrected macros the next time the meal is typed, without calling the model', async () => {
    const store = new Map();
    globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    globalThis.fetch = async () => { throw new Error('should not call the model'); };

    saveMealCorrection('Chicken Burrito Bowl', { protein: 48, fat: 20, carbs: 70, calories: 650 });
    const result = await parseMealMacros('  chicken   burrito bowl ');

    expect(result).toEqual({ protein: 48, fat: 20, carbs: 70, calories: 650, fromCache: true });
  });

  it('keeps corrections to built-in items', async () => {
    const store = new Map();
    globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };

    saveMealCorrection('2 eggs', { protein: 14, fat: 10, carbs: 0, calories: 140 });
    expect((await parseMealMacros('2 eggs')).protein).toBe(14);
  });
});

describe('meal food-group estimates', () => {
  function stubModel(reply) {
    const store = new Map();
    globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    globalThis.fetch = async () => new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(reply) }] }));
  }
  const macros = { protein: 30, fat: 12, carbs: 45, calories: 420 };

  it('keeps servings per group, rounded to the nearest half', async () => {
    stubModel({ ...macros, groups: { vegetables: 1.3, fruit: 0, wholeGrains: 2, legumes: 0.5, nuts: 0 } });
    const result = await parseMealMacros('salmon grain bowl');
    expect(result.groups).toEqual({ vegetables: 1.5, fruit: 0, wholeGrains: 2, legumes: 0.5, nuts: 0 });
  });

  it('drops an unusable estimate rather than treating it as zero servings', async () => {
    stubModel({ ...macros, groups: { vegetables: -1 } });
    expect((await parseMealMacros('mystery plate')).groups).toBeUndefined();
    stubModel(macros);
    expect((await parseMealMacros('another plate')).groups).toBeUndefined();
  });
});
