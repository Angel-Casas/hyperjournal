import { FilterChip } from '@lib/ui/components/filter-chip';
import {
  DEFAULT_FILTER_STATE,
  isDefault,
  setCoin,
  setDateRangePreset,
  setOutcome,
  setSide,
  setStatus,
  type DateRangePreset,
  type FilterState,
} from '@domain/filters/filterState';

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
