import { z } from 'zod';
import {
  DEFAULT_FILTER_STATE,
  HOLD_DURATION_ORDER,
  TIME_OF_DAY_ORDER,
  DAY_OF_WEEK_ORDER,
  TRADE_SIZE_ORDER,
  type DateRangePreset,
  type DayOfWeek,
  type FilterState,
  type HoldDurationBucket,
  type Outcome,
  type Side,
  type Status,
  type TimeOfDayBand,
  type TradeSizeBucket,
} from '@entities/filter-state';

const PresetSchema = z.enum(['7d', '30d', '90d', '1y']);
const SideSchema = z.enum(['long', 'short']);
const StatusSchema = z.enum(['closed', 'open']);
const OutcomeSchema = z.enum(['winner', 'loser']);

const HoldDurationSchema = z.enum(['scalp', 'intraday', 'swing', 'position']);
const TimeOfDayBandSchema = z.enum([
  'overnight',
  'morning',
  'afternoon',
  'evening',
]);
const DayOfWeekSchema = z.enum([
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
]);
const TradeSizeBucketSchema = z.enum([
  'micro',
  'small',
  'medium',
  'large',
  'whale',
]);

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
  const holdDuration = parseEnumArrayOr<HoldDurationBucket>(
    params.get('hold'),
    HoldDurationSchema,
  );
  const timeOfDay = parseEnumArrayOr<TimeOfDayBand>(
    params.get('tod'),
    TimeOfDayBandSchema,
  );
  const dayOfWeek = parseEnumArrayOr<DayOfWeek>(
    params.get('dow'),
    DayOfWeekSchema,
  );
  const tradeSize = parseEnumArrayOr<TradeSizeBucket>(
    params.get('size'),
    TradeSizeBucketSchema,
  );
  return {
    coin,
    side,
    status,
    outcome,
    dateRange,
    holdDuration,
    timeOfDay,
    dayOfWeek,
    tradeSize,
  };
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

function parseEnumArrayOr<T extends string>(
  raw: string | null,
  schema: z.ZodEnum<[string, ...string[]]>,
): ReadonlyArray<T> {
  if (raw === null || raw === '') return [];
  const out: Array<T> = [];
  const seen = new Set<string>();
  for (const tok of raw.split(',')) {
    const r = schema.safeParse(tok);
    if (r.success && !seen.has(r.data)) {
      seen.add(r.data);
      out.push(r.data as T);
    }
  }
  return out;
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

function sortByCanonical<T extends string>(
  arr: ReadonlyArray<T>,
  order: ReadonlyArray<T>,
): ReadonlyArray<T> {
  const idx = new Map(order.map((id, i) => [id, i] as const));
  return [...arr].sort((a, b) => (idx.get(a) ?? 0) - (idx.get(b) ?? 0));
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
  if (state.holdDuration.length > 0) {
    params.set(
      'hold',
      sortByCanonical(state.holdDuration, HOLD_DURATION_ORDER).join(','),
    );
  }
  if (state.timeOfDay.length > 0) {
    params.set(
      'tod',
      sortByCanonical(state.timeOfDay, TIME_OF_DAY_ORDER).join(','),
    );
  }
  if (state.dayOfWeek.length > 0) {
    params.set(
      'dow',
      sortByCanonical(state.dayOfWeek, DAY_OF_WEEK_ORDER).join(','),
    );
  }
  if (state.tradeSize.length > 0) {
    params.set(
      'size',
      sortByCanonical(state.tradeSize, TRADE_SIZE_ORDER).join(','),
    );
  }
  return params;
}
