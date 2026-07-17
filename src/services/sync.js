/**
 * Cross-device sync client. localStorage stays the local source of truth;
 * this module mirrors it to /api/sync (Workers KV) when a sync key is set.
 *
 * - pullAll(): merge remote → local, last-write-wins per date by updatedAt.
 * - Pushes are debounced; storage.js notifies us on every save.
 * - No sync key configured → everything no-ops.
 */
import * as storage from './storage.js';

const PUSH_DEBOUNCE_MS = 2000;

let pendingDates = new Set();
let settingsDirty = false;
let pushTimer = null;
let suspended = false; // true while applying remote data, to avoid echo pushes

let status = { state: 'idle', lastSyncedAt: null, error: null };
const statusListeners = new Set();

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

export function isConfigured() {
  return Boolean(storage.getSettings().syncKey);
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'x-sync-key': storage.getSettings().syncKey,
  };
}

// ── Pull ──────────────────────────────────────────────────────────────────────

export async function pullAll() {
  if (!isConfigured()) return { pulled: false };
  setStatus({ state: 'syncing', error: null });
  try {
    const res = await fetch('/api/sync', { headers: headers() });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Sync failed (${res.status})`);
    const { logs = {}, settings } = await res.json();

    suspended = true;
    try {
      // Merge logs per date: newest updatedAt wins; push back local-newer dates.
      const local = storage.getAllLogs();
      for (const [date, remote] of Object.entries(logs)) {
        const localLog = local[date];
        const localAt = localLog?.updatedAt || 0;
        if (remote.updatedAt > localAt) {
          storage.saveDailyLog(date, { ...remote.log, updatedAt: remote.updatedAt });
        } else if (localAt > remote.updatedAt) {
          pendingDates.add(date);
        }
      }
      // Local-only dates not on remote yet
      for (const date of Object.keys(local)) {
        if (!logs[date]) pendingDates.add(date);
      }

      // Settings: remote wins if newer. Never let a pulled settings object
      // clobber the local sync key we just used.
      if (settings && settings.updatedAt > (storage.getSettings().updatedAt || 0)) {
        const syncKey = storage.getSettings().syncKey;
        storage.saveSettings({ ...settings.settings, syncKey, updatedAt: settings.updatedAt });
      } else if ((storage.getSettings().updatedAt || 0) > (settings?.updatedAt || 0)) {
        settingsDirty = true;
      }
    } finally {
      suspended = false;
    }

    if (pendingDates.size || settingsDirty) schedulePush();
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

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(flush, PUSH_DEBOUNCE_MS);
}

export async function flush() {
  if (!isConfigured()) return;
  clearTimeout(pushTimer);
  const dates = [...pendingDates];
  pendingDates.clear();
  const pushSettings = settingsDirty;
  settingsDirty = false;

  if (!dates.length && !pushSettings) return;
  setStatus({ state: 'syncing', error: null });
  try {
    const all = storage.getAllLogs();
    await Promise.all([
      ...dates
        .filter(d => all[d])
        .map(d =>
          fetch(`/api/sync/log/${d}`, {
            method: 'PUT',
            headers: headers(),
            body: JSON.stringify({ log: all[d], updatedAt: all[d].updatedAt || Date.now() }),
          }).then(r => { if (!r.ok) throw new Error(`Push failed for ${d} (${r.status})`); })
        ),
      ...(pushSettings
        ? [(() => {
            const s = storage.getSettings();
            return fetch('/api/sync/settings', {
              method: 'PUT',
              headers: headers(),
              body: JSON.stringify({ settings: s, updatedAt: s.updatedAt || Date.now() }),
            }).then(r => { if (!r.ok) throw new Error(`Settings push failed (${r.status})`); });
          })()]
        : []),
    ]);
    setStatus({ state: 'idle', lastSyncedAt: Date.now() });
  } catch (e) {
    // Re-queue for the next attempt
    dates.forEach(d => pendingDates.add(d));
    if (pushSettings) settingsDirty = true;
    setStatus({ state: 'error', error: e.message });
  }
}

/** Manual "Sync now": push anything pending, then pull. */
export async function syncNow() {
  await flush();
  return pullAll();
}

// Mirror every local save to KV (debounced).
storage.setSyncNotifier({ onLog: notifyLogSaved, onSettings: notifySettingsSaved });
