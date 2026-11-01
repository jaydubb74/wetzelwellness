import { useState, useEffect, useCallback } from 'react';
import * as storage from '../services/storage.js';
import * as sync from '../services/sync.js';

export function emptyLog(date) {
  return {
    date,
    meals: [],
    supplements: {},
    water: 0,
    electrolytes: false,
    exercises: [],
  };
}

export function useDailyLog(date) {
  const [log, setLog] = useState(() => storage.getDailyLog(date) || emptyLog(date));

  // Reload when date changes
  useEffect(() => {
    setLog(storage.getDailyLog(date) || emptyLog(date));
  }, [date]);

  // Reload when a pull brings in another device's newer copy of this day
  useEffect(() => sync.onRemoteChange(({ dates }) => {
    if (dates.includes(date)) setLog(storage.getDailyLog(date) || emptyLog(date));
  }), [date]);

  const update = useCallback((updater) => {
    setLog(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      storage.saveDailyLog(date, next);
      return next;
    });
  }, [date]);

  // ── Meal helpers ────────────────────────────────────────────────────────────

  const addMeal = useCallback((meal) => {
    update(prev => ({ ...prev, meals: [...prev.meals, { ...meal, id: uid() }] }));
  }, [update]);

  const removeMeal = useCallback((id) => {
    update(prev => ({ ...prev, meals: prev.meals.filter(m => m.id !== id) }));
  }, [update]);

  // ── Supplement helpers ──────────────────────────────────────────────────────

  const toggleSupplement = useCallback((suppId) => {
    update(prev => ({
      ...prev,
      supplements: { ...prev.supplements, [suppId]: !prev.supplements[suppId] },
    }));
  }, [update]);

  // ── Hydration helpers ───────────────────────────────────────────────────────

  const setWater = useCallback((glasses) => {
    update(prev => ({ ...prev, water: Math.max(0, glasses) }));
  }, [update]);

  const setElectrolytes = useCallback((val) => {
    update(prev => ({ ...prev, electrolytes: val }));
  }, [update]);

  // ── Exercise helpers ────────────────────────────────────────────────────────

  const addExercise = useCallback((entry) => {
    update(prev => ({ ...prev, exercises: [...prev.exercises, { ...entry, id: uid() }] }));
  }, [update]);

  const removeExercise = useCallback((id) => {
    update(prev => ({ ...prev, exercises: prev.exercises.filter(e => e.id !== id) }));
  }, [update]);

  return {
    log,
    update,
    addMeal,
    removeMeal,
    toggleSupplement,
    setWater,
    setElectrolytes,
    addExercise,
    removeExercise,
  };
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}
