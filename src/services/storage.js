const KEY = {
  LOGS: 'ww_daily_logs',
  SETTINGS: 'ww_settings',
  NUTRITION_CACHE: 'ww_nutrition_cache',
  SAVED_MEALS: 'ww_saved_meals',
  SAVED_MEALS_DELETED: 'ww_saved_meals_deleted',
  SYNC_JOINED: 'ww_sync_joined_key',
  API_KEY: 'ww_api_key',
};

// ── Default settings ──────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  macroTargets: { protein: 180, fat: 75, carbs: 200, calories: 2200 },
  supplements: [
    { id: 's1', name: 'Vitamin D3',         timing: 'morning-empty',      active: true  },
    { id: 's2', name: 'Omega-3 Fish Oil',   timing: 'with-food-morning',  active: true  },
    { id: 's3', name: 'Vitamin K2',         timing: 'with-food-morning',  active: true  },
    { id: 's4', name: 'Creatine',           timing: 'with-food-morning',  active: true  },
    { id: 's5', name: 'Magnesium Glycinate',timing: 'nighttime',           active: true  },
    { id: 's6', name: 'Zinc',               timing: 'nighttime',           active: true  },
  ],
  exerciseGoals: {
    zone2:    { target: 3, label: 'Zone 2 Cardio',    unit: 'sessions/wk' },
    hiit:     { target: 2, label: 'HIIT',             unit: 'sessions/wk' },
    strength: { target: 3, label: 'Strength Training', unit: 'sessions/wk' },
  },
  waterTarget: 8,
  apiKey: '',
  ouraToken: '',        // legacy Personal Access Token (deprecated by Oura)
  ouraClientId: '',
  ouraClientSecret: '',
  ouraAuth: null,       // { accessToken, refreshToken, expiresAt } from OAuth
  syncKey: '',
};

// Never leave this device via sync: each device has its own Anthropic key,
// and the sync key is the credential itself.
export const DEVICE_LOCAL_KEYS = ['apiKey', 'syncKey'];

// Shared Oura credentials (refresh tokens are single-use, so every device
// needs the latest). When a device adopts the shared settings it keeps its
// own value for any of these the shared copy is missing.
export const CREDENTIAL_KEYS = ['ouraToken', 'ouraClientId', 'ouraClientSecret', 'ouraAuth'];

// The user's actual tracking preferences — update when adding a new one.
const PREFERENCE_KEYS = ['macroTargets', 'supplements', 'exerciseGoals', 'waterTarget'];

// Cross-device sync hooks — registered by services/sync.js so saves get
// mirrored to KV without a circular import.
let syncNotifier = null;
export function setSyncNotifier(notifier) {
  syncNotifier = notifier;
}

// Seed cache so common items work without an LLM call
const SEED_CACHE = {
  '1 egg':                    { protein: 6,  fat: 5,  carbs: 0,  calories: 70  },
  '2 eggs':                   { protein: 12, fat: 10, carbs: 0,  calories: 140 },
  '3 eggs':                   { protein: 18, fat: 15, carbs: 0,  calories: 210 },
  '4 eggs':                   { protein: 24, fat: 20, carbs: 0,  calories: 280 },
  'chicken breast 4oz':       { protein: 25, fat: 3,  carbs: 0,  calories: 130 },
  'chicken breast 6oz':       { protein: 38, fat: 4,  carbs: 0,  calories: 190 },
  'ground beef 4oz 93% lean': { protein: 22, fat: 7,  carbs: 0,  calories: 150 },
  'greek yogurt':             { protein: 20, fat: 0,  carbs: 9,  calories: 120 },
  'protein shake':            { protein: 25, fat: 3,  carbs: 5,  calories: 150 },
  'oatmeal 1 cup cooked':     { protein: 6,  fat: 3,  carbs: 27, calories: 150 },
  'brown rice 1 cup cooked':  { protein: 5,  fat: 2,  carbs: 45, calories: 220 },
  'white rice 1 cup cooked':  { protein: 4,  fat: 0,  carbs: 45, calories: 200 },
  'avocado':                  { protein: 3,  fat: 21, carbs: 12, calories: 240 },
  'avocado half':             { protein: 2,  fat: 11, carbs: 6,  calories: 120 },
  'banana':                   { protein: 1,  fat: 0,  carbs: 27, calories: 105 },
  'apple':                    { protein: 0,  fat: 0,  carbs: 25, calories: 95  },
  'almonds 1oz':              { protein: 6,  fat: 14, carbs: 6,  calories: 165 },
  'spinach 1 cup':            { protein: 1,  fat: 0,  carbs: 1,  calories: 7   },
  'sweet potato medium':      { protein: 2,  fat: 0,  carbs: 27, calories: 112 },
  'salmon 6oz':               { protein: 34, fat: 14, carbs: 0,  calories: 265 },
  'cottage cheese 1 cup':     { protein: 25, fat: 5,  carbs: 6,  calories: 180 },
};

// ── Daily logs ────────────────────────────────────────────────────────────────

export function getDailyLog(date) {
  const all = getAllLogs();
  return all[date] || null;
}

// Local saves always get a fresh timestamp. (Reusing log.updatedAt froze it
// once a log had been reloaded from storage, so the sync server rejected every
// later edit as stale.) Only sync passes `updatedAt`, when applying remote data.
export function saveDailyLog(date, log, { updatedAt = Date.now() } = {}) {
  const all = getAllLogs();
  all[date] = { ...log, updatedAt };
  localStorage.setItem(KEY.LOGS, JSON.stringify(all));
  syncNotifier?.onLog?.(date);
}

/**
 * One-time freeze for days logged before goals were recorded per day: gives
 * every earlier log without a snapshot the `targets` passed in. Leaves
 * updatedAt alone and doesn't sync — each device stamps its own copy from
 * the shared settings, and later edits carry the snapshot anyway.
 */
export function stampMissingTargets(targets, beforeDate) {
  const all = getAllLogs();
  let changed = false;
  for (const [date, log] of Object.entries(all)) {
    if (date < beforeDate && !log.targets) {
      all[date] = { ...log, targets };
      changed = true;
    }
  }
  if (changed) localStorage.setItem(KEY.LOGS, JSON.stringify(all));
}

export function getAllLogs() {
  try {
    return JSON.parse(localStorage.getItem(KEY.LOGS) || '{}');
  } catch {
    return {};
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

function getStoredSettings() {
  try {
    return deepMerge(DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(KEY.SETTINGS) || '{}'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function getSettings() {
  const settings = getStoredSettings();
  // The Anthropic key has its own entry so it never syncs (older builds kept
  // it inside settings; that copy is only a fallback now).
  const apiKey = localStorage.getItem(KEY.API_KEY);
  if (apiKey !== null) settings.apiKey = apiKey;
  return settings;
}

// Same timestamp rule as saveDailyLog. A local save that changes nothing
// shared (e.g. only the API key) leaves the synced record and its timestamp
// alone, so it can't push a stale copy over another device's edits.
export function saveSettings(settings, { updatedAt } = {}) {
  const { apiKey = '', ...shared } = settings;
  localStorage.setItem(KEY.API_KEY, apiKey);
  if (updatedAt === undefined && sameSharedSettings(shared, getStoredSettings())) return;
  localStorage.setItem(KEY.SETTINGS, JSON.stringify({ ...shared, updatedAt: updatedAt ?? Date.now() }));
  syncNotifier?.onSettings?.();
}

function sameSharedSettings(a, b) {
  const strip = s => {
    const { apiKey, updatedAt, ...rest } = deepMerge(DEFAULT_SETTINGS, s);
    return rest;
  };
  return deepEqual(strip(a), strip(b));
}

/** Settings as they should leave this device: without device-local keys. */
export function withoutDeviceLocal(settings) {
  return Object.fromEntries(Object.entries(settings).filter(([k]) => !DEVICE_LOCAL_KEYS.includes(k)));
}

/** Just the tracking preferences from a settings-shaped object. */
export function pickPreferences(obj) {
  return Object.fromEntries(PREFERENCE_KEYS.filter(k => k in obj).map(k => [k, obj[k]]));
}

/** True when tracking preferences are still the built-in defaults. */
export function hasDefaultPreferences(settings) {
  return PREFERENCE_KEYS.every(k => deepEqual(settings[k], DEFAULT_SETTINGS[k]));
}

// ── Sync bookkeeping ──────────────────────────────────────────────────────────

/** The sync key this device last pulled with successfully ('' if never). */
export function getSyncJoinedKey() {
  return localStorage.getItem(KEY.SYNC_JOINED) || '';
}

export function setSyncJoinedKey(syncKey) {
  localStorage.setItem(KEY.SYNC_JOINED, syncKey);
}

// ── Nutrition cache ───────────────────────────────────────────────────────────

export function getNutritionCache() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY.NUTRITION_CACHE) || '{}');
    // Merge seed cache but stored values win (user may have corrected them)
    return { ...SEED_CACHE, ...stored };
  } catch {
    return { ...SEED_CACHE };
  }
}

export function saveNutritionCache(cache) {
  // Only persist user-added/LLM-generated entries (not the seed)
  const toSave = Object.fromEntries(
    Object.entries(cache).filter(([k]) => !(k in SEED_CACHE))
  );
  localStorage.setItem(KEY.NUTRITION_CACHE, JSON.stringify(toSave));
}

// ── Saved / favourite meals ───────────────────────────────────────────────────

export function getDeletedMeals() {
  try {
    return JSON.parse(localStorage.getItem(KEY.SAVED_MEALS_DELETED) || '{}');
  } catch {
    return {};
  }
}

/** Overwrite saved meals + tombstones without notifying sync (used when applying remote data). */
export function writeSavedMeals(meals, deleted) {
  localStorage.setItem(KEY.SAVED_MEALS, JSON.stringify(meals));
  localStorage.setItem(KEY.SAVED_MEALS_DELETED, JSON.stringify(deleted));
}

/** Union by id, de-dupe by description, drop tombstoned ids. Mirrors the server. */
export function mergeMeals(a, b) {
  const deleted = { ...(a?.deleted || {}), ...(b?.deleted || {}) };
  const byDesc = new Map();
  for (const m of [...(a?.meals || []), ...(b?.meals || [])]) {
    if (!m || !m.id || typeof m.description !== 'string' || deleted[m.id]) continue;
    const k = m.description.toLowerCase();
    const prev = byDesc.get(k);
    if (!prev || m.id < prev.id) byDesc.set(k, m);
  }
  const num = m => Number(String(m.id).replace(/\D/g, '')) || 0;
  return { meals: [...byDesc.values()].sort((x, y) => num(y) - num(x)), deleted };
}

export function getSavedMeals() {
  try {
    return JSON.parse(localStorage.getItem(KEY.SAVED_MEALS) || '[]');
  } catch {
    return [];
  }
}

/**
 * Saves a meal to the favourites list.
 * Silently skips exact-duplicate descriptions (case-insensitive).
 * Returns the updated array.
 */
export function saveFavoriteMeal({ description, macros }) {
  const meals = getSavedMeals();
  const dupe = meals.some(
    m => m.description.toLowerCase() === description.toLowerCase()
  );
  if (dupe) return meals;
  const updated = [
    { id: 'fav_' + Date.now(), description, macros },
    ...meals,
  ];
  localStorage.setItem(KEY.SAVED_MEALS, JSON.stringify(updated));
  syncNotifier?.onMeals?.();
  return updated;
}

/**
 * Removes a saved meal by id. Returns the updated array.
 */
export function removeFavoriteMeal(id) {
  const updated = getSavedMeals().filter(m => m.id !== id);
  localStorage.setItem(KEY.SAVED_MEALS, JSON.stringify(updated));
  localStorage.setItem(KEY.SAVED_MEALS_DELETED, JSON.stringify({ ...getDeletedMeals(), [id]: Date.now() }));
  syncNotifier?.onMeals?.();
  return updated;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function deepMerge(defaults, overrides) {
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    if (
      overrides[key] !== null &&
      typeof overrides[key] === 'object' &&
      !Array.isArray(overrides[key]) &&
      key in defaults &&
      typeof defaults[key] === 'object' &&
      !Array.isArray(defaults[key])
    ) {
      result[key] = deepMerge(defaults[key], overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => deepEqual(a[k], b[k]));
}
