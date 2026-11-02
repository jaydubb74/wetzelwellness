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

  // Entries without macros only remember a food-group estimate
  const hit = cache[key];
  if (hit?.calories != null) {
    if (hit.groups) return { ...hit, fromCache: true };
    // Remembered before food groups existed: fill them in now if we can
    const groups = await estimateFoodGroups(description).catch(() => null);
    return { ...hit, ...(groups ? { groups } : {}), fromCache: true };
  }

  const result = validateMacros(await callLLM(buildMealPrompt(description)));

  // Persist to cache
  const updated = { ...cache, [key]: result };
  storage.saveNutritionCache(updated);

  return { ...result, fromCache: false };
}

/**
 * Remembers corrected macros for a description, so the next time it's typed
 * the corrected values come back instead of the original estimate. The
 * food-group estimate is kept alongside when there is one.
 */
export function saveMealCorrection(description, macros, groups) {
  const { protein, fat, carbs, calories } = macros;
  storage.saveNutritionCache({
    ...storage.getNutritionCache(),
    [cacheKey(description)]: { protein, fat, carbs, calories, ...(groups ? { groups } : {}) },
  });
}

/**
 * Food-group servings for a meal that came without them (logged or saved
 * before estimates existed). Remembered per description, so each meal is only
 * asked about once.
 */
export async function estimateFoodGroups(description) {
  const key = cacheKey(description);
  const cached = storage.getNutritionCache()[key];
  if (cached?.groups) return cached.groups;
  const groups = validateGroups((await callLLM(buildGroupsPrompt(description))).groups);
  if (!groups) throw new Error('The AI returned an unusable food-group estimate. Please try again.');
  storage.saveNutritionCache({ ...storage.getNutritionCache(), [key]: { ...cached, groups } });
  return groups;
}

export const FOOD_GROUP_KEYS = ['vegetables', 'fruit', 'wholeGrains', 'legumes', 'nuts'];

/** Servings × portion, to the nearest half. */
export function scaleGroups(groups, multiplier) {
  return Object.fromEntries(FOOD_GROUP_KEYS.map(k => [k, Math.round((groups[k] || 0) * multiplier * 2) / 2]));
}

// Servings per food group, to the nearest half; null when the model didn't
// give a usable estimate (the meal then counts as having no estimate).
function validateGroups(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const groups = {};
  for (const k of FOOD_GROUP_KEYS) {
    const n = Number(raw[k] ?? 0);
    if (!Number.isFinite(n) || n < 0) return null;
    groups[k] = Math.round(n * 2) / 2;
  }
  return groups;
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
  const groups = validateGroups(raw.groups);
  if (groups) result.groups = groups;
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
  ],
  "groups": { "vegetables": <servings>, "fruit": <servings>, "wholeGrains": <servings>, "legumes": <servings>, "nuts": <servings> }
}

Use realistic portion estimates. Protein, fat, carbs, and calories must be positive integers.

${GROUPS_GUIDE}`;
}

const GROUPS_GUIDE = `For "groups", estimate standard servings (halves allowed, 0 if absent): vegetables — 1 cup raw leafy or ½ cup other vegetables; fruit — 1 medium fruit or ½ cup; wholeGrains — 1 slice whole-grain bread or ½ cup cooked whole grains (refined grains such as white rice or white bread don't count); legumes — ½ cup cooked beans, lentils, or chickpeas; nuts — 1 oz nuts or seeds, or 2 tbsp nut butter.`;

function buildGroupsPrompt(description) {
  return `Estimate the food groups in this meal. Reply with ONLY a valid JSON object — no prose, no markdown fences.

Meal: "${description}"

Required JSON shape:
{
  "groups": { "vegetables": <servings>, "fruit": <servings>, "wholeGrains": <servings>, "legumes": <servings>, "nuts": <servings> }
}

Use realistic portion estimates. ${GROUPS_GUIDE}`;
}

// ── Settings AI assistant ─────────────────────────────────────────────────────

export async function applySettingsIntent(userMessage, currentSettings) {
  // Only tracking preferences go to the model and only those come back, so
  // keys and Oura tokens are never sent or editable — including ones added later.
  const safeSettings = storage.pickPreferences(currentSettings);

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

  return storage.pickPreferences(await callLLM(prompt));
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
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `LLM API error ${res.status}`);
  }

  const data = await res.json();
  // Newer models may lead with non-text blocks (e.g. reasoning); join every text block.
  const text = (data.content || [])
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join('\n')
    .trim();

  // Extract JSON from the response (tolerates prose or ```json fences around it)
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    const why = data.stop_reason === 'max_tokens'
      ? 'the reply was cut off'
      : text ? `got: "${text.slice(0, 80)}"` : 'the reply had no text';
    throw new Error(`Could not parse JSON from LLM response (${why}).`);
  }

  try {
    return JSON.parse(match[0]);
  } catch {
    throw new Error('The AI returned malformed JSON. Please try again.');
  }
}
