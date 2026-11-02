import { useState, useEffect, useRef, useCallback } from 'react';
import { estimateFoodGroups, scaleGroups } from '../services/llm.js';

// MealLogger logs a portioned meal as "<description> (×1.5)"
function splitPortion(description) {
  const m = description.match(/^(.*) \(×([\d.]+)\)$/);
  return m ? { base: m[1], portion: Number(m[2]) } : { base: description, portion: 1 };
}

/**
 * Fills in food-group servings for the day's meals that don't have them
 * (saved meals, older corrections, meals logged before estimates existed),
 * so food quality comes from the meals without entering servings by hand.
 *
 * @returns {{ estimating: number, error: string, retry: () => void }}
 */
export function useFoodGroupEstimates(date, meals, updateMeal, enabled) {
  const tried = useRef(new Set());       // `${date}:${mealId}` already asked about
  const currentDate = useRef(date);
  const [estimating, setEstimating] = useState(0);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    currentDate.current = date;
    setError('');
  }, [date]);

  useEffect(() => {
    if (!enabled) return;
    for (const meal of meals) {
      const key = `${date}:${meal.id}`;
      if (meal.groups || tried.current.has(key)) continue;
      tried.current.add(key);
      setEstimating(n => n + 1);
      const { base, portion } = splitPortion(meal.description);
      estimateFoodGroups(base)
        .then(groups => {
          // updateMeal edits whichever day is open, so drop late answers and
          // ask again the next time this day is opened
          if (currentDate.current === date) updateMeal(meal.id, { groups: scaleGroups(groups, portion) });
          else tried.current.delete(key);
        })
        .catch(e => {
          if (currentDate.current === date) setError(e.message);
          else tried.current.delete(key);
        })
        .finally(() => setEstimating(n => n - 1));
    }
  }, [date, meals, updateMeal, enabled, attempt]);

  const retry = useCallback(() => {
    for (const key of [...tried.current]) if (key.startsWith(`${date}:`)) tried.current.delete(key);
    setError('');
    setAttempt(a => a + 1);
  }, [date]);

  return { estimating, error, retry };
}
