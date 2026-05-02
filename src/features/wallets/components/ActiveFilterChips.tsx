import type { ReactNode } from 'react';
import { FilterChip } from '@lib/ui/components/filter-chip';
import {
  DEFAULT_FILTER_STATE,
  clearDayOfWeek,
  clearHoldDuration,
  clearTimeOfDay,
  clearTradeSize,
  isDefault,
  setCoin,
  setDateRangePreset,
  setOutcome,
  setSide,
  setStatus,
  type DateRangePreset,
  type FilterState,
  type DayOfWeek,
  type HoldDurationBucket,
  type TimeOfDayBand,
  type TradeSizeBucket,
} from '@domain/filters/filterState';
import {
  HOLD_DURATION_ORDER,
  TIME_OF_DAY_ORDER,
  DAY_OF_WEEK_ORDER,
  TRADE_SIZE_ORDER,
} from '@entities/filter-state';
import {
  HOLD_DURATION_BUCKETS,
  TIME_OF_DAY_BANDS,
  DAY_OF_WEEK_LABELS,
  TRADE_SIZE_BUCKETS,
} from '@domain/filters/buckets';

type Props = {
  state: FilterState;
  onChange: (next: FilterState) => void;
};

const PRESET_LABELS: Record<DateRangePreset, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '1y': 'Last year',
  all: 'All time',
};
const SIDE_LABELS: Record<'all' | 'long' | 'short', string> = {
  all: 'All',
  long: 'Long',
  short: 'Short',
};
const STATUS_LABELS: Record<'all' | 'closed' | 'open', string> = {
  all: 'All',
  closed: 'Closed',
  open: 'Open',
};
const OUTCOME_LABELS: Record<'all' | 'winner' | 'loser', string> = {
  all: 'All',
  winner: 'Winners',
  loser: 'Losers',
};

const HOLD_LABEL: Record<HoldDurationBucket, string> = Object.fromEntries(
  HOLD_DURATION_BUCKETS.map((b) => [b.id, b.label]),
) as Record<HoldDurationBucket, string>;
const TOD_LABEL: Record<TimeOfDayBand, string> = Object.fromEntries(
  TIME_OF_DAY_BANDS.map((b) => [b.id, b.label]),
) as Record<TimeOfDayBand, string>;
const SIZE_LABEL: Record<TradeSizeBucket, string> = Object.fromEntries(
  TRADE_SIZE_BUCKETS.map((b) => [b.id, b.label]),
) as Record<TradeSizeBucket, string>;

function sortBy<T extends string>(
  arr: ReadonlyArray<T>,
  order: ReadonlyArray<T>,
): ReadonlyArray<T> {
  const idx = new Map(order.map((id, i) => [id, i] as const));
  return [...arr].sort((a, b) => (idx.get(a) ?? 0) - (idx.get(b) ?? 0));
}

function renderArrayChip<T extends string>(
  dimensionLabel: string,
  selected: ReadonlyArray<T>,
  order: ReadonlyArray<T>,
  bucketLabel: (id: T) => string,
  onClear: () => void,
): ReactNode {
  if (selected.length === 0) return null;
  const sorted = sortBy(selected, order);
  const inline =
    selected.length <= 3
      ? `${dimensionLabel}: ${sorted.map(bucketLabel).join(', ')}`
      : `${dimensionLabel}: ${selected.length} selected`;
  return (
    <FilterChip
      label={inline}
      onRemove={onClear}
      ariaLabel={`Remove ${dimensionLabel.toLowerCase()} filter`}
    />
  );
}

export function ActiveFilterChips({ state, onChange }: Props) {
  if (isDefault(state)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {state.coin !== null && (
        <FilterChip
          label={state.coin}
          onRemove={() => onChange(setCoin(state, null))}
          ariaLabel="Remove coin filter"
        />
      )}
      {state.side !== 'all' && (
        <FilterChip
          label={SIDE_LABELS[state.side]}
          onRemove={() => onChange(setSide(state, 'all'))}
          ariaLabel="Remove side filter"
        />
      )}
      {state.status !== 'all' && (
        <FilterChip
          label={STATUS_LABELS[state.status]}
          onRemove={() => onChange(setStatus(state, 'all'))}
          ariaLabel="Remove status filter"
        />
      )}
      {state.outcome !== 'all' && (
        <FilterChip
          label={OUTCOME_LABELS[state.outcome]}
          onRemove={() => onChange(setOutcome(state, 'all'))}
          ariaLabel="Remove outcome filter"
        />
      )}
      {state.dateRange.kind === 'preset' && state.dateRange.preset !== 'all' && (
        <FilterChip
          label={PRESET_LABELS[state.dateRange.preset]}
          onRemove={() => onChange(setDateRangePreset(state, 'all'))}
          ariaLabel="Remove date range filter"
        />
      )}
      {state.dateRange.kind === 'custom' && (
        <FilterChip
          label={`${state.dateRange.from} – ${state.dateRange.to}`}
          onRemove={() => onChange(setDateRangePreset(state, 'all'))}
          ariaLabel="Remove date range filter"
        />
      )}
      {renderArrayChip<HoldDurationBucket>(
        'Hold',
        state.holdDuration,
        HOLD_DURATION_ORDER,
        (id) => HOLD_LABEL[id],
        () => onChange(clearHoldDuration(state)),
      )}
      {renderArrayChip<TimeOfDayBand>(
        'Time',
        state.timeOfDay,
        TIME_OF_DAY_ORDER,
        (id) => TOD_LABEL[id],
        () => onChange(clearTimeOfDay(state)),
      )}
      {renderArrayChip<DayOfWeek>(
        'Day',
        state.dayOfWeek,
        DAY_OF_WEEK_ORDER,
        (id) => DAY_OF_WEEK_LABELS[id],
        () => onChange(clearDayOfWeek(state)),
      )}
      {renderArrayChip<TradeSizeBucket>(
        'Size',
        state.tradeSize,
        TRADE_SIZE_ORDER,
        (id) => SIZE_LABEL[id],
        () => onChange(clearTradeSize(state)),
      )}
      <button
        type="button"
        onClick={() => onChange(DEFAULT_FILTER_STATE)}
        className="ml-1 text-xs text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        Clear all
      </button>
    </div>
  );
}
