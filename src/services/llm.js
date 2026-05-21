import * as storage from './storage.js';

// Normalize a meal description for cache key lookup
function cacheKey(desc) {
  return desc.toLowerCase().trim().replace(/\s+/g, ' ');
}

// ── Meal macro parsing ────────────────────────────────────────────────────────

export async function parseMealMacros(description) {
  const key = cacheKey(description);
  const cache = storage.getNutritionCache();

  if (cache[key]) {
    return { ...cache[key], fromCache: true };
  }

  const settings = storage.getSettings();
  if (!settings.apiKey) {
    throw new Error('No API key configured. Add your Anthropic API key in the Settings tab.');
  }

  const result = await callLLM(buildMealPrompt(description), settings.apiKey);

  // Persist to cache
  const updated = { ...cache, [key]: result };
  storage.saveNutritionCache(updated);

  return { ...result, fromCache: false };
}

function buildMealPrompt(description) {
  return `Analyze this meal and estimate the macronutrients. Reply with ONLY a valid JSON object — no prose, no markdown fences.

Meal: "${description}"

Required JSON shape:
{
  "protein": <integer grams>,
  "fat": <integer grams>,
  "carbs": <integer grams>,
  "calories": <integer>,
  "breakdown": [
    { "item": "<food name>", "protein": <g>, "fat": <g>, "carbs": <g>, "calories": <n> }
  ]
}

Use realistic portion estimates. Protein, fat, carbs, and calories must be positive integers.`;
}

// ── Settings AI assistant ─────────────────────────────────────────────────────

export async function applySettingsIntent(userMessage, currentSettings) {
  const settings = storage.getSettings();
  if (!settings.apiKey) {
    throw new Error('No API key configured. Add your Anthropic API key in the Settings tab.');
  }

  const prompt = `You are a configuration assistant for a personal wellness tracker. Apply the user's requested change to their settings.

CURRENT SETTINGS (JSON):
${JSON.stringify(currentSettings, null, 2)}

USER REQUEST: "${userMessage}"

Reply with ONLY a JSON object containing the fields that should be updated, using the exact same structure as the settings above. Only include changed fields — do not echo unchanged ones.

Examples:
- "set protein to 200g" → { "macroTargets": { "protein": 200 } }
- "add CoQ10 200mg to morning supplements" → { "supplements": [...current array with new item appended] }
- "change zone 2 target to 4 sessions" → { "exerciseGoals": { "zone2": { "target": 4 } } }
- "set water target to 10 glasses" → { "waterTarget": 10 }

When adding a supplement, generate a unique id like "s<timestamp>", include: id, name, timing ("morning-empty"|"with-food-morning"|"afternoon"|"nighttime"), active: true.`;

  const patch = await callLLM(prompt, settings.apiKey);
  return patch;
}

// ── Core API call ─────────────────────────────────────────────────────────────

async function callLLM(prompt, apiKey) {
  // Always route through /api/llm:
  //   - Dev:        Vite proxy forwards to Anthropic and injects the key server-side
  //   - Production: Cloudflare Pages Function at functions/api/llm.js proxies the request,
  //                 avoiding CORS restrictions on direct browser → Anthropic calls.
  const isDev = import.meta.env.DEV;
  const url = '/api/llm';

  const headers = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };

  // In dev the Vite proxy injects the key server-side, so strip it from the browser request.
  if (isDev) {
    delete headers['x-api-key'];
    delete headers['anthropic-version'];
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 768,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `LLM API error ${res.status}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text?.trim() || '';

  // Extract JSON from the response
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not parse JSON from LLM response.');

  return JSON.parse(match[0]);
}
