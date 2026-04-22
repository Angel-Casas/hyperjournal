import { describe, expect, it } from 'vitest';
import { todayUtcDateString } from './todayUtcDateString';

describe('todayUtcDateString', () => {
  it('returns YYYY-MM-DD in UTC for the given clock', () => {
    expect(todayUtcDateString(Date.UTC(2026, 3, 22, 15, 30))).toBe('2026-04-22');
  });

  it('pads single-digit month and day', () => {
    expect(todayUtcDateString(Date.UTC(2026, 0, 5))).toBe('2026-01-05');
  });

  it('is UTC-anchored regardless of the local clock', () => {
    expect(todayUtcDateString(Date.UTC(2026, 3, 22, 23, 30))).toBe('2026-04-22');
    expect(todayUtcDateString(Date.UTC(2026, 3, 23, 0, 30))).toBe('2026-04-23');
  });
});
