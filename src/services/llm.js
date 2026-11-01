import * as storage from './storage.js';

// Single place to change the Claude model used for every LLM call in the app.
const ANTHROPIC_MODEL = 'claude-haiku-5-5';

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

  const result = validateMacros(await callLLM(buildMealPrompt(description)));

  // Persist to cache
  const updated = { ...cache, [key]: result };
  storage.saveNutritionCache(updated);

  return { ...result, fromCache: false };
}

// Reject malformed LLM output before it reaches the log or the cache
function validateMacros(raw) {
  const toInt = (v) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const result = {
    protein:  toInt(raw.protein),
    fat:      toInt(raw.fat),
    carbs:    toInt(raw.carbs),
    calories: toInt(raw.calories),
  };
  if (Object.values(result).some(v => v === null)) {
    throw new Error('The AI returned invalid macro values. Please try again.');
  }
  if (Array.isArray(raw.breakdown)) result.breakdown = raw.breakdown;
  return result;
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
  // Never send credentials (or let the model edit them) — strip from both sides
  const { apiKey, ouraToken, syncKey, ...safeSettings } = currentSettings;

  const prompt = `You are a configuration assistant for a personal wellness tracker. Apply the user's requested change to their settings.

CURRENT SETTINGS (JSON):
${JSON.stringify(safeSettings, null, 2)}

USER REQUEST: "${userMessage}"

Reply with ONLY a JSON object containing the fields that should be updated, using the exact same structure as the settings above. Only include changed fields — do not echo unchanged ones.

Examples:
- "set protein to 200g" → { "macroTargets": { "protein": 200 } }
- "add CoQ10 200mg to morning supplements" → { "supplements": [...current array with new item appended] }
- "change zone 2 target to 4 sessions" → { "exerciseGoals": { "zone2": { "target": 4 } } }
- "set water target to 10 glasses" → { "waterTarget": 10 }

When adding a supplement, generate a unique id like "s<timestamp>", include: id, name, timing ("morning-empty"|"with-food-morning"|"afternoon"|"nighttime"), active: true.`;

  const patch = await callLLM(prompt);
  delete patch.apiKey;
  delete patch.ouraToken;
  delete patch.syncKey;
  return patch;
}

// ── Core API call ─────────────────────────────────────────────────────────────

async function callLLM(prompt) {
  // Always route through /api/llm:
  //   - Dev:        Vite proxy forwards to Anthropic and injects the key server-side
  //   - Production: Cloudflare Pages Function at functions/api/llm.js proxies the request,
  //                 avoiding CORS restrictions on direct browser → Anthropic calls.
  const isDev = import.meta.env.DEV;
  const headers = { 'content-type': 'application/json' };

  // In dev the Vite proxy injects the key server-side; in production the
  // browser supplies the user's own key from Settings.
  if (!isDev) {
    const { apiKey } = storage.getSettings();
    if (!apiKey) {
      throw new Error('No API key configured. Add your Anthropic API key in the Settings tab.');
    }
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  }

  const res = await fetch('/api/llm', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
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
