import { describe, it, expect } from 'vitest';
import { mapWorkoutCategory, workoutLabel } from '../oura.js';

describe('mapWorkoutCategory', () => {
  it('maps strength-type activities', () => {
    expect(mapWorkoutCategory('strength_training', 'moderate')).toBe('strength');
    expect(mapWorkoutCategory('weightlifting', 'easy')).toBe('strength');
    expect(mapWorkoutCategory('crossFit', 'hard')).toBe('strength');
  });

  it('maps low-intensity movement activities', () => {
    expect(mapWorkoutCategory('walking', 'easy')).toBe('movement');
    expect(mapWorkoutCategory('hiking', 'moderate')).toBe('movement');
    expect(mapWorkoutCategory('yoga', 'easy')).toBe('movement');
  });

  it('splits cardio by intensity', () => {
    expect(mapWorkoutCategory('running', 'hard')).toBe('hiit');
    expect(mapWorkoutCategory('running', 'moderate')).toBe('zone2');
    expect(mapWorkoutCategory('cycling', 'easy')).toBe('zone2');
    expect(mapWorkoutCategory('swimming', 'hard')).toBe('hiit');
  });

  it('maps interval training to hiit', () => {
    expect(mapWorkoutCategory('interval_training', 'moderate')).toBe('hiit');
  });

  it('falls back to other', () => {
    expect(mapWorkoutCategory('badminton', 'easy')).toBe('other');
    expect(mapWorkoutCategory(null, null)).toBe('other');
  });
});

describe('workoutLabel', () => {
  it('prettifies snake_case activities', () => {
    expect(workoutLabel('strength_training')).toBe('Strength Training');
    expect(workoutLabel('running')).toBe('Running');
    expect(workoutLabel(null)).toBe('Workout');
  });
});
