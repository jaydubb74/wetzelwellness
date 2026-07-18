import { useState, useEffect, useCallback, useRef } from 'react';
import { getLocalDateKey, offsetDate } from '../utils/dates.js';
import * as storage from '../services/storage.js';
import * as oura from '../services/oura.js';
import { emptyLog } from './useDailyLog.js';

// How many days back to recheck for activity Oura hadn't finished syncing
// yet at the time we first fetched that day (daily_activity can lag sleep
// data by hours). Kept short — most days are complete on the first fetch.
const BACKFILL_DAYS = 2;

function ouraIncomplete(o) {
  return !o || o.activity == null;
}

/**
 * One-time-per-session sweep of the last BACKFILL_DAYS days: re-fetches any
 * day whose activity was still missing when it was last fetched, and applies
 * the result to THAT day's stored log (not today's), so a sync triggered
 * while viewing today still lands on the right date.
 */
async function backfillRecentDays(todayKey) {
  for (let i = 1; i <= BACKFILL_DAYS; i++) {
    const d = offsetDate(todayKey, -i);
    const existing = storage.getDailyLog(d);
    if (!ouraIncomplete(existing?.oura)) continue;
    try {
      const data = await oura.fetchOuraDay(d);
      if (ouraIncomplete(data)) continue; // still not posted upstream — retry next session
      storage.saveDailyLog(d, { ...(existing || emptyLog(d)), oura: data });
    } catch {
      // best-effort — try again next app open
    }
  }
}

/**
 * Keeps `log.oura` populated for the given date.
 * - Past days: fetched once, then served from the stored log forever —
 *   unless activity was missing, in which case backfillRecentDays retries it.
 * - Today: re-fetched when the stored copy is older than TODAY_REFRESH_MS.
 * - No token configured: does nothing.
 */
export function useOura(date, log, updateLog) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);
  const backfillRan = useRef(false);

  const refresh = useCallback(async (force = false) => {
    if (!oura.isConnected() || inFlight.current) return;
    const isToday = date === getLocalDateKey();
    const existing = log?.oura;
    const fresh = existing && (Date.now() - (existing.fetchedAt || 0) < oura.TODAY_REFRESH_MS);
    if (!force && existing && (!isToday || fresh)) return;

    inFlight.current = true;
    setSyncing(true);
    setError(null);
    try {
      const data = await oura.fetchOuraDay(date);
      updateLog(prev => ({ ...prev, oura: data }));
    } catch (e) {
      setError(e.message);
    } finally {
      inFlight.current = false;
      setSyncing(false);
    }
  }, [date, log?.oura, updateLog]);

  // Auto-fetch on mount / date change.
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // One-time-per-mount sweep for recent past days Oura hadn't finished
  // syncing yet — independent of which date is currently being viewed.
  useEffect(() => {
    if (backfillRan.current || !oura.isConnected()) return;
    backfillRan.current = true;
    backfillRecentDays(getLocalDateKey());
  }, []);

  return { oura: log?.oura || null, syncing, error, refresh };
}
