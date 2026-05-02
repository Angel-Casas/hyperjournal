# Session 8b — Filter panel: 4 trade-intrinsic dimensions

**Date:** 2026-05-02
**Phase:** Phase 2 — Deep Analytics & Pattern Detection
**Plan reference:** `docs/plan.md` §11.5 (Filtering & Exploration System)
**Predecessor:** Session 8a (`docs/superpowers/specs/2026-04-28-session-8a-filters-design.md`)
**ADR baseline:** ADR-0004 (URL is the source of truth for addressable UI state), ADR-0009 (Sheet/Drawer primitive)

---

## 1. Background and goals

Session 8a shipped 5 of the 12 filter dimensions in plan §11.5 (date range,
coin, side, status, outcome). 8b extends that pipeline with four more
dimensions that compose additively on the existing `applyFilters` /
`FilterState` substrate, with no journal join.

**Goal of Session 8b.** Ship the four trade-intrinsic dimensions:

- hold-duration bucket
- time of day
- day of week
- trade-size range

All four can be derived from `ReconstructedTrade` alone; no extension of the
filter pipeline beyond the existing `(trades, state, options)` signature is
required.

**Non-goals.**

- **Leverage bucket** — plan §11.5 hedges with *"if derivable"*. Neither
  `ReconstructedTrade` nor `RawFill` carries leverage today. Deferred to
  BACKLOG with a "blocked: data not derivable" note.
- **Stop-loss usage** and **tagged strategy/setup** — both require joining
  `TradeJournalEntry` with trades. That extension breaks the pure
  `applyFilters(trades, state)` signature. Deferred to Session 8c (next).
- **Multi-coin selection** (`coin: string[]`) — 8a left this as a `[maybe]`
  BACKLOG item; not unblocked here.
- **Calendar-cell click → date-range filter** — already in BACKLOG as
  `[soon]`; independent follow-up.
- **Saved filter presets in Dexie** — BACKLOG `[maybe]`.
- **Filter-aware empty states on charts** (equity curve, calendar) — Phase 5
  polish; the lists already handle empty results via 8a's
  `TradeHistoryList` `hasActiveFilters` prop.

---

## 2. Decisions (from brainstorming)

| # | Question | Choice |
|---|---|---|
| Q1 | Scope of 8b | Four trade-intrinsic dimensions only; leverage to BACKLOG; stop-loss + tagged-strategy to 8c |
| Q2 | Single-select vs multi-select | **Uniform multi-select** on all 4 (`ReadonlyArray<Bucket>`) |
| Q3 | Timezone for time-of-day / day-of-week | **Local timezone** for these two; UTC unchanged for date filters |
| Q4 | Hold-duration buckets | 4 buckets: scalp (< 5m), intraday (5m–8h), swing (8h–7d), position (≥ 7d) |
| Q5 | Trade-size form / buckets | **Notional** (`openedSize × avgEntryPx`); 5 absolute USD buckets: micro (< $100), small ($100–$1k), medium ($1k–$10k), large ($10k–$100k), whale (≥ $100k) |
| Q6 | Time-of-day granularity | 4 daily bands: overnight (00–06), morning (06–12), afternoon (12–18), evening (18–24) |
| Q7 | Active-filter chip behavior | One chip per dimension; ≤ 3 selected → comma-joined inline (`Day: Mon, Wed, Fri`); ≥ 4 selected → count summary (`Day: 5 selected`); chip X clears the entire dimension |
| Q8 | Drawer layout | Three semantic group headers — *When* / *What* / *Outcome / shape* — no collapsing |

---

## 3. Architecture

```
URL search params  ──parse──►  FilterState  ──►  applyFilters(trades, state, { now, timeZone })
       ▲                       (typed,                     │
       │                        9 dimensions)              │
       └────serialize◄─────────────────────────────────────┘
                                                           │
                                                           ▼
                                          MetricsGrid / Charts / Calendar / List
                                          (filtered subset)
```

Same shape as 8a. New machinery:

- `applyFilters` accepts an optional `timeZone` in its `Options` arg;
  resolves once per call. Default: `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Four new pure predicates compose with logical AND alongside the five
  existing ones.
- Bucket constants are the single source of truth shared between the
  predicate and the drawer label rendering.

**Where each piece lives:**

| Layer | File(s) | What changes |
|---|---|---|
| Entities | `src/entities/filter-state.ts` | 4 new fields + 4 bucket literal types + 4 ORDER constants |
| Domain | `src/domain/filters/buckets.ts` (new), `bucketize.ts` (new), `applyFilters.ts` (extended), `filterState.ts` (extended), `src/domain/dates/timezone.ts` (new TZ helpers) | Bucket constants, bucket-id assignment, 4 new predicates, 4 new toggle setters, 4 per-dimension clear setters |
| Validation | `src/lib/validation/filterState.ts` | New `parseEnumArrayOr` helper; per-dimension parse + canonical-order serialize |
| UI primitive | `src/lib/ui/components/MultiBucketControl.tsx` (new) | Single bucket-button-row primitive used by all 4 new sections |
| Drawer | `src/features/wallets/components/FiltersDrawer.tsx` | Reorganized into 3 semantic groups; inline `Group` subcomponent; 4 new sections wired |
| Active chips | `src/features/wallets/components/ActiveFilterChips.tsx` | Render rule extended for multi-select chips |
| Wallet view | `src/features/wallets/components/WalletView.tsx` | No structural change; `applyFilters` call adds `timeZone` to options |

---

## 4. Type shapes

```ts
// src/entities/filter-state.ts (extended)

export type DateRangePreset = '7d' | '30d' | '90d' | '1y' | 'all';
export type Side = 'all' | 'long' | 'short';
export type Status = 'all' | 'closed' | 'open';
export type Outcome = 'all' | 'winner' | 'loser';

export type HoldDurationBucket = 'scalp' | 'intraday' | 'swing' | 'position';
export type TimeOfDayBand = 'overnight' | 'morning' | 'afternoon' | 'evening';
export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type TradeSizeBucket = 'micro' | 'small' | 'medium' | 'large' | 'whale';

export type DateRange =
  | { kind: 'preset'; preset: DateRangePreset }
  | { kind: 'custom'; from: string; to: string };

export type FilterState = {
  // 8a — unchanged
  dateRange: DateRange;
  coin: string | null;
  side: Side;
  status: Status;
  outcome: Outcome;
  // — new in 8b —
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

// ORDER constants (canonical serialization order; also drawer render order)
export const HOLD_DURATION_ORDER: ReadonlyArray<HoldDurationBucket> =
  ['scalp', 'intraday', 'swing', 'position'];
export const TIME_OF_DAY_ORDER: ReadonlyArray<TimeOfDayBand> =
  ['overnight', 'morning', 'afternoon', 'evening'];
export const DAY_OF_WEEK_ORDER: ReadonlyArray<DayOfWeek> =
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const TRADE_SIZE_ORDER: ReadonlyArray<TradeSizeBucket> =
  ['micro', 'small', 'medium', 'large', 'whale'];
```

```ts
// src/domain/filters/buckets.ts (new — labels + numeric ranges)

import type {
  HoldDurationBucket,
  TimeOfDayBand,
  DayOfWeek,
  TradeSizeBucket,
} from '@entities/filter-state';

export const HOLD_DURATION_BUCKETS = [
  { id: 'scalp',    label: 'Scalp',    minMs: 0,              maxMs: 5 * 60_000 },
  { id: 'intraday', label: 'Intraday', minMs: 5 * 60_000,     maxMs: 8 * 3_600_000 },
  { id: 'swing',    label: 'Swing',    minMs: 8 * 3_600_000,  maxMs: 7 * 86_400_000 },
  { id: 'position', label: 'Position', minMs: 7 * 86_400_000, maxMs: Number.POSITIVE_INFINITY },
] as const;

export const TIME_OF_DAY_BANDS = [
  { id: 'overnight', label: 'Overnight', startHour: 0,  endHour: 6 },
  { id: 'morning',   label: 'Morning',   startHour: 6,  endHour: 12 },
  { id: 'afternoon', label: 'Afternoon', startHour: 12, endHour: 18 },
  { id: 'evening',   label: 'Evening',   startHour: 18, endHour: 24 },
] as const;

export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

export const TRADE_SIZE_BUCKETS = [
  { id: 'micro',  label: 'Micro',  minNotional: 0,       maxNotional: 100 },
  { id: 'small',  label: 'Small',  minNotional: 100,     maxNotional: 1_000 },
  { id: 'medium', label: 'Medium', minNotional: 1_000,   maxNotional: 10_000 },
  { id: 'large',  label: 'Large',  minNotional: 10_000,  maxNotional: 100_000 },
  { id: 'whale',  label: 'Whale',  minNotional: 100_000, maxNotional: Number.POSITIVE_INFINITY },
] as const;

// Compile-time guards: bucket id literal types must match entities/.
const _holdCheck: ReadonlyArray<{ id: HoldDurationBucket }> = HOLD_DURATION_BUCKETS;
const _todCheck:  ReadonlyArray<{ id: TimeOfDayBand }>      = TIME_OF_DAY_BANDS;
const _sizeCheck: ReadonlyArray<{ id: TradeSizeBucket }>    = TRADE_SIZE_BUCKETS;
```

**Range convention:** every bucket is `[lo, hi)` (lo-inclusive, hi-exclusive),
with the last bucket using `Number.POSITIVE_INFINITY` as `maxMs` /
`maxNotional`. This is uniform, mirrors the 8a custom-date-range
end-of-day-exclusive convention, and removes a "is this the last bucket?"
branch from every predicate.

---

## 5. Domain layer

### 5.1 Bucket-id assignment

```ts
// src/domain/filters/bucketize.ts (new)

import { HOLD_DURATION_BUCKETS, TIME_OF_DAY_BANDS, TRADE_SIZE_BUCKETS } from './buckets';
import { DAY_OF_WEEK_ORDER } from '@entities/filter-state';
import { hourInTimeZone, weekdayIndexInTimeZone } from '@domain/dates/timezone';
import type { HoldDurationBucket, TimeOfDayBand, DayOfWeek, TradeSizeBucket } from '@entities/filter-state';

export function holdDurationBucketOf(holdMs: number): HoldDurationBucket {
  for (const b of HOLD_DURATION_BUCKETS) {
    if (holdMs >= b.minMs && holdMs < b.maxMs) return b.id;
  }
  return 'position';
}

export function timeOfDayBandOf(timestampMs: number, timeZone: string): TimeOfDayBand {
  const hour = hourInTimeZone(timestampMs, timeZone);
  for (const b of TIME_OF_DAY_BANDS) {
    if (hour >= b.startHour && hour < b.endHour) return b.id;
  }
  return 'evening';
}

export function dayOfWeekOf(timestampMs: number, timeZone: string): DayOfWeek {
  return DAY_OF_WEEK_ORDER[weekdayIndexInTimeZone(timestampMs, timeZone)];
}

export function tradeSizeBucketOf(notionalUsd: number): TradeSizeBucket {
  for (const b of TRADE_SIZE_BUCKETS) {
    if (notionalUsd >= b.minNotional && notionalUsd < b.maxNotional) return b.id;
  }
  return 'whale';
}
```

### 5.2 Timezone helpers

```ts
// src/domain/dates/timezone.ts (new)

// Returns 0..23 in the given IANA timezone.
export function hourInTimeZone(timestampMs: number, timeZone: string): number;

// Returns 0..6 in the given timezone, with Mon = 0, Sun = 6.
// (Aligns with DAY_OF_WEEK_ORDER in entities/.)
export function weekdayIndexInTimeZone(timestampMs: number, timeZone: string): number;
```

Implementation uses `Intl.DateTimeFormat` with `hour: '2-digit', hourCycle: 'h23'`
and `weekday: 'short'`. Pure (no I/O); accepts arbitrary IANA `timeZone`
strings; tests can pass `'UTC'` / `'America/New_York'` / `'Asia/Tokyo'` for
deterministic assertions.

### 5.3 Predicates

```ts
// src/domain/filters/applyFilters.ts (extended)

type Options = { now?: number; timeZone?: string };

export function applyFilters(
  trades: ReadonlyArray<ReconstructedTrade>,
  state: FilterState,
  options: Options = {},
): ReadonlyArray<ReconstructedTrade> {
  if (isDefault(state)) return trades;
  const now = options.now ?? Date.now();
  const timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { fromMs, toMs } = resolveDateRange(state.dateRange, now);
  return trades.filter(
    (t) =>
      matchesDate(t, fromMs, toMs) &&
      matchesCoin(t, state.coin) &&
      matchesSide(t, state.side) &&
      matchesStatus(t, state.status) &&
      matchesOutcome(t, state.outcome) &&
      matchesHoldDuration(t, state.holdDuration, now) &&
      matchesTimeOfDay(t, state.timeOfDay, timeZone) &&
      matchesDayOfWeek(t, state.dayOfWeek, timeZone) &&
      matchesTradeSize(t, state.tradeSize),
  );
}

export function matchesHoldDuration(
  trade: ReconstructedTrade,
  buckets: ReadonlyArray<HoldDurationBucket>,
  now: number,
): boolean {
  if (buckets.length === 0) return true;
  const holdMs = trade.status === 'open'
    ? Math.max(0, now - trade.openedAt)
    : trade.holdTimeMs;
  return buckets.includes(holdDurationBucketOf(holdMs));
}

export function matchesTimeOfDay(
  trade: ReconstructedTrade,
  bands: ReadonlyArray<TimeOfDayBand>,
  timeZone: string,
): boolean {
  if (bands.length === 0) return true;
  return bands.includes(timeOfDayBandOf(trade.openedAt, timeZone));
}

export function matchesDayOfWeek(
  trade: ReconstructedTrade,
  days: ReadonlyArray<DayOfWeek>,
  timeZone: string,
): boolean {
  if (days.length === 0) return true;
  return days.includes(dayOfWeekOf(trade.openedAt, timeZone));
}

export function matchesTradeSize(
  trade: ReconstructedTrade,
  buckets: ReadonlyArray<TradeSizeBucket>,
): boolean {
  if (buckets.length === 0) return true;
  if (trade.avgEntryPx === null) return false; // truncated trade — exclude when filter active
  const notional = trade.openedSize * trade.avgEntryPx;
  return buckets.includes(tradeSizeBucketOf(notional));
}
```

### 5.4 Setters and `isDefault` / `countActive`

```ts
// src/domain/filters/filterState.ts (extended)

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

// countActive — adds 1 per non-empty array.

export function toggleHoldDuration(state: FilterState, bucket: HoldDurationBucket): FilterState;
export function toggleTimeOfDay(state: FilterState, band: TimeOfDayBand): FilterState;
export function toggleDayOfWeek(state: FilterState, day: DayOfWeek): FilterState;
export function toggleTradeSize(state: FilterState, bucket: TradeSizeBucket): FilterState;

export function clearHoldDuration(state: FilterState): FilterState;
export function clearTimeOfDay(state: FilterState): FilterState;
export function clearDayOfWeek(state: FilterState): FilterState;
export function clearTradeSize(state: FilterState): FilterState;
```

**Toggle semantics:** add the bucket if absent, remove if present. Returned
state is a fresh object (immutability). No bulk `setX(buckets)` setter — toggle
covers the drawer's per-button click and per-dimension `clear` covers the
chip X-button.

### 5.5 Open-trade and truncated-trade semantics

- **Open trades (hold-duration):** `holdMs = max(0, now - openedAt)` — live
  recalculation, uses the existing `now` injection. Trade-off accepted: an
  open trade's bucket can drift across boundaries as time passes. The
  alternative (filter excludes all open trades when active) is less useful.
- **Truncated trades (trade-size):** `avgEntryPx === null` ⇒ notional is
  undefined ⇒ trade is excluded when the size filter is active, included when
  default. Same pattern as outcome filter excluding open trades.

### 5.6 Provenance

All four new bucket assignments are `derived` (deterministic functions of
`observed` fields). Not surfaced in 8b's UI: chip labels read like `Hold: scalp`
without provenance markers, consistent with 8a's chips today which also do not
badge provenance.

---

## 6. URL parse / serialize

**Grammar:** comma-delimited per-key arrays. Default state writes zero new params (preserves 8a's "default = empty URL" invariant).

| Dimension | Param key | Example |
|---|---|---|
| Hold-duration | `hold` | `?hold=scalp,intraday` |
| Time-of-day | `tod` | `?tod=morning,evening` |
| Day-of-week | `dow` | `?dow=mon,tue,wed,thu,fri` |
| Trade-size | `size` | `?size=medium,large,whale` |

```ts
// src/lib/validation/filterState.ts (extended)

const HoldDurationSchema   = z.enum(['scalp', 'intraday', 'swing', 'position']);
const TimeOfDayBandSchema  = z.enum(['overnight', 'morning', 'afternoon', 'evening']);
const DayOfWeekSchema      = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const TradeSizeBucketSchema = z.enum(['micro', 'small', 'medium', 'large', 'whale']);

function parseEnumArrayOr<T extends z.ZodEnum<[string, ...string[]]>>(
  raw: string | null,
  schema: T,
): ReadonlyArray<z.infer<T>> {
  if (raw === null || raw === '') return [];
  const out: Array<z.infer<T>> = [];
  const seen = new Set<string>();
  for (const tok of raw.split(',')) {
    const r = schema.safeParse(tok);
    if (r.success && !seen.has(r.data)) {
      seen.add(r.data);
      out.push(r.data);
    }
  }
  return out;
}

function sortByCanonical<T extends string>(
  arr: ReadonlyArray<T>,
  order: ReadonlyArray<T>,
): ReadonlyArray<T> {
  const idx = new Map(order.map((id, i) => [id, i]));
  return [...arr].sort((a, b) => (idx.get(a) ?? 0) - (idx.get(b) ?? 0));
}
```

**Canonicalization on serialize.** State `['large', 'medium']` and
`['medium', 'large']` both serialize to `?size=medium,large`. Reason:
round-trip identity — without canonicalization, the URL differs for the same
logical filter, breaking caching / sharing / tests. Parse preserves source
order; the URL → state → URL round-trip ends up canonical.

**Boundary note (mirrors 8a gotcha #1):** ORDER constants live in
`entities/filter-state.ts`, not `domain/filters/buckets.ts`, because
`lib/validation` cannot import from `domain/`. Bucket label/range constants
stay in `domain/filters/buckets.ts` (only `domain` and `features` consume
them).

**Garbage handling** (consistent with 8a):

| Input | Output |
|---|---|
| `?hold=scalp,bogus,intraday` | `['scalp', 'intraday']` (drop unknowns silently) |
| `?hold=scalp,scalp` | `['scalp']` (dedup) |
| `?hold=` | `[]` (default) |
| `?hold` (key with no `=`) | `[]` (URLSearchParams returns `''`) |
| `?foo=bar` (unknown key) | ignored |

**Backward compatibility:** existing 8a URLs (`?coin=BTC&status=closed`)
parse to `FilterState` with all new array fields = `[]`. No breaking change.
8a's `filters-roundtrip.spec.ts` E2E remains valid as a backward-compat
guard.

---

## 7. UI components

### 7.1 New primitive — `MultiBucketControl`

```tsx
// src/lib/ui/components/MultiBucketControl.tsx (new)

type Props<T extends string> = {
  label: string;                                       // section label, e.g. "Hold duration"
  buckets: ReadonlyArray<{ id: T; label: string }>;
  selected: ReadonlyArray<T>;
  onToggle: (id: T) => void;
  ariaDescription?: string;                            // optional hint, e.g. "< 5m, 5m-8h, ..."
};
```

- **Visual:** flex-wrap row of buttons. `aria-pressed={selected.includes(id)}`
  reflects state (WAI-ARIA multi-select pattern). Click handler =
  `onToggle(id)`.
- **Why buttons not checkboxes:** matches 8a's existing segmented-control
  visual convention; one primitive across all four call sites.
- **Wrapping:** day-of-week (7 buttons) is the worst case — wraps to two
  rows on narrow drawer widths.
- **Lives in `lib/ui/components/`** from the start, not feature-scoped, since
  this is the fourth bucket-grid pattern in the project (8a's `PresetButton`
  / `SegmentedControl` were inline; per 8a gotcha, three is the trigger for
  extracting).

### 7.2 Drawer reorganization

Three semantic groups, each with a header and stacked controls:

```
┌─ Filters drawer (right Sheet) ────────────────────┐
│                                                    │
│ When                                               │
│   Date range  [preset row + custom inputs]         │
│   Time of day [MultiBucketControl: 4 bands]        │
│   Day of week [MultiBucketControl: 7 days]         │
│                                                    │
│ What                                               │
│   Coin        [native <select>]                    │
│   Side        [SegmentedControl]                   │
│                                                    │
│ Outcome / shape                                    │
│   Status      [SegmentedControl]                   │
│   Outcome     [SegmentedControl]                   │
│   Hold duration [MultiBucketControl: 4 buckets]    │
│   Trade size    [MultiBucketControl: 5 buckets]    │
│                                                    │
└────────────────────────────────────────────────────┘
```

- `Group` is an inline subcomponent in `FiltersDrawer.tsx` (mirrors 8a's
  inline `Section` / `PresetButton` / `SegmentedControl`).
- **Live-apply preserved.** Each `MultiBucketControl.onToggle` calls the
  appropriate domain `toggleX`, then `onChange(nextState)`.
- **Drawer scrolls** — Radix Dialog/Sheet handles overflow.
- **Mobile width (375px):** day-of-week wraps; everything else stays single-row.

### 7.3 `ActiveFilterChips` — multi-select rendering

```ts
function dimensionChip<T extends string>(
  dimensionLabel: string,                              // "Day"
  selected: ReadonlyArray<T>,
  bucketLabel: (id: T) => string,                      // (id) => DAY_OF_WEEK_LABELS[id]
  onClear: () => void,
): ReactNode {
  if (selected.length === 0) return null;              // default — render nothing
  if (selected.length <= 3) {
    return <FilterChip
      label={`${dimensionLabel}: ${selected.map(bucketLabel).join(', ')}`}
      onClear={onClear}
    />;
  }
  return <FilterChip
    label={`${dimensionLabel}: ${selected.length} selected`}
    onClear={onClear}
  />;
}
```

**Behavior:**

- 0 selected ⇒ no chip.
- 1–3 selected ⇒ inline list (`Day: Mon, Wed, Fri`).
- 4+ selected ⇒ count summary (`Day: 5 selected`).
- All-selected (e.g., 7-of-7 days) ⇒ still renders (`Day: 7 selected`). Honest
  representation: "user explicitly selected all 7" is a different state from
  "default (no filter)" — even though they match the same trades.
- X-button calls the dimension's `clearX(state)` setter — **clears the entire
  dimension**, not a single bucket. Per-bucket chip removal is BACKLOG `[maybe]`.

Inline list ordering: bucket order (canonical), not selection order — matches
the URL canonicalization rule and reads predictably.

### 7.4 `WalletHeader` — count badge

`countActive(filterState)` already drives the badge (8a). Just extend domain's
`countActive` to count empty/non-empty arrays. No JSX change.

### 7.5 `WalletView` — wiring

No structural change. The existing `useMemo` chain that computes
`applyFilters(metrics.trades, filterState)` keeps working — `applyFilters`
widens to accept the new state, but the call site is unchanged.

One bump: `applyFilters(metrics.trades, filterState, { now, timeZone })` — `timeZone`
is read once via `Intl.DateTimeFormat().resolvedOptions().timeZone` at the
WalletView call site. `now` was already plumbed through 8a.

---

## 8. Testing

### 8.1 Domain (`src/domain/filters/`, `src/domain/dates/`)

| File | New tests | Focus |
|---|---|---|
| `buckets.test.ts` (new) | ~6 | Bucket constants well-formed: contiguous, non-overlapping, last bucket is `+Infinity`, ORDER constants match bucket id sets |
| `bucketize.test.ts` (new) | ~12 | `holdDurationBucketOf`/`tradeSizeBucketOf` boundary cases (`5*60_000ms` → `intraday` not `scalp`); `timeOfDayBandOf` and `dayOfWeekOf` with explicit `timeZone: 'UTC'` and `'America/New_York'` on a known timestamp (e.g., `2026-04-29T03:00:00Z` is 23:00 Mon NY = 03:00 Tue UTC) |
| `applyFilters.test.ts` (extended) | ~16 | New `matchesX` predicates: empty-array passthrough, single-bucket match, multi-bucket OR. Open-trade live recalc (`now - openedAt`). Truncated-trade size exclusion when filter active. Composition: 3+ dimensions AND'd correctly. Default-state short-circuits to identity |
| `filterState.test.ts` (extended) | ~10 | Toggle setters: add when absent, remove when present, immutability. `clearX` resets dimension. `isDefault` returns false when any new array non-empty. `countActive` increments per non-empty array |
| `timezone.test.ts` (new) | ~4 | `hourInTimeZone` and `weekdayIndexInTimeZone` correct for UTC, NY, Tokyo on known timestamps spanning DST transitions |

### 8.2 Validation (`src/lib/validation/`)

| File | New tests | Focus |
|---|---|---|
| `filterState.test.ts` (extended) | ~14 | Per-dimension parse: valid comma-list, single value, empty string, garbage tokens dropped, dedup. Per-dimension serialize: empty → no param, populated → comma-joined, canonical order regardless of input order. Round-trip identity for ~12 representative states. 8a-only URLs still parse to default new fields |

### 8.3 UI components

| File | New tests | Focus |
|---|---|---|
| `MultiBucketControl.test.tsx` (new) | ~5 | Renders bucket labels, `aria-pressed` reflects selection, click fires `onToggle(id)`, multi-selected state visually distinct |
| `FiltersDrawer.test.tsx` (extended) | ~8 | Group titles render, each new section mounts a `MultiBucketControl` with its constant list, toggling fires `onChange(nextState)` with correct setter applied, default state shows zero selected, drawer scrolls when content overflows |
| `ActiveFilterChips.test.tsx` (extended) | ~5 | 1-bucket chip, 2–3 inline render, ≥4 count render, X-button clears dimension, no chip when array empty, all-selected renders count not "all" |

### 8.4 E2E (`e2e/`)

| File | New tests | Focus |
|---|---|---|
| `filters-multiselect-roundtrip.spec.ts` (new) | 2 | (1) Apply + share via URL: open drawer, select 2 hold-buckets + 2 days, observe `?hold=scalp,intraday&dow=mon,tue` in URL, fresh-context navigate, drawer reflects same selection, list filtered. (2) Multi-dimension empty result + clear all: select impossible combo (`size=whale + hold=scalp`), empty-state copy renders, click "Clear all" → list repopulates, URL has no filter params |
| `filters-roundtrip.spec.ts` (8a, unchanged) | — | Backward-compat guard |

### 8.5 Test budget summary

- **Unit (domain + validation):** ~62 new
- **Component:** ~18 new
- **E2E:** 2 new
- **Total:** ~80 unit/component + 2 E2E

End-state target: ~574 unit tests across ~78 files (was 496/76 after 8a),
22 E2E (was 20).

### 8.6 Test infrastructure

- **Timezone determinism:** every `applyFilters` test that touches time-of-day
  / day-of-week passes `timeZone: 'UTC'` explicitly. Default-resolution path
  is tested in **one** test via `vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')`.
- **`now` injection** continues to work as 8a established. Open-trade
  hold-duration tests pass explicit `now = openedAt + delta`.
- **No new fixture files.** Existing `ReconstructedTrade` factory extends with
  `withHoldTimeMs`, `withOpenedAt`, `withOpenedSize`, `withAvgEntryPx`
  helpers.

---

## 9. Backward compatibility & invariants

**Backward compatibility:**

- All 8a URLs parse identically; new params optional with empty-default semantics.
- `applyFilters(trades, state)` (no options) still works — `timeZone` defaults via `Intl`.
- `FilterState`'s 8a fields untouched; storage / serialization shape preserved.
- `ActiveFilterChips`, `FiltersDrawer`, `WalletHeader` props are extended, not breaking.

**Invariants (new + preserved):**

- URL is the source of truth for filter state. `WalletView` never reads filter state from anywhere else.
- `applyFilters(trades, DEFAULT_FILTER_STATE)` returns the input array by reference (identity equality). Callers may rely on this for memoization.
- Garbage URL params self-heal via per-dimension `safeParse` fallback to default. No throw, no error UI.
- `FilterState` is immutable — every setter returns a new object.
- `availableCoins` reflects the wallet's distinct coins from **unfiltered** trades. Coin filter narrows trades; never narrows the dropdown options.
- Custom date `to` is end-of-day-exclusive in `applyFilters`.
- **New:** Bucket arrays are canonical-ordered on URL serialize (round-trip identity).
- **New:** Bucket boundaries are inclusive-low / exclusive-high; last bucket extends to `+Infinity`.
- **New:** Open-trade hold-duration is live-recalculated against `now`; closed-trade uses stored `holdTimeMs`.
- **New:** Truncated trades (`avgEntryPx === null`) are excluded from any active size-filter; included when default.

---

## 10. Out of scope / BACKLOG additions

Adds to `docs/BACKLOG.md` under "Session 8b deferrals":

- **`[next]`** Session 8c — stop-loss usage + tagged strategy/setup. Both require joining `TradeJournalEntry` with trades, which extends `applyFilters` past its current pure-trade-array signature. Own session.
- **`[later]`** Leverage bucket — plan §11.5 hedges with *"if derivable"*. Neither `ReconstructedTrade` nor `RawFill` carries leverage data today; the dimension is blocked on a data-source decision (compute notional×side as a proxy? add a leverage-tracking pass to reconstruction? require Hyperliquid's `clearinghouseState` join?), not on UX. Revisit once the data path is decided.
- **`[maybe]`** Per-bucket chip removal — clicking X on `Day: Mon` chip removes only Mon. 8b ships dimension-level chip clearing; per-bucket is additive.
- **`[maybe]`** Hour-level time-of-day filtering — bypasses 4-band buckets for 24-hour-grid multi-select. Power-user feature.
- **`[maybe]`** Wallet-relative trade-size quartiles (Q1/Q2/Q3/Q4) as an alternative to absolute buckets. Useful when comparing wallets of very different sizes on the same UI.
- **`[maybe]`** "All selected = no filter" UX hint in the drawer when the user has manually selected every bucket of a dimension. Today the chip honestly shows "N selected"; a subtle hint that this is functionally identical to default could reduce confusion.
- **`[maybe]`** Bulk-select / clear-all controls inside `MultiBucketControl` (e.g., a "Weekdays" button on day-of-week). Convenience; not essential for v1.
- **`[maybe]`** Per-dimension provenance markers in chips. 8b chips read like "Hold: scalp" without `derived` badging — same as 8a. Reconsider when a journal-derived dimension lands in 8c (stop-loss is `inferred` quality).

---

## 11. References

- `docs/plan.md` §11.5 — Filtering & Exploration System
- `docs/superpowers/specs/2026-04-28-session-8a-filters-design.md` — predecessor
- `docs/DECISIONS.md` ADR-0004 — URL is the source of truth
- `docs/DECISIONS.md` ADR-0006 — Entities for types crossing the lib/domain boundary
- `docs/DECISIONS.md` ADR-0009 — Sheet/Drawer primitive (8a)
- `docs/SESSION_LOG.md` 2026-04-29 — Session 8a (gotchas: ORDER-constant boundary, available-coins invariant, `setSearchParams(replace: true)`, Sheet portal)
