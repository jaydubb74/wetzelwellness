import { useState, useCallback } from 'react';
import * as storage from '../services/storage.js';
const { deepMerge } = storage;

export function useSettings() {
  const [settings, setSettings] = useState(() => storage.getSettings());

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
