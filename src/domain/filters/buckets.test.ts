import { describe, it, expect } from 'vitest';
import {
  HOLD_DURATION_BUCKETS,
  TIME_OF_DAY_BANDS,
  DAY_OF_WEEK_LABELS,
  TRADE_SIZE_BUCKETS,
} from './buckets';
import {
  HOLD_DURATION_ORDER,
  TIME_OF_DAY_ORDER,
  DAY_OF_WEEK_ORDER,
  TRADE_SIZE_ORDER,
} from '@entities/filter-state';

describe('HOLD_DURATION_BUCKETS', () => {
  it('is contiguous (each maxMs equals the next minMs)', () => {
    for (let i = 0; i < HOLD_DURATION_BUCKETS.length - 1; i++) {
      expect(HOLD_DURATION_BUCKETS[i]!.maxMs).toBe(
        HOLD_DURATION_BUCKETS[i + 1]!.minMs,
      );
    }
  });

  it('starts at 0 and ends at +Infinity', () => {
    expect(HOLD_DURATION_BUCKETS[0]!.minMs).toBe(0);
    expect(HOLD_DURATION_BUCKETS.at(-1)!.maxMs).toBe(Number.POSITIVE_INFINITY);
  });

  it('id sequence matches HOLD_DURATION_ORDER', () => {
    expect(HOLD_DURATION_BUCKETS.map((b) => b.id)).toEqual(HOLD_DURATION_ORDER);
  });
});

describe('TIME_OF_DAY_BANDS', () => {
  it('is contiguous and covers 0..24', () => {
    expect(TIME_OF_DAY_BANDS[0]!.startHour).toBe(0);
    expect(TIME_OF_DAY_BANDS.at(-1)!.endHour).toBe(24);
    for (let i = 0; i < TIME_OF_DAY_BANDS.length - 1; i++) {
      expect(TIME_OF_DAY_BANDS[i]!.endHour).toBe(
        TIME_OF_DAY_BANDS[i + 1]!.startHour,
      );
    }
  });

  it('id sequence matches TIME_OF_DAY_ORDER', () => {
    expect(TIME_OF_DAY_BANDS.map((b) => b.id)).toEqual(TIME_OF_DAY_ORDER);
  });
});

describe('DAY_OF_WEEK_LABELS', () => {
  it('has a label for every DAY_OF_WEEK_ORDER id', () => {
    for (const day of DAY_OF_WEEK_ORDER) {
      expect(DAY_OF_WEEK_LABELS[day]).toBeTypeOf('string');
      expect(DAY_OF_WEEK_LABELS[day].length).toBeGreaterThan(0);
    }
  });
});

describe('TRADE_SIZE_BUCKETS', () => {
  it('is contiguous and ends at +Infinity', () => {
    expect(TRADE_SIZE_BUCKETS[0]!.minNotional).toBe(0);
    expect(TRADE_SIZE_BUCKETS.at(-1)!.maxNotional).toBe(
      Number.POSITIVE_INFINITY,
    );
    for (let i = 0; i < TRADE_SIZE_BUCKETS.length - 1; i++) {
      expect(TRADE_SIZE_BUCKETS[i]!.maxNotional).toBe(
        TRADE_SIZE_BUCKETS[i + 1]!.minNotional,
      );
    }
  });

  it('id sequence matches TRADE_SIZE_ORDER', () => {
    expect(TRADE_SIZE_BUCKETS.map((b) => b.id)).toEqual(TRADE_SIZE_ORDER);
  });
});
