import { useState, useCallback, useEffect } from 'react';
import * as storage from '../services/storage.js';
import * as sync from '../services/sync.js';
const { deepMerge } = storage;

export function useSettings() {
  const [settings, setSettings] = useState(() => storage.getSettings());

  // Reload when a pull brings in another device's newer settings
  useEffect(() => sync.onRemoteChange(({ settings: changed }) => {
    if (changed) setSettings(storage.getSettings());
  }), []);

  const update = useCallback((patch) => {
    setSettings(prev => {
      const next = deepMerge(prev, patch);
      storage.saveSettings(next);
      return next;
    });
  }, []);

  const replace = useCallback((next) => {
    storage.saveSettings(next);
    setSettings(next);
  }, []);

  return { settings, update, replace };
}
