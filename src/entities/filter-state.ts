/**
 * Filter state on /w/:address — five dimensions, sourced from URL search
 * params. Lives in entities/ so both lib/validation (URL parse/serialize)
 * and domain/filters (pure helpers + applyFilters) can depend on it
 * without violating the boundary rule (lib → domain is forbidden).
 *
 * @see docs/superpowers/specs/2026-04-28-session-8a-filters-design.md
 */

export type DateRangePreset = '7d' | '30d' | '90d' | '1y' | 'all';
export type Side = 'all' | 'long' | 'short';
export type Status = 'all' | 'closed' | 'open';
export type Outcome = 'all' | 'winner' | 'loser';

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
};

export const DEFAULT_FILTER_STATE: FilterState = {
  dateRange: { kind: 'preset', preset: 'all' },
  coin: null,
  side: 'all',
  status: 'all',
  outcome: 'all',
};
