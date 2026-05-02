import type {
  HoldDurationBucket,
  TimeOfDayBand,
  DayOfWeek,
  TradeSizeBucket,
} from '@entities/filter-state';

/**
 * Hold-duration bucket boundaries. Range convention is [lo, hi) — lo
 * inclusive, hi exclusive — matching the 8a custom-date-range
 * end-of-day-exclusive convention. Last bucket extends to +Infinity so
 * predicate code is uniform: no special-case for the final bucket.
 */
export const HOLD_DURATION_BUCKETS = [
  { id: 'scalp',    label: 'Scalp',    minMs: 0,                maxMs: 5 * 60_000 },
  { id: 'intraday', label: 'Intraday', minMs: 5 * 60_000,       maxMs: 8 * 3_600_000 },
  { id: 'swing',    label: 'Swing',    minMs: 8 * 3_600_000,    maxMs: 7 * 86_400_000 },
  { id: 'position', label: 'Position', minMs: 7 * 86_400_000,   maxMs: Number.POSITIVE_INFINITY },
] as const;

/** Daily bands in the user's local timezone. Hours are 0..24 (h23 cycle). */
export const TIME_OF_DAY_BANDS = [
  { id: 'overnight', label: 'Overnight', startHour: 0,  endHour: 6 },
  { id: 'morning',   label: 'Morning',   startHour: 6,  endHour: 12 },
  { id: 'afternoon', label: 'Afternoon', startHour: 12, endHour: 18 },
  { id: 'evening',   label: 'Evening',   startHour: 18, endHour: 24 },
] as const;

/** Day-of-week labels. Order is set by DAY_OF_WEEK_ORDER in entities/. */
export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

/** Trade-size buckets in absolute USD notional. */
export const TRADE_SIZE_BUCKETS = [
  { id: 'micro',  label: 'Micro',  minNotional: 0,        maxNotional: 100 },
  { id: 'small',  label: 'Small',  minNotional: 100,      maxNotional: 1_000 },
  { id: 'medium', label: 'Medium', minNotional: 1_000,    maxNotional: 10_000 },
  { id: 'large',  label: 'Large',  minNotional: 10_000,   maxNotional: 100_000 },
  { id: 'whale',  label: 'Whale',  minNotional: 100_000,  maxNotional: Number.POSITIVE_INFINITY },
] as const;

// Compile-time guards: bucket id literal types must match entities/.
const _holdCheck: ReadonlyArray<{ id: HoldDurationBucket }> = HOLD_DURATION_BUCKETS;
const _todCheck: ReadonlyArray<{ id: TimeOfDayBand }> = TIME_OF_DAY_BANDS;
const _sizeCheck: ReadonlyArray<{ id: TradeSizeBucket }> = TRADE_SIZE_BUCKETS;
void _holdCheck;
void _todCheck;
void _sizeCheck;
