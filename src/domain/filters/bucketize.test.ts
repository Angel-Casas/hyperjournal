import { describe, it, expect } from 'vitest';
import {
  holdDurationBucketOf,
  timeOfDayBandOf,
  dayOfWeekOf,
  tradeSizeBucketOf,
} from './bucketize';

describe('holdDurationBucketOf', () => {
  it('classifies 0ms as scalp', () => {
    expect(holdDurationBucketOf(0)).toBe('scalp');
  });

  it('classifies just-below-5m as scalp', () => {
    expect(holdDurationBucketOf(5 * 60_000 - 1)).toBe('scalp');
  });

  it('classifies exactly 5m as intraday (boundary is inclusive-low)', () => {
    expect(holdDurationBucketOf(5 * 60_000)).toBe('intraday');
  });

  it('classifies 4 hours as intraday', () => {
    expect(holdDurationBucketOf(4 * 3_600_000)).toBe('intraday');
  });

  it('classifies exactly 8 hours as swing', () => {
    expect(holdDurationBucketOf(8 * 3_600_000)).toBe('swing');
  });

  it('classifies exactly 7 days as position', () => {
    expect(holdDurationBucketOf(7 * 86_400_000)).toBe('position');
  });

  it('classifies very large hold as position', () => {
    expect(holdDurationBucketOf(365 * 86_400_000)).toBe('position');
  });
});

describe('timeOfDayBandOf', () => {
  // 2026-04-29T03:00:00Z
  const T = Date.UTC(2026, 3, 29, 3, 0, 0);

  it('returns overnight in UTC (03:00)', () => {
    expect(timeOfDayBandOf(T, 'UTC')).toBe('overnight');
  });

  it('returns evening in NY (23:00)', () => {
    expect(timeOfDayBandOf(T, 'America/New_York')).toBe('evening');
  });

  it('returns afternoon in Tokyo (12:00)', () => {
    expect(timeOfDayBandOf(T, 'Asia/Tokyo')).toBe('afternoon');
  });

  it('puts 06:00 in morning (boundary is inclusive-low)', () => {
    const six = Date.UTC(2026, 3, 29, 6, 0, 0);
    expect(timeOfDayBandOf(six, 'UTC')).toBe('morning');
  });
});

describe('dayOfWeekOf', () => {
  const T = Date.UTC(2026, 3, 29, 3, 0, 0); // Wed UTC, Tue NY

  it('returns wed in UTC', () => {
    expect(dayOfWeekOf(T, 'UTC')).toBe('wed');
  });

  it('returns tue in NY (cross-midnight)', () => {
    expect(dayOfWeekOf(T, 'America/New_York')).toBe('tue');
  });
});

describe('tradeSizeBucketOf', () => {
  it('classifies $50 as micro', () => {
    expect(tradeSizeBucketOf(50)).toBe('micro');
  });

  it('classifies exactly $100 as small (boundary)', () => {
    expect(tradeSizeBucketOf(100)).toBe('small');
  });

  it('classifies $5000 as medium', () => {
    expect(tradeSizeBucketOf(5000)).toBe('medium');
  });

  it('classifies $1M as whale', () => {
    expect(tradeSizeBucketOf(1_000_000)).toBe('whale');
  });
});
