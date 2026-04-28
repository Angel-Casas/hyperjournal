# Session 8a — Filter panel on `/w/:address` (5 dimensions)

**Date:** 2026-04-28
**Phase:** 1 → Phase 2 transition (first session of Phase 2 — Deep Analytics & Pattern Detection)
**Plan reference:** `docs/plan.md` §11.5 (Filtering & Exploration System)
**ADR baseline:** ADR-0004 (URL is the source of truth for addressable UI state)

---

## 1. Background and goals

`/w/:address` today shows every reconstructed trade across every surface
(MetricsGrid, EquityCurveChart, PnlCalendarChart, TradeHistoryList).
`docs/plan.md` §11.5 calls for a filtering system that lets the user view the
same data through narrower lenses without cluttering the dashboard. BACKLOG
flags the filter panel as `[soon]` (Session 4a deferral). Several dependent
items unblock once filters land — calendar-cell click → date-range filter
(`[maybe]` in Session 4b deferrals), per-coin breakdown of `TradeStats`
(`[soon]` in Session 4a deferrals), and the entire pattern-detection
phase (§11.7) which depends on filterable subsets.

**Goal of Session 8a.** Ship 5 of the 12 dimensions in plan §11.5 — the ones
that compose cheapest and unblock the most:

- date range (preset + custom)
- coin / asset
- long vs short
- closed vs open
- winner vs loser

The remaining 7 (hold-duration, leverage, time-of-day, day-of-week, strategy,
stop-loss usage, size range) are deferred to Session 8b.

**Non-goals.**

- Multi-coin selection (single-coin in 8a; widening to `string[]` is additive).
- Saved filter presets in Dexie.
- Calendar-cell click → filter (additive in a follow-up; depends on this).
- Filter-aware empty states on charts (equity curve, calendar fall through to
  existing empty placeholders; bespoke copy is Phase 5 polish).
- Pattern detection (§11.7) — independent feature; the filter substrate is a
  prerequisite.

---

## 2. Architecture

```
URL search params  ──parse──►  FilterState  ──►  applyFilters(trades, FilterState)
       ▲                       (typed)         (pure domain)            │
       │                                                                ▼
       │ updateFilters(...)                                       Trade[]filtered
       │                                                                │
   <FiltersDrawer>                                  ┌────────┬──────────┴──────────┬────────────────┐
     - DateRangeControl                              ▼        ▼                    ▼                ▼
     - CoinSelectControl                       MetricsGrid  EquityCurveChart  PnlCalendarChart  TradeHistoryList
     - LongShortToggle
     - StatusToggle
     - OutcomeToggle

   <ActiveFilterChips>  ◄──── reads FilterState, shows compact summary + Clear-all
```

**State location: URL search params.** Per ADR-0004 — addressable state
(deep-linkable, share-via-URL, browser-back) lives in the route. Filters are
explicitly enumerated in ADR-0004 as URL-state ("filter state if shareable").

**Activation: live-apply.** Filter changes flow URL → state → re-render
synchronously. No "Apply" button. Filtering is in-memory and instant; users
get immediate feedback on every control change. Drafts-on-Zustand-then-commit
(approach C in brainstorming) was rejected as over-engineered for 5 filters.

**Filter scope: uniform across all four data surfaces.** A filter pre-filters
the `trades` array before it's passed to MetricsGrid / EquityCurveChart /
PnlCalendarChart / TradeHistoryList. Hybrid filtering (some surfaces always
show full activity) was rejected during brainstorming — the calendar's
contract changes from "your trading activity by day" to "your filtered
trading activity by day," which the user accepted because the BACKLOG already
treats calendar-cell-click as a filter-driving action.

**Five new files this session:**

- `src/domain/filters/applyFilters.ts` — pure, takes `(trades, state)`,
  returns `trades`. The composition seam.
- `src/domain/filters/filterState.ts` — `FilterState` type, defaults,
  predicates (`isDefault`, `countActive`), per-dimension immutable updaters.
- `src/lib/validation/filterState.ts` — Zod schema for parsing URL params;
  rejects garbage to defaults without UI error.
- `src/features/wallets/components/FiltersDrawer.tsx` — drawer + 5 controls.
- `src/features/wallets/components/ActiveFilterChips.tsx` — chip strip
  (renders nothing when `isDefault`).

`src/app/WalletView.tsx` is the only file that wires URL ↔ state ↔
pre-filter ↔ surfaces. Existing components (MetricsGrid, EquityCurveChart,
PnlCalendarChart, TradeHistoryList) take their `trades` prop unchanged —
they're just fed a filtered array.

---

## 3. Data model

### 3.1 `FilterState` shape

```ts
// src/domain/filters/filterState.ts
export type DateRangePreset = '7d' | '30d' | '90d' | '1y' | 'all';
export type Side = 'all' | 'long' | 'short';
export type Status = 'all' | 'closed' | 'open';
export type Outcome = 'all' | 'winner' | 'loser';

export type FilterState = {
  dateRange:
    | { kind: 'preset'; preset: DateRangePreset }
    | { kind: 'custom'; from: YYYYMMDD; to: YYYYMMDD };
  coin: string | null;     // single coin, e.g. "BTC". null = all.
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

export function isDefault(state: FilterState): boolean;
export function countActive(state: FilterState): number;
// Per-dimension immutable updaters: setCoin, setSide, setStatus, setOutcome,
// setDateRangePreset, setCustomDateRange, clearCoin, clearAll, etc.
```

`YYYYMMDD` is the existing branded date type from `@domain/dates/`.

### 3.2 URL encoding

Only **non-default** values appear in the URL. Default state ⇒ no params.

| State                                 | URL                              |
|---------------------------------------|----------------------------------|
| Default (no filters)                  | `/w/0xabc`                       |
| Last 30 days                          | `/w/0xabc?range=30d`             |
| BTC + Long + Closed                   | `/w/0xabc?coin=BTC&side=long&status=closed` |
| Custom range Jan 1 – Apr 28           | `/w/0xabc?from=2026-01-01&to=2026-04-28` |
| Default + Outcome=winner              | `/w/0xabc?outcome=winner`        |

**Param vocabulary:**
- `range` — `7d` | `30d` | `90d` | `1y` (`all` is the default and is omitted).
- `from`, `to` — both required when custom; both `YYYY-MM-DD`.
- `coin` — non-empty string.
- `side` — `long` | `short` (`all` is omitted).
- `status` — `closed` | `open` (`all` is omitted).
- `outcome` — `winner` | `loser` (`all` is omitted).

**Mutually exclusive `range` vs `from`/`to`:** if both are present in a
hand-edited or stale URL, **custom wins** (i.e., `from`/`to` parse first; if
either fails, fall back to `range`; if `range` also invalid, default to
`{kind:'preset', preset:'all'}`). Rationale: explicit dates are higher-intent
than a remembered preset.

### 3.3 Garbage handling

`parseFilterStateFromSearchParams(params: URLSearchParams): FilterState`
returns `DEFAULT_FILTER_STATE` when **any** validation fails. Per-dimension
fall-through: an invalid `coin=` (empty) defaults `coin` to `null` but keeps
other valid params. Implemented via Zod `safeParse` per-dimension. **No toast,
no error banner** — filters are forgiving and self-healing on next user
action. Rationale: filter URLs come from typos, future versions, copy/paste
mishaps; surfacing errors is worse UX than silently doing the right thing.

---

## 4. Domain function `applyFilters`

```ts
// src/domain/filters/applyFilters.ts
type Options = { now?: number }; // injectable for deterministic tests

export function applyFilters(
  trades: ReadonlyArray<ReconstructedTrade>,
  state: FilterState,
  options: Options = {},
): ReadonlyArray<ReconstructedTrade> {
  if (isDefault(state)) return trades;        // fast path: no copy
  const { fromMs, toMs } = resolveDateRange(state.dateRange, options.now ?? Date.now());
  return trades.filter((t) =>
    matchesDate(t, fromMs, toMs) &&
    matchesCoin(t, state.coin) &&
    matchesSide(t, state.side) &&
    matchesStatus(t, state.status) &&
    matchesOutcome(t, state.outcome)
  );
}
```

### 4.1 Per-dimension predicates

Each predicate is its own internal function with a co-located unit test. All
are pure and return `boolean`.

- **`matchesDate(trade, fromMs, toMs)`** uses `trade.openedAt`. A trade
  matches if `fromMs <= openedAt < toMs`. `from = -Infinity` and
  `to = +Infinity` for the `all` preset. `openedAt` and `closedAt` are
  both always defined on `ReconstructedTrade` (closedAt equals openedAt for
  single-fill trades and equals the last fill's timestamp for open trades).
  - **Why `openedAt` not `closedAt`:** a closed-Apr-28 trade opened in Feb is
    "a Feb trade" for the trader's mental model. The P/L calendar already
    disambiguates by close-date when displaying daily PnL, so the surfaces
    stay consistent.
- **`matchesCoin(trade, coin)`** — exact string match against `trade.coin`.
  `null` ⇒ pass.
- **`matchesSide(trade, side)`** — `'all'` ⇒ pass; otherwise exact match
  against `trade.side`.
- **`matchesStatus(trade, status)`** — `'all'` ⇒ pass; otherwise exact match
  against `trade.status`.
- **`matchesOutcome(trade, outcome)`** — `'all'` ⇒ pass;
  - `'winner'` matches `trade.status === 'closed' && trade.realizedPnl > 0`,
  - `'loser'` matches `trade.status === 'closed' && trade.realizedPnl < 0`.
  - `trade.realizedPnl` is always a `number` on `ReconstructedTrade`
    (`0` for open trades, fixed for closed) — no nullability check needed.
  - **Break-even trades** (`status === 'closed' && realizedPnl === 0`) match
    neither winner nor loser — same convention `computeTradeStats` uses
    (BACKLOG already flags `breakEvenCount`).
  - **Open trades** (`status === 'open'`, where `realizedPnl === 0` by
    convention) match neither winner nor loser by definition. The explicit
    `status === 'closed'` guard prevents an open trade with `realizedPnl: 0`
    from accidentally counting as break-even semantics under outcome
    filtering.

### 4.2 Date-range preset resolution

Relative to `now` (injectable), all UTC:

| Preset  | `fromMs`              | `toMs`                  |
|---------|-----------------------|-------------------------|
| `7d`    | `now - 7 days`        | `now`                   |
| `30d`   | `now - 30 days`       | `now`                   |
| `90d`   | `now - 90 days`       | `now`                   |
| `1y`    | `now - 365 days`      | `now`                   |
| `all`   | `-Infinity`           | `+Infinity`             |
| custom  | midnight UTC of `from`| midnight UTC of `to`+1d |

Custom `to` is **end-of-day-exclusive** — `to=2026-04-28` includes everything
up to and including 2026-04-28 23:59:59.999 UTC. This matches user
expectation ("up to and including the 28th") while letting the predicate use
a clean half-open interval.

`resolveDateRange` lives in its own file (`src/domain/filters/resolveDateRange.ts`)
with its own test. Clean unit boundary.

### 4.3 Empty result

`applyFilters` returns `[]` when no trades match. Downstream surfaces handle
empty arrays today — `computeTradeStats([])` returns null-everywhere, equity
curve renders an empty-state placeholder, calendar shows a uniform-neutral
grid. No new empty-state work for charts/metrics. `TradeHistoryList` gets a
new filter-aware empty copy (§5.4).

---

## 5. UI surface

### 5.1 Filters button

Sits in `WalletHeader` next to the existing Refresh button. `<button>` styled
like `Button variant="outline" size="sm"`, label "Filters", with a count
badge when `countActive(state) > 0`:

```
┌─────────┐  ┌─────────────┐
│ Refresh │  │ Filters · 3 │   ← badge appears only when > 0
└─────────┘  └─────────────┘
```

Existing `WalletHeader.tsx` gains an `onOpenFilters` prop and a `filterCount`
prop. Badge uses the existing `bg-accent text-fg-base` token pair for tonal
consistency with other count chips.

### 5.2 FiltersDrawer

A Radix `Sheet` (right-side slide-in, ~360px wide on desktop, full-width on
mobile). Already a transitive dep through shadcn — **no new package**.

- **Header:** "Filters" + close button + "Clear all" (disabled when
  `isDefault(state)`).
- **Body:** 5 stacked control sections separated by 1px `border-border`
  dividers, top-to-bottom:
  1. **Date range** — preset row (5 chips: `7d / 30d / 90d / 1y / All time`,
     exactly one active) + a "Custom…" chip that, when active, reveals two
     `<input type="date">` fields below labeled "From" and "To". Selecting a
     preset hides the date inputs.
  2. **Coin** — combobox-style search input over the wallet's distinct coins
     (derived once from unfiltered `trades` via `useMemo`). Single-select.
     Placeholder "All coins". X chip-style clear when a coin is selected.
  3. **Side** — three-pill segmented control: `All / Long / Short`.
  4. **Status** — three-pill segmented control: `All / Closed / Open`.
  5. **Outcome** — three-pill segmented control: `All / Winners / Losers`.
- **Footer:** none. Live-apply means there's no Apply button. Closing the
  drawer just hides it; filters stay applied.

**Mobile (≤ 480px):** Drawer slides up from bottom (`Sheet side="bottom"`)
via a CSS media query gate. ActiveFilterChips wraps to multiple lines.

**Accessibility:** Radix's built-in focus trap, `aria-labelledby` on the
header, `Esc` closes. Each control's group has a visible label tied via
`aria-labelledby`.

### 5.3 ActiveFilterChips

Renders directly above the metrics grid, only when `!isDefault(state)`:

```
[ BTC × ]  [ Long × ]  [ Closed × ]  [ Last 30 days × ]   Clear all
```

- Each chip has its own X to remove just that dimension (resets to default;
  updates URL).
- "Clear all" resets the whole `FilterState` and removes all params.
- Chips reuse the existing `Tag`-style chip styling from
  `@lib/ui/components/tag-chip-list` for visual consistency, but are
  clickable (not the read-only variant). New variant `clickable` added to
  the tag-chip primitive — small additive change.
- Chip `aria-label`: `"Remove <dimension> filter"` (e.g., "Remove coin
  filter").

### 5.4 Empty-result UX in `<TradeHistoryList>`

When `trades.length === 0` and a filter is active, the list renders:

> No trades match these filters.
> [ Clear all ]

Same component handles the no-trades-at-all case today. Extension: add a new
optional `hasActiveFilters: boolean` prop; the component branches between
"no trades" copy and "no trades match filters" copy. The Clear-all button
calls a new optional `onClearFilters?: () => void` prop. `WalletView`
threads both props down.

### 5.5 Coin selector data source

`availableCoins` is derived from the **unfiltered** `trades`, not from
`filteredTrades`. Otherwise narrowing to BTC removes "ETH" from the dropdown
and the user can't widen back. The derivation is `useMemo`'d on `trades`.

---

## 6. Route integration

`src/app/WalletView.tsx` is the only file that wires URL ↔ state ↔
pre-filter ↔ surfaces:

```ts
function WalletView() {
  const { address } = useParams<{ address: string }>();
  const fillsQuery = useUserFills(address);
  const trades = useMemo(
    () => reconstructTrades(fillsQuery.data ?? [], { wallet: address }),
    [fillsQuery.data, address]
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const filterState = useMemo(
    () => parseFilterStateFromSearchParams(searchParams),
    [searchParams]
  );
  const setFilterState = useCallback(
    (next: FilterState) => {
      setSearchParams(serializeFilterStateToSearchParams(next), { replace: true });
    },
    [setSearchParams]
  );

  const filteredTrades = useMemo(
    () => applyFilters(trades, filterState),
    [trades, filterState]
  );
  const availableCoins = useMemo(
    () => Array.from(new Set(trades.map((t) => t.coin))).sort(),
    [trades]
  );
  const hasActiveFilters = !isDefault(filterState);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <WalletHeader
        address={address}
        onOpenFilters={() => setDrawerOpen(true)}
        filterCount={countActive(filterState)}
      />
      {hasActiveFilters && (
        <ActiveFilterChips state={filterState} onChange={setFilterState} />
      )}
      <FiltersDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        state={filterState}
        onChange={setFilterState}
        availableCoins={availableCoins}
      />
      <MetricsGrid trades={filteredTrades} />
      <EquityCurveChart trades={filteredTrades} />
      <PnlCalendarChart trades={filteredTrades} />
      <TradeHistoryList
        trades={filteredTrades}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={() => setFilterState(DEFAULT_FILTER_STATE)}
      />
    </>
  );
}
```

**Wiring decisions:**

1. **`replace: true` on `setSearchParams`** — filter changes don't pollute
   browser history with one entry per chip-X-click. Back-button still works
   because it goes back to the *pre-filter* URL state. Push-mode (back-button
   = filter undo) is BACKLOG; can be opted into later.
2. **`availableCoins` from unfiltered `trades`** (§5.5).
3. **`useMemo` discipline** — `trades`, `filterState`, `filteredTrades`,
   `availableCoins`, all `useMemo`'d. Re-renders cascade via prop reference,
   matching CONVENTIONS §11 (EChartsBase wants stable option references).
4. **No new TanStack Query calls** — filtering is in-memory pre-aggregation.
   `useUserFills` cache-through (CONVENTIONS §6) is unchanged. Filters never
   touch the network.
5. **Provenance is preserved** — `applyFilters` returns a subset of the same
   `ReconstructedTrade` objects. Filtering doesn't introduce inferred values.

---

## 7. Testing

### 7.1 Domain (≥ 90% coverage threshold per CONVENTIONS §3)

- `applyFilters.test.ts` — happy path per dimension (one trade in / out per
  filter), short-circuit on `isDefault`, composition (multi-filter AND),
  edge cases (empty trades, all-no-match, all-all-match). Use existing
  `mkTrade` factory pattern from `@domain/metrics/`. ~12 tests.
- `filterState.test.ts` — `isDefault` / `countActive` / immutable updaters
  (one per dimension). ~8 tests.
- `resolveDateRange.test.ts` — preset → ms boundaries with injected `now`,
  custom-range UTC midnight semantics, `to` end-of-day-exclusive. ~6 tests.

### 7.2 Validation

- `parseFilterStateFromSearchParams.test.ts` — empty params → defaults, valid
  params → typed state, garbage params silently default, mutually exclusive
  `range` vs `from`/`to` (custom wins). ~10 tests.
- `serializeFilterStateToSearchParams.test.ts` — defaults round-trip to empty
  params, non-default values produce expected URL strings, round-trip
  identity (`parse(serialize(state)) === state`). ~6 tests.

### 7.3 Components

- `FiltersDrawer.test.tsx` — open/close, each control updates its dimension
  via `onChange` spy, "Clear all" calls `onChange(DEFAULT_FILTER_STATE)`,
  `availableCoins` mock. ~6 tests.
- `ActiveFilterChips.test.tsx` — renders nothing when `isDefault`, one chip
  per active dimension, X removes just that dimension, "Clear all" resets.
  ~5 tests.
- `WalletHeader.test.tsx` — extends existing tests for the Filters button +
  count badge (hidden when 0, visible when > 0). ~2 new tests.
- `WalletView.test.tsx` — extends to cover URL ↔ state round-trip:
  `?coin=BTC` mounts pre-selected, chip X updates URL, opening drawer
  doesn't change URL, surfaces receive filtered arrays (assert via prop spy
  on stubs). ~4 new tests.
- `TradeHistoryList.test.tsx` — one new test for the "No trades match these
  filters" branch. ~1 new test.

### 7.4 E2E (`e2e/filters-roundtrip.spec.ts`) — 3 scenarios

1. **Apply, observe propagation, share via URL:** paste wallet → open drawer
   → select Long + Closed → assert metrics-grid value changes, history-list
   row count drops → copy URL → open in fresh context → assert filter state
   restored.
2. **Empty result + clear all:** apply a filter that yields zero trades →
   assert empty-state copy → click "Clear all" → assert URL params gone,
   history populated again.
3. **Custom date range:** open drawer → click Custom → fill from/to → assert
   chips show the custom range → reload → assert filter persists.

### 7.5 Final test counts (target)

- Unit: ~428 + ~62 = **~490**
- E2E: 17 + 3 = **20**

### 7.6 Patterns reused (no new conventions required)

- `mkTrade` factory — same shape as `@domain/metrics/computeTradeStats.test.ts`.
- `<MemoryRouter initialEntries={['?coin=BTC']}>` for `WalletView.test.tsx`
  — already used in existing route tests.
- `db: HyperJournalDb` injection — N/A; filters are pure with no storage.

---

## 8. Out-of-scope items routed to BACKLOG

- `[next]` Session 8b — the other 7 dimensions from plan §11.5: hold-duration
  bucket, leverage bucket, time-of-day, day-of-week, tagged strategy,
  stop-loss usage, trade-size range. Composes additively on `applyFilters`
  and `FilterState`.
- `[soon]` Calendar-cell click → `from=YYYY-MM-DD&to=YYYY-MM-DD` filter.
  Already in BACKLOG; unblocks once filters land.
- `[soon]` Per-coin breakdown of `TradeStats`. Already in BACKLOG; the coin
  filter answers the same question but a "BTC only / ETH only / all"
  split-view in the metrics grid is a different UX.
- `[maybe]` Multi-coin select (`coin: string[]`). Additive widening of the
  type. Wait for real demand.
- `[maybe]` Saved filter presets in Dexie ("My BTC longs"). `userSettings`
  table extension; needs a small repo + a "Save current as…" affordance.
- `[maybe]` Filter presets shareable via short ID rather than long URL —
  `?preset=abc123` resolving locally. Useful when filter URLs grow.
- `[maybe]` Push-mode `setSearchParams` so browser back-button = filter undo
  — opt-in via a settings toggle if users ask for it.
- `[maybe]` Filter analytics — "you most often filter to BTC + Long; want to
  make that your default?" Phase 5+ polish.
- `[maybe]` Hybrid filtering (some surfaces always show full activity) —
  explicitly rejected for 8a (uniform was chosen). Revisit only if a user
  surfaces that the calendar's contract feels broken.
- `[maybe]` Custom date picker primitive (replacing `<input type="date">`).
  Phase 5 polish; would need an ADR for the dependency choice.
- `[maybe]` Empty-result UX on charts (equity curve, calendar) — bespoke
  filter-aware copy is polish.

---

## 9. Acceptance criteria

Implementation is complete when all of the following hold:

1. Pasting a wallet and opening `/w/:address` with no query params shows
   every trade as today (zero behaviour change for default state).
2. Clicking **Filters** in `WalletHeader` opens the drawer; the button's
   count badge reflects `countActive(state)`.
3. The 5 controls (date range with presets + custom, coin, side, status,
   outcome) each update their dimension live; the URL reflects the change
   immediately via `replace`-mode navigation.
4. URL is the source of truth — refreshing the page preserves the filter
   state; opening the URL in a fresh browser context restores the same
   filtered view.
5. Garbage URL params (`?range=garbage`, `?coin=`, future-version params)
   silently fall back to defaults without throwing or showing an error UI.
6. Active filters render as a chip strip above the metrics grid (only when
   `!isDefault(state)`); each chip's X removes just that dimension;
   "Clear all" resets to defaults and removes all params from the URL.
7. The four data surfaces (`MetricsGrid`, `EquityCurveChart`,
   `PnlCalendarChart`, `TradeHistoryList`) all receive the filtered trade
   array and re-render correctly.
8. `TradeHistoryList` shows a filter-aware empty-state when filters yield
   zero trades, with a Clear-all action.
9. The coin selector's options list is derived from the **unfiltered**
   trades — narrowing to BTC doesn't remove ETH from the dropdown.
10. Custom date range respects UTC midnight semantics — `to=2026-04-28`
    includes everything up to and including 2026-04-28 23:59:59.999 UTC.
11. Domain coverage stays ≥ 90% on `src/domain/filters/**`.
12. End-of-session gauntlet (`pnpm typecheck && pnpm lint && pnpm test &&
    pnpm test:e2e && pnpm build`) is green.
13. SESSION_LOG, BACKLOG, CONVENTIONS updated per CLAUDE.md §5; no new ADR
    (architecture is determined by ADR-0004 + plan §11.5; the design
    choices made here are conventions, not novel architecture).

---

## 10. Open questions (none)

All architectural and UX choices were resolved during brainstorming.
Implementation-detail decisions (e.g., exact spring timing on the drawer
animation, chip-strip wrap behavior under narrow viewports) are left to the
implementation plan.
