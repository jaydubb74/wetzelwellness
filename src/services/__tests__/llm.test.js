import { describe, it, expect, afterEach } from 'vitest';
import { applySettingsIntent } from '../llm.js';

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
