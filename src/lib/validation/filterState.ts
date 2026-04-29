import { z } from 'zod';
import {
  DEFAULT_FILTER_STATE,
  type DateRangePreset,
  type FilterState,
  type Outcome,
  type Side,
  type Status,
} from '@domain/filters/filterState';
import { isValidDateString, type YYYYMMDD } from '@domain/dates/isValidDateString';

const PresetSchema = z.enum(['7d', '30d', '90d', '1y']);
const SideSchema = z.enum(['long', 'short']);
const StatusSchema = z.enum(['closed', 'open']);
const OutcomeSchema = z.enum(['winner', 'loser']);

export function parseFilterStateFromSearchParams(
  params: URLSearchParams,
): FilterState {
  const coin = parseCoin(params.get('coin'));
  const side = parseEnumOr(params.get('side'), SideSchema, 'all') as Side;
  const status = parseEnumOr(params.get('status'), StatusSchema, 'all') as Status;
  const outcome = parseEnumOr(params.get('outcome'), OutcomeSchema, 'all') as Outcome;
  const dateRange = parseDateRange(params);

  return { coin, side, status, outcome, dateRange };
}

function parseCoin(value: string | null): string | null {
  if (value === null || value === '') return null;
  return value;
}

function parseEnumOr<T extends z.ZodEnum<[string, ...string[]]>>(
  value: string | null,
  schema: T,
  fallback: 'all',
): z.infer<T> | 'all' {
  if (value === null) return fallback;
  const result = schema.safeParse(value);
  return result.success ? result.data : fallback;
}

function parseDateRange(params: URLSearchParams): FilterState['dateRange'] {
  // Custom wins over preset when both valid.
  const from = params.get('from');
  const to = params.get('to');
  if (from && to && isValidDateString(from) && isValidDateString(to)) {
    return { kind: 'custom', from: from as YYYYMMDD, to: to as YYYYMMDD };
  }
  const range = params.get('range');
  if (range) {
    const result = PresetSchema.safeParse(range);
    if (result.success) {
      return { kind: 'preset', preset: result.data as DateRangePreset };
    }
  }
  return DEFAULT_FILTER_STATE.dateRange;
}

export function serializeFilterStateToSearchParams(
  state: FilterState,
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.coin !== null) params.set('coin', state.coin);
  if (state.side !== 'all') params.set('side', state.side);
  if (state.status !== 'all') params.set('status', state.status);
  if (state.outcome !== 'all') params.set('outcome', state.outcome);
  if (state.dateRange.kind === 'custom') {
    params.set('from', state.dateRange.from);
    params.set('to', state.dateRange.to);
  } else if (state.dateRange.preset !== 'all') {
    params.set('range', state.dateRange.preset);
  }
  return params;
}
