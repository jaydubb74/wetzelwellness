import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequest } from '../../../functions/api/sync/[[path]].js';

// Runs the real sync client against the real Pages Function, backed by an
// in-memory KV. Each openDevice() call is a fresh app load on that device.

const SYNC_KEY = 'family-passphrase';
const DATE = '2026-11-01';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  };
}

function memoryKV() {
  const m = new Map();
  return {
    m,
    async get(k, type) {
      const v = m.get(k);
      return v == null ? null : type === 'json' ? JSON.parse(v) : v;
    },
    async put(k, v) { m.set(k, v); },
    async list({ prefix }) {
      return { keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true };
    },
  };
}

let kv;

async function openDevice(store) {
  globalThis.localStorage = store;
  vi.resetModules();
  const storage = await import('../storage.js');
  const sync = await import('../sync.js');
  return { storage, sync };
}

function remote(key) {
  return JSON.parse(kv.m.get(key));
}

function log(fields) {
  return { date: DATE, meals: [], supplements: {}, water: 0, electrolytes: false, exercises: [], ...fields };
}

/** A device that has entered the key and completed its first pull. */
async function joinedDevice(store, settingsPatch = {}) {
  const d = await openDevice(store);
  d.storage.saveSettings({ ...d.storage.getSettings(), ...settingsPatch, syncKey: SYNC_KEY });
  await d.sync.syncNow();
  await d.sync.flush();
  return d;
}

beforeEach(() => {
  kv = memoryKV();
  const env = { WW_KV: kv, SYNC_KEY };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url, 'https://app.test');
    const path = u.pathname.replace(/^\/api\/sync\/?/, '').split('/').filter(Boolean);
    return onRequest({ request: new Request(u, init), env, params: { path } });
  };
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-11-01T08:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('local saves', () => {
  it('stamp a fresh updatedAt even when the record already has one', async () => {
    const { storage } = await openDevice(memoryStorage());
    storage.saveDailyLog(DATE, log({ water: 1, updatedAt: 1 }));
    expect(storage.getDailyLog(DATE).updatedAt).toBe(Date.now());

    storage.saveSettings({ ...storage.getSettings(), waterTarget: 9, updatedAt: 1 });
    expect(storage.getSettings().updatedAt).toBe(Date.now());
  });

  it('keep the API key out of the shared settings record', async () => {
    const { storage } = await openDevice(memoryStorage());
    storage.saveSettings({ ...storage.getSettings(), waterTarget: 9 });
    const before = localStorage.getItem('ww_settings');

    vi.setSystemTime(new Date('2026-11-01T09:00:00'));
    storage.saveSettings({ ...storage.getSettings(), apiKey: 'sk-ant-this-device' });

    expect(storage.getSettings().apiKey).toBe('sk-ant-this-device');
    expect(localStorage.getItem('ww_settings')).toBe(before); // untouched, same timestamp
  });

  it('still find an API key saved inside settings by an older build', async () => {
    const store = memoryStorage();
    store.setItem('ww_settings', JSON.stringify({ apiKey: 'sk-ant-from-old-build', updatedAt: 1 }));
    const { storage } = await openDevice(store);
    expect(storage.getSettings().apiKey).toBe('sk-ant-from-old-build');

    storage.saveSettings({ ...storage.getSettings(), waterTarget: 9 });
    expect(storage.getSettings().apiKey).toBe('sk-ant-from-old-build');
    expect(JSON.parse(store.getItem('ww_settings'))).not.toHaveProperty('apiKey');
  });

  it('freeze goals onto earlier logs once, without touching timestamps', async () => {
    const { storage } = await openDevice(memoryStorage());
    storage.saveDailyLog('2026-10-30', log({ water: 3 }), { updatedAt: 5 });
    storage.saveDailyLog(DATE, log({ water: 1 }), { updatedAt: 6 });
    const frozen = { macroTargets: { protein: 180 } };

    storage.stampMissingTargets(frozen, DATE);
    storage.stampMissingTargets({ macroTargets: { protein: 999 } }, DATE); // already stamped: no-op

    expect(storage.getDailyLog('2026-10-30')).toMatchObject({ targets: frozen, updatedAt: 5 });
    expect(storage.getDailyLog(DATE).targets).toBeUndefined(); // today follows settings
  });

  it('keep an explicit remote timestamp', async () => {
    const { storage } = await openDevice(memoryStorage());
    storage.saveDailyLog(DATE, log({}), { updatedAt: 42 });
    expect(storage.getDailyLog(DATE).updatedAt).toBe(42);
  });
});

describe('sync', () => {
  it('pushes edits made after a reload', async () => {
    const phone = memoryStorage();
    let a = await joinedDevice(phone);
    a.storage.saveDailyLog(DATE, log({ water: 1 }));
    await a.sync.flush();

    // Reopen the app later and edit the stored log (as useDailyLog does)
    vi.setSystemTime(new Date('2026-11-01T12:00:00'));
    a = await openDevice(phone);
    await a.sync.pullAll();
    a.storage.saveDailyLog(DATE, { ...a.storage.getDailyLog(DATE), water: 2 });
    await a.sync.flush();

    expect(remote(`log:${DATE}`).log.water).toBe(2);

    const laptop = await joinedDevice(memoryStorage());
    expect(laptop.storage.getDailyLog(DATE).water).toBe(2);
  });

  it('a new device entering the key adopts the shared settings instead of overwriting them', async () => {
    const custom = { macroTargets: { protein: 210, fat: 70, carbs: 180, calories: 2400 }, waterTarget: 10 };
    await joinedDevice(memoryStorage(), custom);
    expect(remote('settings').settings.macroTargets.protein).toBe(210);

    vi.setSystemTime(new Date('2026-11-01T09:00:00'));
    const b = await openDevice(memoryStorage());
    // Typing the key saves (and timestamps) default settings on the new device
    b.storage.saveSettings({ ...b.storage.getSettings(), syncKey: SYNC_KEY });
    await b.sync.flush(); // debounced push fires before the user hits Sync now
    expect(remote('settings').settings.macroTargets.protein).toBe(210);

    await b.sync.syncNow();
    await b.sync.flush();
    expect(b.storage.getSettings().macroTargets.protein).toBe(210);
    expect(b.storage.getSettings().waterTarget).toBe(10);
    expect(b.storage.getSettings().syncKey).toBe(SYNC_KEY);
    expect(remote('settings').settings.macroTargets.protein).toBe(210);
  });

  it('keeps an Oura credential the new device entered when the shared copy has none', async () => {
    await joinedDevice(memoryStorage(), { waterTarget: 12 });

    vi.setSystemTime(new Date('2026-11-01T09:00:00'));
    const b = await joinedDevice(memoryStorage(), { ouraClientId: 'oura-client-b' });

    expect(b.storage.getSettings().waterTarget).toBe(12);
    expect(b.storage.getSettings().ouraClientId).toBe('oura-client-b');
    expect(remote('settings').settings.ouraClientId).toBe('oura-client-b');
    expect(remote('settings').settings.waterTarget).toBe(12);
  });

  it('never syncs the API key or the sync key, and each device keeps its own', async () => {
    // A shared copy written by an older build still carries an API key
    await kv.put('settings', JSON.stringify({
      settings: { waterTarget: 12, apiKey: 'sk-ant-legacy', syncKey: SYNC_KEY },
      updatedAt: Date.now(),
    }));

    vi.setSystemTime(new Date('2026-11-01T09:00:00'));
    const a = await joinedDevice(memoryStorage(), { apiKey: 'sk-ant-device-a' });
    a.storage.saveSettings({ ...a.storage.getSettings(), waterTarget: 6 });
    await a.sync.flush();

    expect(a.storage.getSettings().apiKey).toBe('sk-ant-device-a');
    expect(remote('settings').settings.waterTarget).toBe(6);
    expect(remote('settings').settings).not.toHaveProperty('apiKey');
    expect(remote('settings').settings).not.toHaveProperty('syncKey');

    const b = await joinedDevice(memoryStorage());
    expect(b.storage.getSettings().waterTarget).toBe(6);
    expect(b.storage.getSettings().apiKey).toBe('');
  });

  it('still lets a newer settings edit win once both devices are joined', async () => {
    const phone = memoryStorage();
    await joinedDevice(phone, { waterTarget: 12 });

    vi.setSystemTime(new Date('2026-11-01T09:00:00'));
    const b = await joinedDevice(memoryStorage());
    b.storage.saveSettings({ ...b.storage.getSettings(), waterTarget: 6 });
    await b.sync.flush();

    vi.setSystemTime(new Date('2026-11-01T10:00:00'));
    const a = await openDevice(phone);
    await a.sync.pullAll();
    expect(a.storage.getSettings().waterTarget).toBe(6);
  });

  it('shares saved meals once each device has joined', async () => {
    const a = await joinedDevice(memoryStorage());
    a.storage.saveFavoriteMeal({ description: 'Greek yogurt bowl', macros: { protein: 30, fat: 5, carbs: 20, calories: 250 } });
    await a.sync.flush();

    const b = await joinedDevice(memoryStorage());
    expect(b.storage.getSavedMeals().map(m => m.description)).toEqual(['Greek yogurt bowl']);
  });

  it('pulls the newer copy when the server refuses a stale push, and tells open views', async () => {
    const a = await joinedDevice(memoryStorage());
    a.storage.saveDailyLog(DATE, log({ water: 1 })); // queued, not yet pushed

    // Meanwhile another device writes a newer copy of the same day
    await kv.put(`log:${DATE}`, JSON.stringify({ log: log({ water: 5 }), updatedAt: Date.now() + 60_000 }));

    const changes = [];
    a.sync.onRemoteChange(c => changes.push(c));
    await a.sync.flush();

    expect(a.storage.getDailyLog(DATE).water).toBe(5);
    expect(changes).toEqual([{ dates: [DATE], settings: false }]);
  });
});
