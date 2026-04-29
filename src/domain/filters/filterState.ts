import type { YYYYMMDD } from '@domain/dates/isValidDateString';

export type DateRangePreset = '7d' | '30d' | '90d' | '1y' | 'all';
export type Side = 'all' | 'long' | 'short';
export type Status = 'all' | 'closed' | 'open';
export type Outcome = 'all' | 'winner' | 'loser';

export type DateRange =
  | { kind: 'preset'; preset: DateRangePreset }
  | { kind: 'custom'; from: YYYYMMDD; to: YYYYMMDD };

export type FilterState = {
  dateRange: DateRange;
  coin: string | null;
  side: Side;
  status: Status;
  outcome: Outcome;
};

export const DEFAULT_FILTER_STATE: FilterState = {
  dateRange: { kind: 'preset', preset: 'all' },
  coin: null,
  side: 'all',
  status: 'all',
  outcome: 'all',
};

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
