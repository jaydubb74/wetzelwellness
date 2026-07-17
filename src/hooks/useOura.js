import { useState, useEffect, useCallback, useRef } from 'react';
import { getLocalDateKey } from '../utils/dates.js';
import * as oura from '../services/oura.js';

/**
 * Keeps `log.oura` populated for the given date.
 * - Past days: fetched once, then served from the stored log forever.
 * - Today: re-fetched when the stored copy is older than TODAY_REFRESH_MS.
 * - No token configured: does nothing.
 */
export function useOura(date, log, updateLog) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);

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

  return { oura: log?.oura || null, syncing, error, refresh };
}
