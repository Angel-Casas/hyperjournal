import type { YYYYMMDD } from '@domain/dates/isValidDateString';
import type {
  DateRangePreset,
  FilterState,
  HoldDurationBucket,
  TimeOfDayBand,
  DayOfWeek,
  TradeSizeBucket,
  Outcome,
  Side,
  Status,
} from '@entities/filter-state';

// Re-export so callers that already import from this module keep working.
// Definitions live in entities/ so lib/validation can also depend on them
// without violating the lib → domain boundary rule.
export type {
  DateRange,
  DateRangePreset,
  FilterState,
  HoldDurationBucket,
  TimeOfDayBand,
  DayOfWeek,
  TradeSizeBucket,
  Outcome,
  Side,
  Status,
} from '@entities/filter-state';
export { DEFAULT_FILTER_STATE } from '@entities/filter-state';

export function isDefault(state: FilterState): boolean {
  return (
    state.coin === null &&
    state.side === 'all' &&
    state.status === 'all' &&
    state.outcome === 'all' &&
    state.dateRange.kind === 'preset' &&
    state.dateRange.preset === 'all' &&
    state.holdDuration.length === 0 &&
    state.timeOfDay.length === 0 &&
    state.dayOfWeek.length === 0 &&
    state.tradeSize.length === 0
  );
}

export function countActive(state: FilterState): number {
  let n = 0;
  if (state.coin !== null) n++;
  if (state.side !== 'all') n++;
  if (state.status !== 'all') n++;
  if (state.outcome !== 'all') n++;
  const dr = state.dateRange;
  if (dr.kind === 'custom' || (dr.kind === 'preset' && dr.preset !== 'all')) n++;
  if (state.holdDuration.length > 0) n++;
  if (state.timeOfDay.length > 0) n++;
  if (state.dayOfWeek.length > 0) n++;
  if (state.tradeSize.length > 0) n++;
  return n;
}

// — 8a setters (unchanged) —

export function setCoin(state: FilterState, coin: string | null): FilterState {
  return { ...state, coin };
}

export function setSide(state: FilterState, side: Side): FilterState {
  return { ...state, side };
}

export function setStatus(state: FilterState, status: Status): FilterState {
  return { ...state, status };
}

export function setOutcome(state: FilterState, outcome: Outcome): FilterState {
  return { ...state, outcome };
}

export function setDateRangePreset(
  state: FilterState,
  preset: DateRangePreset,
): FilterState {
  return { ...state, dateRange: { kind: 'preset', preset } };
}

export function setCustomDateRange(
  state: FilterState,
  from: YYYYMMDD,
  to: YYYYMMDD,
): FilterState {
  return { ...state, dateRange: { kind: 'custom', from, to } };
}

// — 8b multi-select toggle setters —

function toggleIn<T extends string>(
  arr: ReadonlyArray<T>,
  value: T,
): ReadonlyArray<T> {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export function toggleHoldDuration(
  state: FilterState,
  bucket: HoldDurationBucket,
): FilterState {
  return { ...state, holdDuration: toggleIn(state.holdDuration, bucket) };
}

export function toggleTimeOfDay(
  state: FilterState,
  band: TimeOfDayBand,
): FilterState {
  return { ...state, timeOfDay: toggleIn(state.timeOfDay, band) };
}

export function toggleDayOfWeek(
  state: FilterState,
  day: DayOfWeek,
): FilterState {
  return { ...state, dayOfWeek: toggleIn(state.dayOfWeek, day) };
}

export function toggleTradeSize(
  state: FilterState,
  bucket: TradeSizeBucket,
): FilterState {
  return { ...state, tradeSize: toggleIn(state.tradeSize, bucket) };
}

// — 8b per-dimension clear setters —

export function clearHoldDuration(state: FilterState): FilterState {
  return { ...state, holdDuration: [] };
}

export function clearTimeOfDay(state: FilterState): FilterState {
  return { ...state, timeOfDay: [] };
}

export function clearDayOfWeek(state: FilterState): FilterState {
  return { ...state, dayOfWeek: [] };
}

export function clearTradeSize(state: FilterState): FilterState {
  return { ...state, tradeSize: [] };
}
