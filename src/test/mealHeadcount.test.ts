import { describe, it, expect } from 'vitest';
import { mealVerdict, mealCounts } from '../utils/mealHeadcount';

describe('meal headcount rules', () => {
  it('present at work with no answer counts as coming', () => {
    expect(mealVerdict('Present', null)).toBe('coming');
  });
  it('absent with no answer must be asked', () => {
    expect(mealVerdict('Absent', null)).toBe('ask');
  });
  it('absent but says eating counts as coming', () => {
    expect(mealVerdict('Absent', { in_room: 'in_room', food: 'eating' })).toBe('coming');
  });
  it('absent and away from room is not coming', () => {
    expect(mealVerdict('Absent', { in_room: 'away', food: 'unknown' })).toBe('not_coming');
  });
  it('present but skipping is not coming', () => {
    expect(mealVerdict('Present', { in_room: 'at_work', food: 'skip' })).toBe('not_coming');
  });
  it('no attendance and no answer is unknown', () => {
    expect(mealVerdict(undefined, null)).toBe('unknown');
  });
  it('counts each group', () => {
    expect(mealCounts(['coming', 'coming', 'ask', 'not_coming'])).toEqual({ coming: 2, not_coming: 1, ask: 1, unknown: 0 });
  });
});
