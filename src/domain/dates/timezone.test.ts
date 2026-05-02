import { describe, it, expect } from 'vitest';
import { hourInTimeZone, weekdayIndexInTimeZone } from './timezone';

// 2026-04-29T03:00:00Z = Wed 23:00 NY (EDT, UTC-4) = Wed 12:00 Tokyo (JST, UTC+9)
const T = Date.UTC(2026, 3, 29, 3, 0, 0);

describe('hourInTimeZone', () => {
  it('returns UTC hour for UTC zone', () => {
    expect(hourInTimeZone(T, 'UTC')).toBe(3);
  });

  it('returns local hour for America/New_York', () => {
    // NY EDT is UTC-4 in late April; 03:00 UTC = 23:00 prior day
    expect(hourInTimeZone(T, 'America/New_York')).toBe(23);
  });

  it('returns local hour for Asia/Tokyo', () => {
    // JST is UTC+9; 03:00 UTC = 12:00 same day
    expect(hourInTimeZone(T, 'Asia/Tokyo')).toBe(12);
  });
});

describe('weekdayIndexInTimeZone', () => {
  it('returns Wed=2 in UTC', () => {
    // 2026-04-29 is a Wednesday → DAY_OF_WEEK_ORDER index 2
    expect(weekdayIndexInTimeZone(T, 'UTC')).toBe(2);
  });

  it('returns Tue=1 in America/New_York (03:00Z Wed = 23:00 Tue NY)', () => {
    // NY EDT is UTC-4; 03:00Z Wed → 23:00 prior-day NY = Tue → index 1
    expect(weekdayIndexInTimeZone(T, 'America/New_York')).toBe(1);
  });

  it('returns Wed=2 in Asia/Tokyo (03:00Z Wed = 12:00 Wed Tokyo)', () => {
    // JST is UTC+9; same wall-day in Tokyo
    expect(weekdayIndexInTimeZone(T, 'Asia/Tokyo')).toBe(2);
  });
});
