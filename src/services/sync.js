/**
 * Cross-device sync client. localStorage stays the local source of truth;
 * this module mirrors it to /api/sync (Workers KV) when a sync key is set.
 *
 * - pullAll(): merge remote → local, last-write-wins per date by updatedAt.
 * - Pushes are debounced; storage.js notifies us on every save.
 * - Nothing is pushed until this device has pulled once with the current
 *   key, so a fresh device can't overwrite the shared data with defaults.
 * - No sync key configured → everything no-ops.
 */
import * as storage from './storage.js';

const PUSH_DEBOUNCE_MS = 2000;
const PULL_THROTTLE_MS = 15_000;

let pendingDates = new Set();
let settingsDirty = false;
let mealsDirty = false;
let pushTimer = null;
let suspended = false; // true while applying remote data, to avoid echo pushes
let pullPromise = null;
let lastPullAt = 0;

let status = { state: 'idle', lastSyncedAt: null, error: null };
const statusListeners = new Set();
const remoteListeners = new Set();

function setStatus(patch) {
  status = { ...status, ...patch };
  statusListeners.forEach(fn => fn(status));
}

export function getStatus() {
  return status;
}

export function onStatusChange(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

/**
 * Called with { dates, settings } after a pull overwrote local data, so
 * mounted views can reload from storage instead of editing a stale copy.
 */
export function onRemoteChange(fn) {
  remoteListeners.add(fn);
  return () => remoteListeners.delete(fn);
}

export function isConfigured() {
  return Boolean(storage.getSettings().syncKey);
}

function isJoined() {
  const { syncKey } = storage.getSettings();
  return Boolean(syncKey) && storage.getSyncJoinedKey() === syncKey;
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'x-sync-key': storage.getSettings().syncKey,
  };
}

// ── Pull ──────────────────────────────────────────────────────────────────────

/** Single-flight: concurrent callers share one in-progress pull. */
export function pullAll() {
  if (!isConfigured()) return Promise.resolve({ pulled: false });
  pullPromise ??= doPull().finally(() => { pullPromise = null; });
  return pullPromise;
}

async function doPull() {
  lastPullAt = Date.now();
  const syncKey = storage.getSettings().syncKey;
  setStatus({ state: 'syncing', error: null });
  try {
    const res = await fetch('/api/sync', { headers: headers() });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Sync failed (${res.status})`);
    const { logs = {}, settings, meals: remoteMeals } = await res.json();

    const joining = storage.getSyncJoinedKey() !== syncKey;
    const changedDates = [];
    let settingsChanged = false;

    suspended = true;
    try {
      // Merge logs per date: newest updatedAt wins; push back local-newer dates.
      const local = storage.getAllLogs();
      for (const [date, remote] of Object.entries(logs)) {
        const localAt = local[date]?.updatedAt || 0;
        if (remote.updatedAt > localAt) {
          storage.saveDailyLog(date, remote.log, { updatedAt: remote.updatedAt });
          changedDates.push(date);
        } else if (localAt > remote.updatedAt) {
          pendingDates.add(date);
        }
      }
      // Local-only dates not on remote yet
      for (const date of Object.keys(local)) {
        if (!logs[date]) pendingDates.add(date);
      }

      // Settings: remote wins if newer. A device joining with untouched
      // preferences also adopts them — entering the sync key just stamped its
      // defaults as the newest copy, which would otherwise overwrite everyone.
      const localSettings = storage.getSettings();
      const localAt = localSettings.updatedAt || 0;
      const adopt = settings && (
        settings.updatedAt > localAt || (joining && storage.hasDefaultPreferences(localSettings))
      );
      if (adopt) {
        // Never let a pulled settings object clobber this device's own keys
        // (older shared copies may still carry an apiKey), or a credential
        // this device has and the shared copy lacks.
        const merged = { ...settings.settings };
        for (const k of storage.DEVICE_LOCAL_KEYS) merged[k] = localSettings[k];
        let filledGaps = false;
        for (const k of storage.CREDENTIAL_KEYS) {
          if (!merged[k] && localSettings[k]) {
            merged[k] = localSettings[k];
            filledGaps = true;
          }
        }
        storage.saveSettings(merged, filledGaps ? undefined : { updatedAt: settings.updatedAt });
        settingsDirty = filledGaps; // push the filled-in credentials back
        settingsChanged = true;
      } else if (localAt > (settings?.updatedAt || 0)) {
        settingsDirty = true;
      }

      // Saved meals: union-merge local + remote; push back if remote is missing any.
      const mergedMeals = storage.mergeMeals(
        { meals: storage.getSavedMeals(), deleted: storage.getDeletedMeals() },
        remoteMeals
      );
      storage.writeSavedMeals(mergedMeals.meals, mergedMeals.deleted);
      const ids = x => (x?.meals || []).map(m => m.id).sort().join(',');
      const dels = x => Object.keys(x?.deleted || {}).sort().join(',');
      if (ids(mergedMeals) !== ids(remoteMeals) || dels(mergedMeals) !== dels(remoteMeals)) mealsDirty = true;
    } finally {
      suspended = false;
    }

    storage.setSyncJoinedKey(syncKey);
    if (changedDates.length || settingsChanged) {
      remoteListeners.forEach(fn => fn({ dates: changedDates, settings: settingsChanged }));
    }
    if (pendingDates.size || settingsDirty || mealsDirty) schedulePush();
    setStatus({ state: 'idle', lastSyncedAt: Date.now() });
    return { pulled: true };
  } catch (e) {
    setStatus({ state: 'error', error: e.message });
    return { pulled: false, error: e.message };
  }
}

// ── Push ──────────────────────────────────────────────────────────────────────

export function notifyLogSaved(date) {
  if (suspended || !isConfigured()) return;
  pendingDates.add(date);
  schedulePush();
}

export function notifySettingsSaved() {
  if (suspended || !isConfigured()) return;
  settingsDirty = true;
  schedulePush();
}

export function notifyMealsSaved() {
  if (suspended || !isConfigured()) return;
  mealsDirty = true;
  schedulePush();
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(flush, PUSH_DEBOUNCE_MS);
}

// Throws on HTTP errors; resolves true when the server kept a newer copy.
async function put(url, body) {
  // keepalive lets a push started as the app is backgrounded finish.
  const r = await fetch(url, { method: 'PUT', headers: headers(), body: JSON.stringify(body), keepalive: true });
  if (!r.ok) throw new Error(`Push failed for ${url} (${r.status})`);
  const data = await r.json().catch(() => ({}));
  return Boolean(data.skipped);
}

export async function flush() {
  // Pending changes stay queued until the first pull with this key.
  if (!isJoined()) return;
  clearTimeout(pushTimer);
  const dates = [...pendingDates];
  pendingDates.clear();
  const pushSettings = settingsDirty;
  settingsDirty = false;
  const pushMeals = mealsDirty;
  mealsDirty = false;

  if (!dates.length && !pushSettings && !pushMeals) return;
  setStatus({ state: 'syncing', error: null });
  try {
    const all = storage.getAllLogs();
    const skipped = await Promise.all([
      ...dates
        .filter(d => all[d])
        .map(d => put(`/api/sync/log/${d}`, { log: all[d], updatedAt: all[d].updatedAt || Date.now() })),
      ...(pushSettings
        ? [(() => {
            const s = storage.getSettings();
            return put('/api/sync/settings', { settings: storage.withoutDeviceLocal(s), updatedAt: s.updatedAt || Date.now() });
          })()]
        : []),
      ...(pushMeals
        ? [fetch('/api/sync/meals', {
            method: 'PUT',
            headers: headers(),
            body: JSON.stringify({ meals: storage.getSavedMeals(), deleted: storage.getDeletedMeals() }),
          }).then(async r => {
            if (!r.ok) throw new Error(`Saved meals push failed (${r.status})`);
            const { merged } = await r.json();
            if (merged) storage.writeSavedMeals(merged.meals, merged.deleted);
          })]
        : []),
    ]);
    setStatus({ state: 'idle', lastSyncedAt: Date.now() });
    // Another device wrote something newer — bring it in rather than
    // silently keeping a copy the server refused.
    if (skipped.some(Boolean)) await pullAll();
  } catch (e) {
    // Re-queue for the next attempt
    dates.forEach(d => pendingDates.add(d));
    if (pushSettings) settingsDirty = true;
    if (pushMeals) mealsDirty = true;
    setStatus({ state: 'error', error: e.message });
  }
}

/** Manual "Sync now": push anything pending, then pull. */
export async function syncNow() {
  await flush();
  const result = await pullAll();
  // pullAll may have queued local-only items (older days, saved meals) for upload;
  // push them now instead of waiting on the debounce so "synced" really means synced.
  await flush();
  return result;
}

/**
 * Keeps long-lived sessions current: pull when the app comes back into view
 * (so edits start from the other device's latest copy) and push before it's
 * hidden. Call once after the first render.
 */
export function startAutoSync() {
  const pullIfStale = () => {
    if (Date.now() - lastPullAt > PULL_THROTTLE_MS) pullAll();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush();
    else pullIfStale();
  });
  window.addEventListener('focus', pullIfStale);
  window.addEventListener('online', () => flush().then(pullIfStale));
  window.addEventListener('pagehide', () => flush());
}

// Mirror every local save to KV (debounced).
storage.setSyncNotifier({ onLog: notifyLogSaved, onSettings: notifySettingsSaved, onMeals: notifyMealsSaved });
