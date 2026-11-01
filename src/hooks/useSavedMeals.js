import { useState, useEffect } from 'react';
import * as storage from '../services/storage.js';

/** The saved-meal list, kept current across every component that uses it. */
export function useSavedMeals() {
  const [meals, setMeals] = useState(() => storage.getSavedMeals());
  useEffect(() => storage.onSavedMealsChange(() => setMeals(storage.getSavedMeals())), []);
  return meals;
}
