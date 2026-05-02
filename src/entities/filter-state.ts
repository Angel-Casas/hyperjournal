/**
 * Filter state on /w/:address. 8a shipped 5 dimensions; 8b adds 4 more
 * (hold-duration, time-of-day, day-of-week, trade-size). Lives in entities/
 * so both lib/validation (URL parse/serialize) and domain/filters (pure
 * helpers + applyFilters) can depend on it without violating the lib →
 * domain boundary rule.
 *
 * @see docs/superpowers/specs/2026-05-02-session-8b-filters-design.md
 */

export type DateRangePreset = '7d' | '30d' | '90d' | '1y' | 'all';
export type Side = 'all' | 'long' | 'short';
export type Status = 'all' | 'closed' | 'open';
export type Outcome = 'all' | 'winner' | 'loser';

// — 8b multi-select bucket id literal types —
export type HoldDurationBucket = 'scalp' | 'intraday' | 'swing' | 'position';
export type TimeOfDayBand = 'overnight' | 'morning' | 'afternoon' | 'evening';
export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type TradeSizeBucket = 'micro' | 'small' | 'medium' | 'large' | 'whale';

/**
 * `from` / `to` are YYYY-MM-DD UTC strings. The branded `YYYYMMDD` type
 * lives in domain/dates and is used by lib/validation when narrowing user
 * input; entities keep the plain string per the convention established by
 * `JournalEntry.date`.
 */
export type DateRange =
  | { kind: 'preset'; preset: DateRangePreset }
  | { kind: 'custom'; from: string; to: string };

export type FilterState = {
  dateRange: DateRange;
  coin: string | null;
  side: Side;
  status: Status;
  outcome: Outcome;
  // — 8b —
  holdDuration: ReadonlyArray<HoldDurationBucket>;
  timeOfDay: ReadonlyArray<TimeOfDayBand>;
  dayOfWeek: ReadonlyArray<DayOfWeek>;
  tradeSize: ReadonlyArray<TradeSizeBucket>;
};

export const DEFAULT_FILTER_STATE: FilterState = {
  dateRange: { kind: 'preset', preset: 'all' },
  coin: null,
  side: 'all',
  status: 'all',
  outcome: 'all',
  holdDuration: [],
  timeOfDay: [],
  dayOfWeek: [],
  tradeSize: [],
};

/**
 * Canonical declaration order for each multi-select dimension. Used in two
 * places that must agree: drawer render order and URL serialization. Lives
 * in entities/ (not domain/filters/buckets.ts) because lib/validation needs
 * to import them, and lib → domain is forbidden.
 */
export const HOLD_DURATION_ORDER: ReadonlyArray<HoldDurationBucket> =
  ['scalp', 'intraday', 'swing', 'position'];
export const TIME_OF_DAY_ORDER: ReadonlyArray<TimeOfDayBand> =
  ['overnight', 'morning', 'afternoon', 'evening'];
export const DAY_OF_WEEK_ORDER: ReadonlyArray<DayOfWeek> =
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const TRADE_SIZE_ORDER: ReadonlyArray<TradeSizeBucket> =
  ['micro', 'small', 'medium', 'large', 'whale'];
