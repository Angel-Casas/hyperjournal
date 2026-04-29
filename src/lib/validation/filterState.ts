import { z } from 'zod';
import {
  DEFAULT_FILTER_STATE,
  type DateRangePreset,
  type FilterState,
  type Outcome,
  type Side,
  type Status,
} from '@entities/filter-state';

const PresetSchema = z.enum(['7d', '30d', '90d', '1y']);
const SideSchema = z.enum(['long', 'short']);
const StatusSchema = z.enum(['closed', 'open']);
const OutcomeSchema = z.enum(['winner', 'loser']);

// YYYY-MM-DD with valid month/day. Mirrors @domain/dates/isValidDateString
// without crossing the lib → domain boundary.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

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
  if (from && to && isValidDate(from) && isValidDate(to)) {
    return { kind: 'custom', from, to };
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
