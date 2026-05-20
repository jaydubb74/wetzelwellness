import { useState, useCallback } from 'react';
import * as storage from '../services/storage.js';

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

function deepMerge(base, patch) {
  const result = { ...base };
  for (const key of Object.keys(patch)) {
    if (
      patch[key] !== null &&
      typeof patch[key] === 'object' &&
      !Array.isArray(patch[key]) &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key] || {}, patch[key]);
    } else {
      result[key] = patch[key];
    }
  }
  return result;
}
