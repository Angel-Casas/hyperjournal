import type { YYYYMMDD } from '@domain/dates/isValidDateString';
import type {
  DateRangePreset,
  FilterState,
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
    state.dateRange.preset === 'all'
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
  return n;
}

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
