import { useMemo } from 'react';
import * as storage from '../services/storage.js';
import { scorePeriod } from '../utils/scoring.js';

/**
 * Compliance metrics for the given array of date strings — see
 * scoring.scorePeriod for the shape ({ daily, tracked, summary, exercise }).
 */
export function useCompliance(dates, settings) {
  return useMemo(() => scorePeriod(dates, storage.getAllLogs(), settings), [dates, settings]);
}
