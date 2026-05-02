import {
  HOLD_DURATION_BUCKETS,
  TIME_OF_DAY_BANDS,
  TRADE_SIZE_BUCKETS,
} from './buckets';
import { DAY_OF_WEEK_ORDER } from '@entities/filter-state';
import { hourInTimeZone, weekdayIndexInTimeZone } from '@domain/dates/timezone';
import type {
  HoldDurationBucket,
  TimeOfDayBand,
  DayOfWeek,
  TradeSizeBucket,
} from '@entities/filter-state';

export function holdDurationBucketOf(holdMs: number): HoldDurationBucket {
  for (const b of HOLD_DURATION_BUCKETS) {
    if (holdMs >= b.minMs && holdMs < b.maxMs) return b.id;
  }
  return 'position';
}

export function timeOfDayBandOf(
  timestampMs: number,
  timeZone: string,
): TimeOfDayBand {
  const hour = hourInTimeZone(timestampMs, timeZone);
  for (const b of TIME_OF_DAY_BANDS) {
    if (hour >= b.startHour && hour < b.endHour) return b.id;
  }
  return 'evening';
}

export function dayOfWeekOf(timestampMs: number, timeZone: string): DayOfWeek {
  const idx = weekdayIndexInTimeZone(timestampMs, timeZone);
  return DAY_OF_WEEK_ORDER[idx] ?? 'mon';
}

export function tradeSizeBucketOf(notionalUsd: number): TradeSizeBucket {
  for (const b of TRADE_SIZE_BUCKETS) {
    if (notionalUsd >= b.minNotional && notionalUsd < b.maxNotional) return b.id;
  }
  return 'whale';
}
