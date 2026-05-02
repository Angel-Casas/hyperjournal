# Session Log

Append-only record of what each session worked on. Newest entries at the top.

Every session **must** add an entry before closing. The goal is that a future session can read the most recent 2–3 entries and immediately understand the current state of the project.

## Entry format

```
## YYYY-MM-DD — <Short title>

**Session goal:** <one line>

**Done:**
- <bullet>
- <bullet>

**Deferred / not done:**
- <bullet> — <why>

**Decisions made:** <ADR-XXXX, ADR-YYYY> (or "none")

**Gotchas / notes for next session:**
- <anything non-obvious the next session should know>

**Invariants assumed:**
- <any assumption this session made that isn't written down elsewhere>
```

---

## 2026-04-21 — Phase 1 Session 1: Scaffold & shell

**Session goal:** Lay the Vite + React + TS-strict foundation with Tailwind tokens, split-home route, PWA scaffold for GH Pages, import-boundary-enforcing ESLint, a working Vitest TDD loop proven end-to-end, and a CI deploy workflow.

**Done:**

- Scaffolded Vite 5 + React 18 + TS 5 strict (Node 22.14, pnpm 10.15). Every runtime and dev dependency pinned in `package.json`.
- Tailwind configured with dark-first HSL-CSS-variable tokens (`gain`, `loss`, `risk`, `neutral`, `accent`, bg/fg/border variants). Global `prefers-reduced-motion` override in `src/styles/globals.css`.
- App shell: `AppProviders` (TanStack Query with sensible defaults), `AppRouter` (React Router v6 `createBrowserRouter` with `basename` tied to `import.meta.env.BASE_URL`), and `SplitHome` route rendering `AnalyticsPanel` + `JournalPanel` empty-state cards. `SplitHome` lives in `src/app/`, not `src/features/home/`, because cross-feature composition cannot live in a feature folder without violating CLAUDE.md §3.7 (see refactor commit `2a05638`).
- ESLint (legacy `.eslintrc.cjs`) with `eslint-plugin-boundaries` encoding CLAUDE.md §4. Added `eslint-import-resolver-typescript` + ADR-0005 so the rule also fires on `@features/*` aliased imports, not just relative ones (the rule was silently half-enforcing without it).
- Prettier configured; tracked docs and one source file reformatted to conform.
- Vitest + RTL + jsdom; setup file in `src/tests/setup.ts`; smoke test at `src/app/SplitHome.test.tsx`.
- First TDD cycle end-to-end: `src/entities/wallet.ts` (branded `WalletAddress`) + `src/domain/wallets/isValidWalletAddress.{ts,test.ts}` (8 tests, 100% coverage; 90% threshold enforced for `src/domain/**`).
- PWA scaffold: inline-SVG favicon, placeholder icons, spa-github-pages 404.html redirect + companion decoder script in `index.html`.
- GitHub Actions workflow `.github/workflows/deploy.yml` that installs with `--frozen-lockfile`, runs typecheck + lint + `test:coverage` + build (with `VITE_BASE_PATH=/<repo>/`), then deploys via `actions/deploy-pages@v4`. The 404.html fallback step is guarded to avoid overwriting the real redirect file.
- Updated `docs/CONVENTIONS.md` §§2–3, 5–6, 8–10 with patterns that landed this session.

**Deferred / not done:**

- Playwright and any E2E tests — no user flow to exercise yet; Session 4+.
- shadcn/ui initialization — first real consumer arrives in Session 2 (wallet input).
- Real PWA icons (192/512 PNG + maskable variants) — Session 5 polish.
- The automatic merge of `packageManager@pnpm@9.12.0` (plan) → `pnpm@10.15.0` (local env) was applied without an ADR because 10.x is drop-in compatible for our usage. If it causes friction later, revisit.

**Decisions made:** ADR-0002 (GH Pages deploy), ADR-0003 (pnpm), ADR-0004 (React Router v6 BrowserRouter), ADR-0005 (ESLint legacy config + `eslint-import-resolver-typescript`).

**Gotchas for next session:**

- Production builds must be run with `VITE_BASE_PATH=/<repo-name>/` or Pages asset paths 404. CI sets this from `github.event.repository.name`; locally, set it manually.
- Per ADR-0004, the wallet address belongs in the URL (e.g., `/w/:address`), not in Zustand. Session 2's wallet feature should consume it with `useParams()`.
- Path aliases are duplicated across `tsconfig.json`, `vite.config.ts`, and `vitest.config.ts`. Any new alias must be added to all three or tests, build, or lint will silently miss it. `eslint-import-resolver-typescript` reads from `tsconfig.json` automatically.
- The boundaries rule now fires on both relative and aliased imports. A probe (`src/domain/wallets/_probe.tsx` importing `@features/analytics`) was used during Task 5 to verify and then cleaned up. Repeat the probe pattern when changing boundary rules in the future.
- After the first push to GitHub, enable Pages manually: Settings → Pages → Source: GitHub Actions. Not automatable.
- The `Copy 404.html` step in the CI workflow is guarded (`if [ ! -f dist/404.html ]`) so it does not overwrite the SPA redirect written by `public/404.html`. The original plan text had an unconditional `cp` that would have broken SPA routing in production — left a note in Task 9's prompt about the fix.
- `features/home/` was tried and removed; do not reintroduce it. Composition across features goes in `src/app/`.

**Invariants assumed:**

- Every test added to `src/domain/**` keeps coverage ≥ 90% (threshold in `vitest.config.ts`). Tests for `lib/`, `features/`, etc. are not coverage-enforced (yet).
- `src/styles/globals.css` is the single source of CSS custom properties; components consume them only through Tailwind color classes. Hex/rgb literals in components are a regression.
- The `boundaries` ESLint rule is the authoritative encoder of CLAUDE.md §4. Any relaxation requires an ADR that amends §4 first.
- The commit history tells the story one logical change at a time. Do not squash: the sequence of dbcf2cb → 1ef8f62 → 2a05638 encodes the review response loop that produced the final Task 4 state; future readers need to see it.

---

## 2026-04-21 — Phase 1 Session 2a: Data layer foundation

**Session goal:** Build the fetch → validate → type pipeline from Hyperliquid's `/info` endpoint, backed by committed anonymized fixtures, ready for Session 2b to layer UI + Dexie on top.

**Done:**

- `zod@3.23.8` installed as a runtime dependency (blessed in CLAUDE.md §2, just wasn't yet in `package.json`).
- `src/entities/`: added `Wallet` (local-first concept), `Provenance` / `Provenanced<T>` (plan.md §4.4 classification), and `RawFill` as a **plain-type entity** whose shape is the stable contract. The Zod schema verifies mutual assignability at compile time via a `_schemaCheck` constant — if the wire shape ever drifts, `tsc --noEmit` fails in `lib/validation`, not in `entities`.
- `src/lib/validation/hyperliquid.ts`: Zod schemas for `userFills` (`FillSchema` / `UserFillsResponseSchema`) and `clearinghouseState` (`ClearinghouseStateSchema`). Shared `NumericString` transformer coerces HL's string-encoded quantities into `number` at the boundary. `side` constrained to `'B' | 'A'`. `twapId` nullable. `entryPx` and `liquidationPx` nullable. Schemas use default `.strip()` behavior — forward-compat fields are silently dropped until explicitly added.
- `src/lib/api/hyperliquid.ts`: `postInfo<T>()` + `fetchUserFills` + `fetchClearinghouseState`. Throws `HyperliquidApiError` (with `status` and `body` preserved) on non-2xx; `ZodError` bubbles on schema mismatch. `postInfo` types its schema parameter as `z.ZodType<T, z.ZodTypeDef, unknown>` because the default `z.ZodType<T>` breaks on transform-carrying schemas — captured in CONVENTIONS.md §7.
- `tests/fixtures/hyperliquid/`: `user-fills.json` (2000 real fills from the authorized test wallet, truncated to 100, wallet address swapped for `0x0...01`), `clearinghouse-state.json` (full snapshot, anonymized), `README.md` documenting refresh + anonymization. Anonymization verified: `grep -rci 'f318AFb8...' tests/fixtures/` returns 0.
- Tests: 11 in `lib/validation` (7 FillSchema + 4 ClearinghouseStateSchema), 6 in `lib/api`, all fixture-driven and `fetch`-mocked. Total suite: 26 (was 9).
- CONVENTIONS.md §7 updated with API boundary error handling, entities-as-contract pattern, and the `z.ZodType<T, _, unknown>` workaround. §8 updated with fixture convention + mocked-fetch pattern.

**Decisions made:** none (no new ADRs; the dependency-direction choice for `RawFill` is an inference from CLAUDE.md §4, not a new principle).

**Deferred / not done:**

- `lib/storage/db.ts` (Dexie schema) and `features/wallets/` UI — Session 2b, by design.
- `userFillsByTime` / pagination — not required for 2b's happy path; add when analytics needs time-sliced fetches.
- Fixture-refresh automation (e.g., a `scripts/refresh-fixtures.ts`) — kept manual; low churn, low value.
- Entity promotion for `ClearinghouseState` — stays as a lib/validation type until a `domain/` consumer appears.

**Gotchas for next session:**

- `fetchUserFills` and `fetchClearinghouseState` **throw** (`HyperliquidApiError` on transport, `ZodError` on schema). Wrap in TanStack Query hooks; don't try/catch at the call site.
- `RawFill` lives at `@entities/fill`. Never import it from `@lib/validation/hyperliquid` — the boundaries rule forbids `entities → lib`, and the entity is the authoritative shape anyway.
- The real wallet address is in controller memory only. The fixture placeholder `0x0000000000000000000000000000000000000001` is what tests use. Never hardcode the real one in source.
- The `_schemaCheck` constant in `hyperliquid.ts` will break typecheck if someone changes `RawFill` in entities without also updating `FillSchema`, or vice versa. That's the point — treat the error as a design coordination signal, not a nuisance.
- When HL adds a new field you want, update BOTH `RawFill` (entity) and `FillSchema` (validation) in the same commit.
- Session 2b's first task should create `.nvmrc` (Session 1 reviewer flagged CI/local Node divergence; Session 1 pinned CI to 22, but an `.nvmrc` would close the loop).

**Invariants assumed:**

- No unit test makes a live HTTP call. The only live call ever made was Task 2's one-shot fixture bootstrap.
- Numeric strings from HL are always coerced to `number` at the validation boundary; downstream code never sees string-encoded numbers.
- Committed fixtures contain zero occurrences of the authorized wallet address (case-insensitive). Future refreshes must preserve this invariant.
- The dependency graph direction is `entities → (nothing)`, `lib/validation → entities`, `lib/api → lib/validation, entities`. A change that inverts any of these edges is a design regression.

---

## 2026-04-21 — Phase 1 Session 2b: Persistence + wallet feature

**Session goal:** Wire Session 2a's data pipeline into a working end-to-end slice — paste a wallet, land on `/w/:address`, see fills loaded and cached locally, survive a reload. Saved wallets listed on the landing page.

**Done:**

- `.nvmrc` pinning Node 22 (closes Session 1 reviewer's CI/local divergence flag).
- Hand-written shadcn-style primitives at `src/lib/ui/components/{button,input,label}.tsx` on top of `class-variance-authority`, `clsx`, and `tailwind-merge`. Deliberately skipped `shadcn init` because its interactive prompts and `tailwind.config.ts` auto-edits were at risk of clobbering HyperJournal's semantic token system. `buttonVariants` split into `button-variants.ts` so the component module stays component-only for React Fast Refresh.
- Installed `dexie@4.0.11` (runtime), `fake-indexeddb@6.0.0` (dev).
- `src/lib/storage/db.ts`: `HyperJournalDb` (Dexie) with three tables at schema v1 — `wallets` (&address, addedAt), `fillsCache` (&address, fetchedAt), `userSettings` (&key). `src/tests/setup.ts` now imports `fake-indexeddb/auto`.
- `src/lib/storage/wallets-repo.ts` + 6 tests: `save` (upsert), `list` (sorted by addedAt desc), `findByAddress` (returns `null`, not undefined), `remove` (no-op on miss).
- `src/lib/storage/fills-cache-repo.ts` + 6 tests: `get`, `set`, `invalidate`, `isFresh(ttl, now)` (clock is caller-supplied, not `Date.now()` inside the repo).
- `src/features/wallets/hooks/useUserFills.ts` + 4 tests: TanStack Query hook with Dexie cache-through. `queryFn` returns cached fills within 5-min TTL, else fetches live + writes through. On fetch failure with a prior cache, returns stale data instead of surfacing an error. Tests mock `global.fetch` and pass an injected test db.
- `src/features/wallets/hooks/useSavedWallets.ts`: list query + save/remove mutations, invalidating the list on mutate.
- `src/features/wallets/components/WalletPaste.tsx` + 5 tests: shadcn-style Input + Button, live validation via `isValidWalletAddress`, `aria-invalid` / `aria-describedby` wiring.
- `src/features/wallets/components/SavedWalletsList.tsx`: route-linked cards, empty/loading states.
- `src/features/wallets/index.ts`: real public surface (was empty `export {}`).
- `src/app/WalletView.tsx`: new `/w/:address` route; validates param, redirects `/` on invalid; upserts the wallet into the saved list on arrival; renders "Loaded N fills." from `useUserFills`.
- `src/app/SplitHome.tsx` rewritten: left column hosts Paste + Recent wallets; right column keeps the analytics / journal preview stubs. Test wraps in QueryClientProvider + MemoryRouter now that the tree uses hooks.
- End state: 50 tests passing across 8 files (was 29 after Session 2a). lint + typecheck + build all clean. Domain coverage still 100%.

**Decisions made:** none (no new ADRs).

**Deferred / not done:**

- Analytics panel integration on `/w/:address` — panel stays a stub. Session 4.
- Manual "Refresh" button, persisted TanStack initialData, error-message translation — BACKLOG.
- Export/import — Session 5.
- Playwright E2E — now ready to write (flow exists); BACKLOG (Session 4 or earlier).
- EIP-55 checksum validation — BACKLOG.

**Gotchas for next session:**

- `useSavedWallets().save.mutate` in `WalletView`'s useEffect runs on every address change but intentionally excludes `save` from deps (mutation identity is unstable; including it would infinite-loop). An eslint-disable-next-line with a prose justification is in place. Don't "fix" it.
- `isFresh(address, ttlMs, now)` takes a caller-supplied clock. Do not change the signature to use `Date.now()` internally — tests rely on controlling time.
- shadcn primitives are under `src/lib/ui/components/`. The boundaries rule treats all of `src/lib/**` as `lib`, so no new boundary exceptions.
- Dexie module-level `db` singleton is shared by all production hooks. Tests always pass `{ db: new HyperJournalDb(uniqueName) }` so state is isolated.
- Session 3 (reconstruction) reads from `FillsCacheEntry.fills` — that's the cached-but-validated RawFill array. No re-normalization needed before domain functions consume it.

**Invariants assumed:**

- Only `lib/storage/*-repo.ts` calls `db.<table>...` directly; features / hooks / components go through repo factories.
- Dexie schema version 1 is the baseline. Any future schema change bumps the version and adds an `.upgrade()` function; never mutate the existing `.version(1).stores({...})` call.
- The `cache-through` pattern (Dexie first, fetch if stale, write-back, fall back to stale on error) is the canonical shape for API-backed queries. Future hooks should mirror it, not invent new flows.

---

## 2026-04-21 — Phase 1 Session 3: Trade reconstruction engine

**Session goal:** Turn `RawFill[]` into `ReconstructedTrade[]` via pure functions in `domain/reconstruction/`, verified by an oracle that round-trips HL's own `closedPnl` accounting through the reconstruction and checks per-coin totals within $0.01.

**Done:**

- `src/entities/trade.ts`: `TradeLeg`, `TradeStatus`, `TradeSide`, `ReconstructedTrade` types. Derived fields carry `provenance: 'observed'` since they flow deterministically from observed fills. `avgEntryPx: number | null` — null when all opens were pre-window truncated.
- `src/domain/reconstruction/groupFillsByCoin.ts` + 6 tests: pure helper that partitions fills into per-coin arrays sorted by (time asc, tid asc). First-seen Map iteration order for determinism.
- `src/domain/reconstruction/reconstructCoinTrades.ts` + 12 tests: the core algorithm. Walks time-sorted fills for one coin, maintaining openSize / side / hasSeenOpen. Primes state from the first fill's signed `startPosition` to handle HL's 2000-fill truncation cap gracefully — trades that enter mid-position are reconstructed correctly, trades whose opens were entirely truncated emit with `openedSize: 0` and `avgEntryPx: null`. Throws on unknown `dir`, mid-stream dangling closes, and oversized closes (documented as v1 limitations in BACKLOG).
- `src/domain/reconstruction/reconstructTrades.ts` + 6 tests: top-level orchestrator composing groupFillsByCoin + reconstructCoinTrades. Tests verify leg↔fill one-to-one preservation against the real fixture.
- `src/domain/reconstruction/checkRealizedPnl.ts` + 4 tests: the correctness oracle. Sums HL's closedPnl per coin (filtered to fills that became legs), sums reconstructed realizedPnl per coin, asserts every delta within $0.01. **On the real fixture, every delta is exactly 0.00000000.** Per-coin realized PnL from the sample: NVDA +$1010.97, ORCL +$1279.08, BTC −$7.13, MSFT +$84.43, TAO +$5.57, BRENTOIL +$5.95, SNX −$1657.42.
- `chore(lint): exempt test files from boundaries/element-types rule` (`d64c1d1`) — test files need to reach across layer boundaries to exercise the pipeline end-to-end (e.g., a domain test importing a lib/validation schema); production code's enforcement is unchanged.
- End state: 81 tests across 12 files (was 51 after Session 2b). Gauntlet clean. Domain coverage still 100%.

**Decisions made:** none (no new ADRs; the test-files boundary relaxation is documented in the commit and CONVENTIONS.md rather than in DECISIONS.md).

**Deferred / not done:**

- Liquidation support — BACKLOG. Needs a wider fixture that includes `dir: "Liquidation"` to design properly.
- Single-fill flips — BACKLOG. HL seems to split flips but the algorithm throws on them for safety.
- Dropped-leading-truncation-fill surfacing — BACKLOG. Numbers are self-consistent via the oracle filter, but a UI view of those closes' PnL is missing.
- Funding attribution to trades — BACKLOG. Session 4 or 5 decision.
- Scale-in/scale-out pattern flags — BACKLOG for later pattern detection.
- Wallet stamping on trades — BACKLOG. Pure reconstruction doesn't know the wallet; Session 4's hook layer will pass it in.

**Gotchas for next session (Session 4):**

- `reconstructTrades(fills)` consumes Session 2b's `useUserFills` hook output directly — no adapter needed. Session 4 builds a `useReconstructedTrades` hook that composes: `useUserFills` → `reconstructTrades` via `useMemo`.
- Trades can have `avgEntryPx: null` (pre-window opens) or `avgExitPx: null` (still open). Session 4's analytics must handle these — render em-dash or "—" in tables, skip in aggregate price averages.
- The PnL oracle is available as a public export from `@domain/reconstruction/checkRealizedPnl`. Session 4's UI can surface the per-coin breakdown as a debug panel or as the headline "total realized PnL" number.
- Trades with `openedSize: 0` (pure-close truncated) still contribute to realized PnL correctly. Don't filter them out in aggregate PnL calculations.
- The `ZERO_TOLERANCE` constant for position-equals-zero checks is 1e-9. Session 4 should NOT adjust this; any trade-sum tolerance should use the higher-level `$0.01` USDC threshold from the PnL oracle.

**Invariants assumed:**

- Reconstruction is pure and deterministic: same input fills → identical `ReconstructedTrade[]` (including the same `id` strings). This is load-bearing for Session 4's React-memo usage.
- Every close-role fill that becomes a leg contributes its full `closedPnl` to the trade's `realizedPnl`. The PnL oracle depends on this invariant.
- `hasSeenOpen` semantics: once true within a coin's walk, it stays true for the rest of the walk. A close with `side: null` and `hasSeenOpen: true` is an algorithmic bug, not legitimate data.
- Priming semantics: `startPosition` on the first fill is the signed pre-window position. Sign encodes direction, absolute value encodes size. HL is trusted on this.

---

## 2026-04-21 — Phase 1 Session 4a: Analytics metrics + metric cards

**Session goal:** Turn `ReconstructedTrade[]` into a usable analytics view on `/w/:address` — pure `TradeStats` aggregation, TanStack hook, 11 metric cards showing real numbers. No charts (Session 4b).

**Done:**

- `src/entities/trade-stats.ts`: `TradeStats` type — 17 Tier-1 metrics. Nullable fields use `null` to mean "no data"; zero means a real zero.
- `src/domain/metrics/computeTradeStats.ts` + 15 tests: pure aggregator. Closed-only PnL, win rate, expectancy, profit factor, avg win/loss, drawdown (walk + peak-tracking), avg hold time, long/short split with per-side win rates, best/worst single trade, total fees (across all trades including opens). Real-fixture cross-check: totalPnl matches the sum of reconstructed realizedPnl exactly.
- `src/features/wallets/hooks/useWalletMetrics.ts` + 3 tests: composes `useUserFills → reconstructTrades → computeTradeStats` via `useMemo`. Returns `{ stats, isLoading, isError, error }`.
- `src/lib/ui/format.ts` + 18 tests: `formatCurrency`, `formatPercent`, `formatHoldTime`, `formatCompactCount`. All null-aware (render em-dash for no-data).
- `date-fns@4.1.0` installed — blessed in CLAUDE.md §2, reserved for Session 4b's calendar component.
- `src/lib/ui/components/metric-card.tsx` + 6 tests: generic analytics card with label, tone-coloured value, optional subtext, optional provenance dot.
- `src/features/wallets/components/WalletMetricsGrid.tsx`: 11 cards wired to `TradeStats`. Tones adapt to sign; drawdown shows peak-to-trough percent as subtext; expectancy has "per trade" subtext; fees note "across all trades".
- `src/app/WalletView.tsx` rewritten: drops the "Loaded N fills" placeholder, orchestrates `useWalletMetrics` → grid, preserves loading/error sections.
- CONVENTIONS.md §4 amended: null-vs-zero convention for analytical outputs, tone + provenance docs for `MetricCard`, note about `exactOptionalPropertyTypes: true` and conditional-prop spreading.
- Gauntlet clean: **126 tests** (was 84 after Session 3; +42 this session), typecheck + lint + coverage + build all green.

**Decisions made:** none (no new ADRs).

**Deferred / not done:**

- Charts (equity curve, P/L calendar) — Session 4b, by design.
- Trade history list on `/w/:address` — Session 4b.
- Tier-2 metrics (Sharpe, Kelly, risk of ruin, stop-loss usage) — BACKLOG for a later analytics session.
- Per-coin `TradeStats` breakdown — BACKLOG.
- Filter panel on `/w/:address` — BACKLOG (arrives with 4b's filters).

**Gotchas for next session (Session 4b):**

- `useWalletMetrics` returns `stats: TradeStats | null`. The grid only renders when stats is non-null. Session 4b's charts should follow the same shape — `{ data, isLoading, isError, error }` with memoized pure-domain data transforms.
- Every domain function under `src/domain/` that takes `ReconstructedTrade[]` and returns aggregates should be co-located with its tests and should NOT touch Dexie, fetch, React, or date-fns' Date (which would make it non-deterministic unless a clock is injected). 4b's calendar helper (bucket trades by day) takes a fills/trades array and returns the bucketed shape; the Date logic goes through date-fns' pure `startOfDay(new Date(ms))` etc.
- The existing `WalletMetricsGrid` uses `grid-cols-{2,3,4}` responsive breakpoints. 4b's layout should stack the equity curve above the grid on desktop and below on mobile, with the P/L calendar as a separate card.
- `stats.maxDrawdown` is stored as a positive magnitude. The grid negates it before passing to `formatCurrency` so the card shows `-$X` with loss tone. 4b's drawdown chart should use the positive magnitude for shading and axis labels but still display the sign in text.
- Sessions 4b and 3+ domain functions share one convention: `Date.now()` / `new Date()` are forbidden in `domain/`. If a metric needs "today," the caller passes `now: number` as a parameter.

**Invariants assumed:**

- `TradeStats.totalPnl` is bit-for-bit equal to the sum of realizedPnl across closed reconstructed trades, which is in turn bit-for-bit equal to HL's own per-coin closedPnl sum. That chain is the correctness guarantee the UI inherits from Session 3.
- `provenance: 'derived'` on `TradeStats` is the type-level truth: every field is a deterministic aggregation. MetricCard surfaces this via the accent-coloured provenance dot.
- Formatters NEVER mutate their input or throw. Pass invalid / null → get `—` back.
- `useMemo` in `useWalletMetrics` has dep `[fills.data]`. TanStack Query returns a stable reference while `data` is unchanged, so the pipeline runs exactly once per successful fetch.

---

## 2026-04-21 — Phase 1 Session 4b: Charts + P/L calendar + trade history

**Session goal:** Layer the three headline visualizations on top of Session 4a's metrics grid — equity curve, P/L calendar heatmap, and virtualized trade history. End state: `/w/:address` is a real analytics dashboard with live charts for any wallet.

**Done:**

- `echarts@5.5.1` installed. `src/lib/charts/EChartsBase.tsx` — thin React wrapper owning init/setOption/resize/dispose lifecycle per ADR-0007. Consumer passes a complete `EChartsOption`; wrapper never constructs options itself. 6 tests via `vi.hoisted()` + `vi.mock('echarts')` — real ECharts needs canvas + layout that jsdom lacks, so the tests verify lifecycle calls against a stub.
- `@tanstack/react-virtual@3.10.8` installed for trade-history virtualization.
- Pure-domain helpers: `buildEquityCurve(trades)` (4 tests) returns `[{time, equity, coin, pnl}]` time-sorted with running equity; `buildPnlCalendar(trades)` (5 tests) returns `Map<YYYY-MM-DD, {date, pnl, tradeCount}>` bucketed by UTC day. Open trades excluded from both.
- `EquityCurveChart` + `PnlCalendarChart` in `features/wallets/components/`. Each memoizes its `buildX` result, builds an `EChartsOption` with HyperJournal's dark HSL tokens (hoisted into a `TOKEN` const), and renders through `EChartsBase`. Custom tooltips formatted to match the metrics grid. Empty states when no closed trades.
- `TradeHistoryList` virtualized table with 6 columns (coin, side, opened date, status, PnL, held), sorted by effective timestamp (closedAt or openedAt) descending — most-recent-first. Open trades show em-dash in PnL and held columns. 300px viewport, ~40px rows, virtualized via `useVirtualizer`.
- `useWalletMetrics` now returns `{ stats, trades, isLoading, isError, error }` so the charts consume trades from the same memoized pipeline as the metrics grid (no second pass). `WalletView` stacks the four visualizations inside the existing layout.
- CONVENTIONS.md §11 added covering ECharts integration, option-memoization, HSL-tokens-in-charts exception to §5, chart-testing pattern, and virtualized-list testing caveat.
- src/tests/setup.ts polyfills `ResizeObserver` (jsdom lacks it; ECharts and react-virtual both reference it).
- End state: **156 tests** passing (was 132 after 4a + 4a.1; +24 this session). Gauntlet clean. Build produces 1.4MB precache (ECharts dominates; tree-shaking is a BACKLOG item).

**Decisions made:** ADR-0007 (raw `echarts` + hand-written 40-LOC wrapper, no `echarts-for-react`).

**Deferred / not done:**

- Playwright E2E on `/w/:address` — BACKLOG. jsdom can't verify virtualizer window or ECharts render; browser-level coverage is the right tool.
- Local-timezone calendar, equity benchmarks, export-as-PNG, day-click-to-filter — all BACKLOG.
- Bundle-size trim via ECharts tree-shaking (`echarts/core` + individual parts) — BACKLOG; measure first.

**Gotchas for next session (Session 5 or Phase 2):**

- `TOKEN` consts in `EquityCurveChart.tsx` and `PnlCalendarChart.tsx` duplicate HSL values. If the palette ever changes, update both. A shared `@lib/charts/tokens.ts` would be cleaner; skipped for now since we only have two chart components.
- ECharts is imported as `import * as echarts from 'echarts'` — the whole library ships. Tree-shaking to `echarts/core` + specific chart imports (LineChart, HeatmapChart, CalendarComponent, etc.) saves hundreds of KB. Do this during Session 5's PWA polish.
- `ResizeObserver` polyfill in `src/tests/setup.ts` is a no-op stub — it satisfies the module-load-time reference but doesn't actually trigger resize callbacks. That's fine for our tests but worth knowing if future tests need real resize behavior.
- Virtualizer returns empty `getVirtualItems()` in jsdom because layout is zero. Component tests verify structure (headers, empty-state, rowgroup), not row content. Playwright will fill the gap.
- The `TOKEN` exception to CONVENTIONS.md §5 (hardcoded HSL in chart options) is narrow: it applies ONLY to ECharts option objects. React components continue to use Tailwind semantic classes.

**Invariants assumed:**

- `EChartsBase` never mutates option objects. Consumers own the option shape entirely.
- Option objects passed to `EChartsBase` are memoized; identical content with a new reference triggers a needless `setOption`. Enforced by convention, not by the wrapper.
- Domain helpers (`buildEquityCurve`, `buildPnlCalendar`) are pure — no `Date.now()` or `new Date()` outside of UTC-accessor calls on a given input timestamp.
- The four visualizations on `/w/:address` consume the SAME `trades` reference from `useWalletMetrics`. If a view needs a filtered subset, the caller filters and passes a different prop — the domain transforms don't know about filtering.

---

## 2026-04-22 — Phase 1 Session 5: Analytics-side polish

**Session goal:** Close the gap between "charts render" and "shipped product" on `/w/:address` — responsive non-regression, PWA install, medium-depth a11y, error UX + refresh, and the break-even / profit-factor-∞ / ECharts-trim stragglers. No journaling, no export/import.

**Done:**

- `TradeStats.breakEvenCount` added to the entity + `computeTradeStats`. Surfaced as subtext on the Closed-trades metric card. [+2 tests; real-fixture totalPnl invariant preserved]
- Profit factor renders `∞` with the gain tone and "no losing trades" subtext when `avgWin !== null && avgLoss === null`. Domain unchanged — disambiguation lives in the UI by inspecting avgWin/avgLoss, because `profitFactor: null` alone can't tell "no trades" from "all wins."
- `WalletHeader` component extracted from `WalletView`. Carries the wallet chip (monospace, truncated), a Back link, and a Refresh button. [+4 tests]
- `useWalletMetrics` now returns `isFetching` and `refresh()`. `refresh()` invalidates both the Dexie cache entry AND the TanStack Query entry before refetching, bypassing the 5-minute TTL. [+1 test; uses `act()` to silence state-update warnings]
- Error paths on `/w/:address` map to human copy per error type: HyperliquidApiError 4xx ("no Hyperliquid history"), 5xx/network ("couldn't reach Hyperliquid"), ZodError ("data HyperJournal doesn't yet understand"), unknown ("something went wrong"). "Try again" button on every error path. [+5 tests, all wired through a mocked fetch at the global level]
- `PnlCalendarFallbackTable` — sr-only `<table>` rendered as a sibling of the aria-hidden ECharts canvas inside the same `<section>`. Screen readers now hear per-day rows (date / PnL / trade count) instead of silence. [+4 tests]
- `focus-visible` rings added to `SavedWalletsList`'s `<Link>` (the only remaining interactive primitive missing one — Button and Input already carried the class string). Promoted both left-column cards on `SplitHome` from `<div>`-with-`<h2>` to full `<section aria-labelledby>` landmarks.
- **Contrast audit:** computed WCAG AA ratios for every foreground token against both `bg-base` (6% L) and `bg-raised` (9% L). Only failure: `fg-subtle` on `bg-raised` at 4.29:1 (below 4.5 AA threshold for normal-size text — MetricCard's `text-xs` subtext uses exactly this combo). Bumped `--fg-subtle` lightness 50 → 55 %, new ratio 5.12. No other token adjustments; CHART_TOKENS unaffected since it doesn't reference fg-subtle.
- **Lighthouse accessibility audit:** one real finding — `[role]s are not contained by their required parent element` on `TradeHistoryList`. The six `columnheader` divs and six `cell` divs were inside a bare grid div, violating ARIA's "columnheader inside row inside rowgroup inside table" chain. Restructured with a proper `role="table"` wrapper, a header `role="row"` inside one rowgroup, and the virtualized body rows inside a second rowgroup. [+1 test for the table landmark; updated rowgroup test to pick `getAllByRole('rowgroup')[1]`]
- Keyboard tab-order sweep: confirmed clean. Refresh → Back on `/w/:address`; paste input → Analyze → saved-wallet links on `/`. Focus ring visible at every stop.
- **PWA install verification passed:** placeholder icons shipped as SVG (icon-192, icon-512, maskable-192, maskable-512). Manifest `icons` array populated with all four (purpose `any` × 2, `maskable` × 2). `includeAssets: ['favicon.svg', 'icons/*.svg']` so Workbox precaches them. apple-touch-icon `<link>` added to `index.html`. Chrome desktop install prompt appears on `pnpm preview`. Lighthouse installability check passes.
- **ECharts bundle trim:** new `@lib/charts/echarts-setup` module registers the parts we actually use (`LineChart`, `HeatmapChart`, `CalendarComponent`, `GridComponent`, `TooltipComponent`, `VisualMapComponent`, `CanvasRenderer`) on `echarts/core` and re-exports the namespace. `EChartsBase` imports from it; chart-component tests mock the new path. The `ECharts` runtime type from `'echarts'` has a divergent private-field declaration from `EChartsType` in `echarts/core` — switched `instanceRef` to `EChartsType`.
  - **Baseline (before trim):** dist `1,556,480` bytes raw, gzipped JS `492,176` bytes. Precache `1,474.20 KiB`.
  - **Post-trim:** dist `1,056,768` bytes raw, gzipped JS `324,387` bytes. Precache `974.02 KiB`.
  - **Delta:** `167,789` bytes (~164 KiB, ~34 %) gzipped saved. ~488 KiB raw.
- **Responsive sweep:** user-verified that /w/:address and / render correctly at all tested viewports (desktop breakpoints hold; mobile/tablet breakpoints change but don't break). No inline fixes required; BACKLOG entry for mobile polish kept as a future focused session since we didn't identify specific gaps this time.
- End state: **175 tests passing across 26 files** (was 156 across 23 after Session 4b; +19 this session). Gauntlet clean: typecheck + lint + test + build.

**Decisions made:** none (no new ADRs).

**Deferred / not done:**

- Mobile-optimized layouts — the spot-check confirmed breakpoints change but did not deep-dive on gaps. BACKLOG entry kept as a trigger for a future focused session.
- Persisted TanStack Query `initialData` — two viable approaches (sync Dexie read via `placeholderData` vs `persistQueryClient` + async-storage-persister), deserves an ADR. [BACKLOG]
- Real designed PWA icons — placeholders are adequate for installability. Phase 5 polish.
- Journaling, export/import, Playwright E2E — Session 6+.

**Gotchas for next session:**

- `useWalletMetrics().refresh()` returns the refetch promise; callers that disable a button while fetching should use `metrics.isFetching` (already wired in `WalletHeader`).
- The sr-only table fallback for the PnL calendar consumes `entries` (the already-sorted `PnlCalendarDay[]`) that `PnlCalendarChart` now memoizes separately from the option-object useMemo. If a timezone option lands (BACKLOG), the table picks it up automatically.
- `echarts/core` setup lives at `@lib/charts/echarts-setup`. New chart types in Phase 2 MUST register their chart + required components in that file; missing registrations throw "Component X not exists" at runtime, not at build time.
- `EChartsType` (runtime instance) is exported from `echarts/core`, NOT from the `'echarts'` umbrella. Type-only `EChartsOption` from `'echarts'` is fine — erased at compile time.
- The apple-touch-icon is SVG; older iOS will not render it. Phase 5 replaces with PNG.
- `WalletView.test.tsx` mocks `fetch` at the global level and asserts on the human error copy by text regex. If the copy changes, update the regexes in the same commit — they are the contract.
- `ring-offset-bg-base` is the canonical offset color for `focus-visible:ring`. Any new clickable element that doesn't use the shared Button/Input primitives must include this class string or the focus ring sits awkwardly against the raised bg.
- `TradeHistoryList` now has TWO rowgroups (header + virtualized body). Test code targeting "the" rowgroup must use `getAllByRole('rowgroup')[1]` for the body or index `[0]` for the header.
- The `fg-subtle` HSL bump (50 → 55 %) is live in `src/styles/globals.css`. If a future session reads the original 50 % in an old plan or a stale reference, they may mistakenly "correct" it — the bump is intentional and lint-silent.

**Invariants assumed:**

- `TradeStats.breakEvenCount` counts closed trades with `realizedPnl === 0` exactly. Existing win/loss subset definitions continue to exclude zeros.
- The ∞ render branch requires BOTH `avgWin !== null` AND `avgLoss === null`. The domain still returns `profitFactor: null` for this case; the UI is the sole place where the ambiguity is resolved.
- Chart options remain memoized per ADR-0007 / CONVENTIONS §11. The PnlCalendar change replaced an inline sort with a `useMemo` — still pure, same referential-stability guarantee.
- The ECharts runtime is imported ONLY through `@lib/charts/echarts-setup`. Any direct `import ... from 'echarts'` for runtime values regresses the bundle size.
- No new runtime dependencies this session. SVG icons avoid rasterization toolchains entirely; the `sharp` devDep considered in the plan draft was rejected.

---

## 2026-04-22 — Phase 1 Session 6: Export/Import + Playwright E2E

**Session goal:** Close plan §24 #6 (export and re-import local data). Add /settings route with export (optional cache include) + import (merge-by-upsert). First Playwright E2E covering paste smoke + export/import round-trip.

**Done:**

- Promoted `UserSettings` and `FillsCacheEntry` to `src/entities/` (prerequisite — domain→lib boundary forbids domain code importing types from lib/storage). `@lib/storage/db` re-exports for existing callers.
- `src/entities/export.ts`: `ExportSnapshot`, `ExportFile`, `ExportData`, `BuildExportOptions`, `MergeResult`. formatVersion 1; app-identity "HyperJournal"; data envelope is extensible (journaling slots in without a version bump). Array (not ReadonlyArray) used throughout so the `_schemaCheck` in validation stays assignable.
- `src/lib/validation/export.ts`: `ExportFileSchema` + `parseExport`. Literal-checks on `app` and `formatVersion`; `z.custom<WalletAddress>(...)` preserves the branded type through the inferred shape. One-way `_schemaCheck` (schema fits entity) documented as the right trade-off given exactOptionalPropertyTypes + branded fields. [+9 tests]
- `src/domain/export/buildExport.ts`: pure, deterministic, clock-injected. Omits `fillsCache` key entirely when `includeCache === false`. [+7 tests]
- `src/domain/export/mergeImport.ts`: pure, computes MergeResult + summary. Fixed upsert strategy for v1 (wallets by address with incoming wins, userSettings overwrite on non-null, fillsCache by address when present). [+7 tests]
- `src/lib/storage/export-repo.ts`: `readSnapshot()` reads all three tables in a single Promise.all. [+4 tests]
- `src/lib/storage/import-repo.ts`: `applyMerge()` writes inside a single Dexie transaction across all three tables. Only writes non-empty arrays / non-null singletons so empty merges are no-ops. [+5 tests]
- `src/app/settings/import-errors.ts`: maps SyntaxError / ZodError(app) / ZodError(formatVersion>1) / other ZodError / unknown to human copy. [+5 tests]
- `/settings` route mounted in `src/app/routes.tsx`. `Settings.tsx` shell with a Back link and a Data section landmark. [+3 tests] Nav links: one in WalletHeader (between Refresh and Back); one footer-right on SplitHome. Both use the CONVENTIONS §12 focus-visible class string.
- `ExportPanel.tsx`: `Include cached market data` checkbox (default off) + `Export data` button. Builds the file via `buildExport`, wraps in Blob, triggers `<a download>`, revokes the URL on next tick. Filename `hyperjournal-export-YYYY-MM-DD.json` (UTC). [+4 tests; Blob content coverage lives in buildExport unit tests because jsdom's Blob round-trip is broken]
- `ImportPanel.tsx`: file input → `FileReader` (jsdom-compatible; `File.prototype.text` is unimplemented there) → Zod validate → merge → dry-run summary with "Confirm import" / "Cancel" → commit or idle. Error states render loss-tone heading + "Choose a different file". State machine via discriminated union (idle / staged / committing / done / error). [+6 tests]
- Playwright toolchain: `@playwright/test@1.47.2` devDep + chromium binary; `playwright.config.ts` wires dev-server webServer; `e2e/` dir with `fixtures/hyperliquid-route.ts` helper; `.gitignore` now also excludes `playwright/.cache/`.
- E2E test 1 (`e2e/paste-flow.spec.ts`): paste wallet → /w/:address → all five sections render; Refresh triggers a second HL fetch. [+2 E2E tests]
- E2E test 2 (`e2e/export-import.spec.ts`): seed, export, capture download, fresh browser context, import, confirm, verify wallet reappears on /. [+1 E2E test]
- End state: **223 unit tests across 34 files** (was 173/25 after Session 5; +50 this session), **3 Playwright E2E tests** passing. Unit gauntlet clean; E2E runs via `pnpm test:e2e`.

**Decisions made:** none (no new ADRs).

**Deferred / not done:**

- Selective import (partial per-row/table) — BACKLOG. Fixed-upsert is sufficient for v1.
- Encryption — BACKLOG. Becomes relevant when API keys enter the format (Phase 4).
- Cloud sync — BACKLOG; probably deprecated entirely given local-first premise.
- Migration for formatVersion > 1 — BACKLOG. Design when v2 actually lands.
- CI gate on Playwright — BACKLOG. Manual runs for now.
- Switch webServer to `pnpm preview` if dev-server proves flaky — BACKLOG.
- Journaling — Session 7+.

**Gotchas for next session:**

- `src/entities/user-settings.ts` and `src/entities/fills-cache.ts` are the new canonical locations. `@lib/storage/db` still re-exports for back-compat; new code should import from `@entities/*`.
- `ExportFile.data.fillsCache` is `.optional()` with `| undefined` so the Zod output assigns to the entity under exactOptionalPropertyTypes. `buildExport` still omits the key when `includeCache: false`; nothing explicitly writes `fillsCache: undefined`.
- `mergeImport` with `userSettings: null` is a no-op, not a delete. Phase 3's explicit-delete path (if any) needs a new strategy flag.
- `ImportPanel` reads files via a local `readFileAsText(file)` helper wrapping FileReader. Do not replace with `file.text()` — jsdom doesn't implement it, and the Playwright E2E needs the same code path to work in production browsers.
- `ExportPanel` tests define `URL.createObjectURL`/`revokeObjectURL` via `Object.defineProperty` in a `beforeAll` (jsdom omits them entirely). If a future Session adds more Blob-download UI, factor this into `src/tests/setup.ts` rather than duplicating.
- Blob content round-trip in jsdom is broken (`new Response(blob).text()` returns "[object Blob]"; `blob.text()` is missing). Component tests assert on the Blob instance + MIME type; pure-domain tests cover content.
- Downloaded Blob URLs are revoked on `setTimeout(…, 0)` — short enough to be safe, fast enough to not leak.
- The `_schemaCheck` in `lib/validation/export.ts` is ONE-way (schema fits entity). Mutual-assignability fails because Zod's `.optional()` produces `| undefined` (under exactOptionalPropertyTypes) and `z.array(...)` is mutable. The one-way check still catches "entity field has no schema counterpart" regressions.
- Playwright tests use `http://localhost:5173`. The config's `reuseExistingServer: true` picks up a running `pnpm dev`; CI starts fresh. CI does NOT yet run E2E — adding that is a BACKLOG item.
- `e2e/fixtures/hyperliquid-route.ts` uses `import.meta.url` + `fileURLToPath` to resolve the fixture path; Playwright runs with Node's ESM loader. New E2E tests should import the helper rather than re-implementing.

**Invariants assumed:**

- `formatVersion: 1` is the contract. Additive fields under `data` are allowed without a bump (schema permissive via optional + default); breaking changes MUST bump.
- `app: "HyperJournal"` literal rejects foreign files loudly before the expensive Zod check on `data`.
- Dexie writes on import happen inside ONE transaction across all three tables so partial-write states are impossible.
- `buildExport` and `mergeImport` never mutate their inputs. They are pure per `src/domain/**` conventions.
- The one-way `_schemaCheck` at the bottom of `@lib/validation/export.ts` breaks typecheck if the entity adds a field without the schema learning about it. Changes to `ExportFile` MUST update both in the same commit.

---

## 2026-04-22 — Phase 1 Session 7a: Trade journal foundation

**Session goal:** Ship the first journaling surface. Trade-scoped entries stored locally in Dexie v2, edited on /w/:address/t/:tradeId with autosave-on-blur. Pencil icon marks trades with notes. Export/import extended to carry journal data.

**Done:**

- `src/entities/journal-entry.ts`: `JournalEntry` type + `Mood` enum (calm / confident / anxious / greedy / regretful; null = unset). Tri-state booleans for `planFollowed` and `stopLossUsed` (null = unanswered as a first-class value).
- Dexie schema v2 (additive): new `journalEntries` table keyed by `id`, indexed on `tradeId`, `scope`, `updatedAt`. No data migration needed; the v1 stores declaration stays in place.
- `src/lib/storage/journal-entries-repo.ts`: CRUD + `listAllTradeIds` for the trade-history pencil icon. [+6 integration tests]
- TanStack Query hooks in `src/features/journal/hooks/`:
  - `useTradeJournalEntry(tradeId)` — read/save/remove. Mutations invalidate both `['journal', 'trade', tradeId]` and `['journal', 'trade-ids']` so the history pencil updates immediately. [+4 tests]
  - `useJournalEntryIds()` — returns `Set<tradeId>` for the pencil icon. [+2 tests]
- `TriStateRadio` — reusable 3-option radio group (Yes / No / Unanswered). [+5 tests]
- `TradeJournalForm` — six fields (three textareas + mood select + two TriStateRadio groups). Autosave-on-blur with form-level status machine (clean / dirty / saving / saved / error) and "Saved at HH:MM" chip. `isDraftEmpty` skips writes when the form is entirely default, so users navigating through trades without typing never create dead rows. Two React subtleties handled: draftRef mirrors state so onBlurCommit reads the latest value when change/blur fire in the same tick; the hydration effect guards against overwriting user-typed content when the initial query resolves null. [+6 tests]
- `/w/:address/t/:tradeId` route with `TradeDetail.tsx` page — coin + side + status badges in the header, 8-cell trade summary grid (opened/closed dates, avgEntry/Exit, size, realized PnL, fees, hold time), journal form below. Invalid tradeId / address redirects. [+2 tests]
- `TradeHistoryList` — rows became `<Link>`s (role="row" on <a> is valid ARIA), preserving the existing rowgroup/columnheader/cell chain. Pencil icon renders inline with the coin cell when `tradeIdsWithNotes.has(tradeId)`. `aria-label="Has journal notes"` for screen readers. Boundaries rule (`features/wallets` can't import `features/journal`) resolved by lifting `useJournalEntryIds` up to `WalletView` in `src/app/` and threading the Set through a new `tradeIdsWithNotes` prop. [+1 test on top of existing 5]
- Export/import extension (additive per CONVENTIONS §13):
  - `ExportData.journalEntries?: Array<JournalEntry> | undefined`
  - `MergeResult.summary.journalEntriesImported: number`
  - `ExportSnapshot.journalEntries: Array<JournalEntry>`
  - `buildExport` includes `journalEntries` in both includeCache branches (journals aren't regenerable like fillsCache; they always travel with the export).
  - `mergeImport` passes entries through with upsert-by-id semantics.
  - `createImportRepo.applyMerge` writes inside the existing Dexie transaction — all four tables now atomic.
  - `ImportPanel` summary copy extends with "N journal entries".
  - [+7 unit-test cases across 5 test files]
- Playwright: `e2e/journal-roundtrip.spec.ts` — two tests covering type→blur→reload persistence and pencil-icon-after-save. [+2 E2E tests]
- End state: **256 unit tests across 40 files** (was 223/34 after Session 6; +33 this session), **5 E2E tests** passing. Gauntlet clean.

**Decisions made:** none (no new ADRs).

**Deferred / not done:**

- Session/day journal scope — Session 7b.
- Strategy/setup journal scope + tags — Session 7c.
- Screenshots/images — Session 7d (own brief: IndexedDB blob storage, thumbnailing, quota).
- Edit history / versioning of journal entries — BACKLOG.
- Filter trade history by "has notes" / "no notes" — BACKLOG (tied to Phase 2 filter panel).
- Selective import of journal entries — BACKLOG.
- NanoGPT prompt generation from journal entries — Phase 4.
- Per-field save status if form-level proves too coarse — BACKLOG.
- Body-row unit tests (row-is-link, pencil-icon-visible) — @tanstack/react-virtual returns empty virtualItems in jsdom because scroll geometry is zero. Covered by Playwright round-trip instead.

**Gotchas for next session:**

- `JournalEntry.scope` is the discriminator for 7b/7c. When adding 'session' and 'strategy' scopes, update `MoodSchema` / `scope` literal in the Zod schema (currently `z.literal('trade')`; extend to enum) and add scope-aware queries to the repo.
- `TradeHistoryList` rows are now `<Link>` elements. `role="row"` on an anchor is valid ARIA; keep that in mind if the virtualizer gets refactored.
- `features/wallets` cannot import `features/journal` (boundaries rule). Anywhere a wallets-feature component needs journal data, thread it down via a prop from `src/app/*`. `WalletView` is the canonical pattern — it consumes both features and passes the intersection down.
- `useJournalEntryIds` invalidates on every save/remove. Cheap for Phase 1 data volumes (read-all-and-dedupe); revisit if entries hit the thousands.
- `ExportData.journalEntries` is always present in exports (empty array when the wallet has no journals). Only `fillsCache` is gated by the includeCache toggle. Phase 3+ journal scopes will ship in the same array keyed by `scope`.
- `TradeJournalForm` uses `draftRef` to avoid the stale-closure on change→blur in the same tick. Don't "simplify" this away — the test suite depends on it.
- The empty-form-blur check (`isDraftEmpty && !hook.entry`) is load-bearing for "no dead rows." If a new field is added, extend `isDraftEmpty` to match.
- The form's hydration effect only copies entry → draft when the entry is non-null. An initial null result does not overwrite user-typed content. Keep this branch.
- Dexie schema v2 is a hard cutover — browsers that opened v1 upgrade on next open. Downgrade is NOT supported.

**Invariants assumed:**

- One journal entry per trade (scope='trade'). Multi-entry per trade is not supported in Session 7a.
- Entry IDs are UUID v4 generated at first save via `crypto.randomUUID()`. Stable across reloads because the mutation reuses `hook.entry.id` once an entry exists.
- `createdAt` is set once at first save; `updatedAt` advances on every subsequent save. Both are Unix ms.
- `provenance` is always `'observed'` for user-authored entries. Future AI-generated journal content would carry `'inferred'`.
- Dexie upgrade path: v1 → v2 is a one-way bump. No downgrade, no "rollback to v1" story.
- Boundaries rule: `features/wallets` → `features/journal` is FORBIDDEN. `app/*` composing both is the only allowed path.

---

## 2026-04-22 — Phase 1 Session 7b: Session/day journal

**Session goal:** Extend journaling to the session/day scope. One entry per UTC date, wallet-agnostic. New /d/:date route. JournalPanel becomes real.

**Done:**

- `src/entities/journal-entry.ts`: extended to discriminated union. `TradeJournalEntry` (7a shape, unchanged semantics) + `SessionJournalEntry` (scope='session', date YYYY-MM-DD UTC, six trader-level fields: marketConditions / summary / whatToRepeat / whatToAvoid / mindset enum / disciplineScore 1-5). New `Mindset` type.
- Dexie schema v3 (additive): new `date` index on the existing `journalEntries` table. No `.upgrade()` — rows keep their `scope: 'trade'` and match the trade variant cleanly.
- `isValidDateString` + `todayUtcDateString` pure helpers in `src/domain/dates/`. Branded `YYYYMMDD` type narrows at the boundary. [+7 tests]
- Repo extensions: `findByDate`, `listSessionEntries`. `findByTradeId` narrows to `TradeJournalEntry | null`; `listAllTradeIds` filters by scope='trade'. [+5 tests]
- `useSessionJournalEntry(date)` hook — parallel to useTradeJournalEntry, keyed on date. Invalidates both the per-date query and `['journal', 'recent-sessions']`. [+3 tests]
- `useRecentSessionEntries({ limit })` hook — for the JournalPanel listing. [+2 tests]
- `SessionJournalForm` — six fields with autosave-on-blur, draftRef, hydration guard, isDraftEmpty short-circuit, form-level status + "Saved at HH:MM" chip. Inline 6-radio disciplineScore group. [+6 tests]
- `/d/:date` route with `DayDetail.tsx` — header with long-form UTC date + Settings + Back links, SessionJournalForm below. Invalid or impossible dates redirect to /. [+3 tests]
- `JournalPanel` rewrite — "Today's journal" CTA linking to /d/<today-UTC>, list of up to 7 recent session entries (each linking to /d/:date), empty state, injectable `now` for deterministic tests. Replaces the Session 1 stub. [+4 tests]
- Zod `JournalEntrySchema` → `z.discriminatedUnion('scope', [TradeJournalEntrySchema, SessionJournalEntrySchema])`. MindsetSchema enum added. disciplineScore bounded `1..5 | null`. [+3 validation cases]
- Playwright: `e2e/session-journal-roundtrip.spec.ts` — two tests covering type→blur→reload persistence and JournalPanel listing-after-save. [+2 E2E tests]
- End state: **289 unit tests across 47 files** (was 256/40 after Session 7a; +33 this session), **7 E2E tests** passing. Gauntlet clean.

**Decisions made:** none (no new ADRs).

**Deferred / not done:**

- Strategy/setup journal scope + tags — Session 7c.
- Screenshots/images — Session 7d.
- Calendar-cell click → day detail navigation — BACKLOG.
- Cross-wallet PnL summary on DayDetail — BACKLOG (needs "which wallets" design).
- Per-wallet session entries — BACKLOG (additive via `walletAddress?` field).
- Multi-entry per date — BACKLOG.

**Gotchas for next session:**

- `JournalEntry` is a discriminated union. Anywhere code accesses variant-specific fields (tradeId, date, preTradeThesis, mindset, etc.), narrow on `scope` first or use the narrowed return types from the repo (findByTradeId → TradeJournalEntry, findByDate → SessionJournalEntry).
- `listAllTradeIds` uses `where('scope').equals('trade')` — make sure Session 7c's strategy scope doesn't accidentally leak into this set.
- `listSessionEntries` does its own in-memory sort because Dexie's `.where('scope').equals('session').reverse()` plus `.sortBy('updatedAt')` is awkward to compose with the scope filter. Fine for Phase 1 data volumes.
- The `/d/:date` route is wallet-agnostic. Sessions 7c+ adding a strategy scope should either sit under `/s/:strategy` or be hosted within a Strategies page — do not nest it under `/w/:address`.
- `JournalPanel.now` prop is for tests only. Production passes `undefined` and the component uses `Date.now()` at render. Midnight UTC rollover while the tab is open shifts "today" on next render.
- `SessionJournalForm` and `TradeJournalForm` share the autosave-on-blur pattern but don't share implementation. Extracting a shared hook is BACKLOG polish; don't do it until a third scope (strategy) forces the extraction.
- Dexie's `InsertType<JournalEntry, 'id'>` collapses the union's variant fields — inline literal `put({...})` calls inside tests need to be hoisted to a typed variable (e.g., `const entry: TradeJournalEntry = {...}; await db.journalEntries.put(entry)`).
- Dexie v3 is a one-way bump; v2 → v3 upgrades silently on first open.

**Invariants assumed:**

- One session entry per date (scope='session'). Multi-entry is not supported in Session 7b.
- Session entry IDs are UUID v4 from `crypto.randomUUID()`, stable across reloads because the mutation reuses `hook.entry.id`.
- Dates in the entity + schema + routes are UTC-anchored YYYY-MM-DD strings. Local-timezone mode is a separate BACKLOG item.
- `TradeJournalEntry` shape is bit-for-bit identical to 7a's `JournalEntry` shape — pre-existing Dexie rows match without migration.
- The `_schemaCheck` in lib/validation/export.ts still holds one-way: the Zod discriminated union's inferred shape is assignable to the entity union.

---

## 2026-04-22 — Phase 1 Session 7c: Strategy/setup journal

**Session goal:** Ship the third journal scope — strategy/setup entries. Closes the scope-trinity from plan §11.8 (trade + session + strategy).

**Done:**

- `src/entities/journal-entry.ts`: `StrategyJournalEntry` added as the third variant. Seven fields (name, conditions, invalidation, idealRR free-text, examples, recurringMistakes, notes) per plan §11.8 Section C. Wallet-agnostic.
- No Dexie schema bump — v3's scope + updatedAt indexes cover strategy listing. Rows sort in-memory by updatedAt desc.
- Repo extensions: `findStrategyById` (by UUID; scope-gated), `listStrategies(limit?)` (scope-filtered, in-memory sort). Previous `listSessionEntries` + `listAllTradeIds` already scope-gated so strategy rows can't leak. [+5 tests]
- Three hooks in `src/features/journal/hooks/`:
  - `useStrategyEntry(id)` — read/save/remove a single strategy. [+3 tests]
  - `useStrategies(limit?)` — list all strategies. [+2 tests]
  - `useCreateStrategy()` — generates UUID, writes empty-content row with the given name, returns the id for navigation. [+2 tests]
- `StrategyJournalForm` — 7 fields with autosave-on-blur. Same pattern as TradeJournalForm/SessionJournalForm (draftRef, hydration guard, isDraftEmpty, form-level status). [+5 tests]
- `/strategies` route with `Strategies.tsx` list page — header with Back + Settings, inline "+ New strategy" form with empty-name validation, list of existing strategies with name + updated-date + teaser. Empty state. [+5 tests]
- `/s/:id` route with `StrategyDetail.tsx` — header shows live strategy name (falls back to "Untitled"), Settings + Back-to-/strategies links. Unknown id redirects. StrategyJournalForm mounts below. [+3 tests]
- `JournalPanel` extended with a small "Strategies →" link next to the Today CTA. Header flex-wraps to stay tidy on narrow viewports. [+1 test]
- Zod discriminated union grows a third branch: `StrategyJournalEntrySchema`. [+2 validation cases]
- Playwright: `e2e/strategy-journal-roundtrip.spec.ts` — two tests covering create→edit→blur→reload persistence and list-appearance-after-creation. [+2 E2E tests]
- End state: **317** unit tests, **9** E2E tests (was 7; +2), gauntlet clean.

**Decisions made:** none (no new ADRs).

**Deferred / not done:**

- Tags + trade↔strategy linking — Session 7d.
- Screenshots/images — Session 7e.
- Strategy delete, archive, reorder, per-strategy analytics, duplicate-name warnings — BACKLOG.

**Gotchas for next session:**

- `JournalEntry` is now a three-variant union. Every consumer that destructures a variant-specific field must narrow on scope (see narrowing pattern in repo methods + test helpers).
- `useCreateStrategy` returns the new id. Consumers that call it (just Strategies.tsx) must navigate immediately after; otherwise the user sees a stale empty list until they refresh.
- `listStrategies` takes an OPTIONAL `limit` — pass `undefined` to get everything. The default in the query-key changes based on `limit ?? 'all'` to avoid cache-key collisions when callers pass different limits.
- Duplicate names are allowed by design. If users complain, add a soft "Already named X" warning (BACKLOG).
- Strategy heading on `/s/:id` reads the live name via useStrategyEntry. The query invalidates on save, so the heading updates ~instantly after a name rename blur.
- Dexie's `InsertType<Union>` issue stays — inline `put({...})` in tests needs hoisting to `const entry: StrategyJournalEntry = {...}` or equivalent `as` cast.

**Invariants assumed:**

- Strategy entry IDs are UUID v4 from `crypto.randomUUID()`, generated at create time; stable thereafter.
- Strategy entries always exist in Dexie once `useCreateStrategy().create(name)` resolves. StrategyJournalForm's `isDraftEmpty` guard is defense-in-depth.
- `/strategies` list ordering is `updatedAt desc` — recently edited bubbles up. Custom ordering is BACKLOG.
- Blank names are valid data; the UI renders "Untitled" visually but preserves `""` in storage.

---

## 2026-04-23 — Phase 1 Session 7d: Trade ↔ strategy link

**Session goal:** Let the user link a trade journal entry to one of their strategies. First concrete payoff from Session 7c's strategy scope. Split from the original combined "7d — Tags + linking" scope; tags now live in Session 7e, screenshots in 7f.

**Done:**

- `TradeJournalEntry` gains `strategyId: string | null`. No Dexie schema bump — row value only; pre-7d rows load with `undefined` and self-heal on next upsert.
- Zod `TradeJournalEntrySchema` extended with `strategyId: z.string().min(1).nullable().default(null)` for backwards-compat with pre-7d export files. `formatVersion` unchanged at 1. [+3 validation cases]
- `TradeJournalForm` gains an inline native `<select>` picker driven by `useStrategies`. Matches the `mood`-select pattern: `onChange` marks draft dirty, `onBlur` commits. Blank-name strategies render as "Untitled". Zero-strategy state shows a helper line linking to `/strategies`. Orphaned stored ids render as a `"— deleted strategy"` option that vanishes once any real value is chosen. [+5 form tests]
- `TradeDetail` gains an optional `db` prop (matches Strategies/StrategyDetail) and composes `useTradeJournalEntry` + `useStrategies` to resolve the current strategy. When the id resolves to an existing row, a small `"Strategy: <name> →"` chip renders in the header next to the side/status badges, linking to `/s/:id`. Orphaned ids — no chip. [+4 detail tests]
- `TradeDetail.test.tsx` rewritten to use `vi.mock('@features/wallets')` so the chip tests can inject a synthetic `ReconstructedTrade` without going through fetch + reconstruction; the two existing routing tests migrated to the same pattern for consistency.
- Also: `strategyId: null` backfilled in existing trade-entry literal constructions across buildExport / mergeImport / export-repo / import-repo / useJournalEntryIds / useTradeJournalEntry tests. Plan scope missed these; fix landed in the same Task 1+2 commit.
- Playwright: `e2e/trade-strategy-link.spec.ts` — two tests (create→link→persist→navigate; unlink→reload). [+2 E2E tests]
- End state: **329** unit tests, **11** E2E tests, gauntlet clean, domain coverage ≥ 90%.

**Decisions made:** none (no new ADRs).

**Deferred / not done:**

- Tags (cross-cutting on all three variants) — Session 7e.
- Screenshots — Session 7f.
- Reverse-lookup "trades linked to this strategy" on `StrategyDetail` — BACKLOG.
- Per-strategy analytics — BACKLOG; unblocks now that linking exists.
- Strategy deletion + orphan cleanup — BACKLOG; current orphan behaviour is graceful-hide / "— deleted strategy" picker option.

**Gotchas for next session:**

- `TradeJournalEntry.strategyId` is required on the entity but may be `undefined` in pre-7d Dexie rows. Consumers must coerce: `entry.strategyId ?? null`. The form already does this via `entryToDraft`; any new consumer needs the same guard until all existing rows have round-tripped through at least one upsert.
- The Zod `.default(null)` path only fires for missing fields. If an import file carries `strategyId: undefined` explicitly, Zod treats that as `null` via the default — matching intent.
- `TradeDetail` now depends on `useStrategies`. The call is unconditional; on pages without strategies, it returns an empty array (cheap). No conditional hook calls; React's rules-of-hooks stay happy.
- The `"— deleted strategy"` option is rendered conditionally inside the picker. If the conditional render order ever changes (e.g., the orphan check moves below the `entries.map`), `<select>.value` could briefly point at an option that doesn't yet exist during the render pass — keep the orphan option rendered before the mapped strategies.
- **Playwright `Locator.blur()` is unreliable for React onBlur** — `<select>.blur()` dispatches a native blur event, but React's synthetic event delegation doesn't always catch it. The E2E uses `picker.press('Tab')` to move focus naturally. Session 7e's tag-input blur-commits will hit the same issue — use Tab there too.
- Plan missed 6 peripheral test files that construct `TradeJournalEntry` literals. Adding the new field required `strategyId: null` everywhere. Future sessions that add a new required field to an existing journal variant: `grep -l "scope: 'trade'" src/` before estimating task count.

**Invariants assumed:**

- `strategyId` values are UUIDs produced by `useCreateStrategy` (`crypto.randomUUID()`). The schema doesn't validate UUID format; the `.min(1)` guard is enough.
- At most one strategy per trade in Phase 1. Widening to `strategyIds: string[]` later is additive.
- Strategy names may be blank; UI renders `"Untitled"` but storage preserves `""` — same convention as `/strategies` and `/s/:id`.

---

## 2026-04-24 — Phase 1 Session 7e: Tags

**Session goal:** Add free-form tags to every journal variant. Build a reusable chip-input primitive; display tag chips on existing read surfaces. Split from the original combined "7d — Tags + linking" BACKLOG entry (7d shipped linking).

**Done:**

- `tags: ReadonlyArray<string>` added to `TradeJournalEntry`, `SessionJournalEntry`, `StrategyJournalEntry`. No Dexie schema bump — row value only; pre-7e rows coerce via `entry.tags ?? []` and self-heal on next upsert.
- `@lib/tags/normalizeTag` — pure `normalizeTag` + `normalizeTagList` helpers (lowercase, trim, whitespace-collapse, 40-char cap, dedupe). [+7 tests]
- Zod `.default([])` on all three variant schemas; `formatVersion` unchanged. Pre-7e export files parse cleanly. [+3 validation cases]
- `TagInput` primitive (`@lib/ui/components/tag-input`) — accessible combobox-style chip input with keyboard autocomplete. Enter/comma commits; Backspace-in-empty removes last; X on chip removes; Arrow-key nav; Escape clears; blur commits pending then calls parent onBlur in order. [+7 tests]
- `useAllTags` hook — pooled across all three variants, dedupes + sorts. Invalidated by all three save hooks. [+2 tests]
- `useJournalTagsByTradeId` hook — `ReadonlyMap<tradeId, tags>` for trade-scope rows; threads across the wallets→journal feature boundary without import cycles. [+2 tests]
- All three form components wired: TagInput below domain-specific fields (above tri-state radios in Trade; below whatToAvoid in Session; bottom of form in Strategy). `isDraftEmpty` extended; `commit` re-normalizes via `normalizeTagList`. [+2 tests per form = 6 total]
- `TagChipList` read-only primitive (`@lib/ui/components/tag-chip-list`) — max N chips + "+N more" overflow. Originally placed in features/journal per the spec, relocated to lib/ui during implementation because TradeHistoryList couldn't import from a sibling feature per the boundaries rule. [+3 tests]
- Three read surfaces integrated:
  - `TradeHistoryList`: new "Tags" grid column (far right), max=2 due to virtualized fixed-row-height constraint; threaded via `tradeTagsByTradeId` prop from `WalletView`. +1 smoke test (virtualized body rows don't render in jsdom; E2E covers on-screen chip rendering).
  - `/strategies` list rows: max=3 chips below the teaser. +1 test.
  - `JournalPanel` session rows: max=3 chips below the teaser. +1 test.
- Playwright: `e2e/tags-roundtrip.spec.ts` — trade round-trip + cross-variant autocomplete. [+2 E2E]
- End state: **360** unit tests, **13** E2E tests, gauntlet + build green, domain coverage ≥ 90%.

**Decisions made:** none (no new ADRs). One architecture deviation from the spec (TagChipList location) noted inline above.

**Deferred / not done:**

- **Tag filter** on list surfaces — not in 7e; BACKLOG. Adds multi-tag AND vs OR semantics, filter-control placement, composition with existing filters.
- **Tag management UI** (rename / merge / archive) — BACKLOG.
- **Multi-entry `*tags` Dexie index** — not in 7e; needed when tag-filtering at scale lands.
- **Tag-usage counts in autocomplete** — BACKLOG polish.
- **Paste-comma-separated bulk entry** — BACKLOG small item.
- **Screenshots** — Session 7f.

**Gotchas for next session:**

- `normalizeTag` is in `@lib/tags/`, NOT `@domain/tags/` (spec had the latter). Moved during implementation because `lib/` can't import from `domain/` per CLAUDE.md §3 rule 7. Tag normalization is pure string manipulation — fits `lib/` semantically.
- `TagChipList` is in `@lib/ui/components/tag-chip-list`, NOT `@features/journal/components/`. Relocated mid-implementation so `features/wallets` (TradeHistoryList) could import it directly without a feature-boundary violation.
- `TagInput` suggestions dropdown uses `onMouseDown` to commit (mousedown fires before blur). If anything ever adds click-outside handling, be careful to exclude the listbox from the "outside" detection.
- `useJournalTagsByTradeId` invalidation is wired ONLY on trade-journal save/remove. Session + strategy saves don't invalidate it (they don't affect the trade map). If a future refactor changes scope membership post-save, revisit.
- Pre-7e rows in storage lack `tags` entirely. `entry.tags ?? []` handles read-time; next save writes `[]` explicitly. Export files written before 7e default via Zod.
- `TradeHistoryList` grid now has 7 columns (`GRID_COLUMNS` constant). Any future column adds need to update the same constant + the header row's `<div role="columnheader">` list.
- Virtualized list body rows don't render in jsdom (react-virtual needs real scroll geometry). Component tests for TradeHistoryList stay smoke-only; E2E covers chip rendering.
- The `Strategies.test.tsx` assertion for the strategy name uses `getByText('Breakout')` (exact, case-sensitive) because the test fixture carries a `breakout` tag — the old case-insensitive regex matched both the name and the chip.

**Invariants assumed:**

- Tag strings in storage are ALWAYS normalized (lowercased, trimmed, whitespace-collapsed). Inbound import doesn't re-normalize — but the first form save re-normalizes via `normalizeTagList`. Lossy-forward: hand-edited imports are treated kindly.
- Tag dedup is case-insensitive via normalization; storage never carries both "Breakout" and "breakout" as distinct tags.
- Empty `tags: []` is always the fallback — never null, never undefined in the final TypeScript type (even if Dexie storage has undefined from pre-7e rows).

---

## 2026-04-25 — Phase 1 Session 7f: Screenshots / images

**Session goal:** Ship image attachments on every journal variant — file-picker upload, Cmd/Ctrl+V paste, click-to-open, delete, cascade-on-entry-remove, and lossless round-trip through export/import. Storage in a separate Dexie table; no compression.

**Done:**

- Pure helpers in `src/lib/images/`: `validateImageBlob` (5 MB cap + four-MIME whitelist), `dataUrlToBlob` (sync), `blobToDataUrl` (async via `FileReader`), `decodeImageDimensions` (`createImageBitmap` with `Image()` fallback). [+19 unit tests across 4 files]
- Entities: `JournalImage` (Dexie row, `blob: Blob`) and `JournalImageExported` (wire format, `dataUrl: string`) — two shapes per ADR-0008. `imageIds: ReadonlyArray<string>` added to all three `JournalEntry` variants. Pre-7f Dexie rows coerce on read via `entry.imageIds ?? []`; rows self-heal on next upsert.
- Zod: `imageIds: z.array(z.string()).default([])` on every variant; `images: z.array(JournalImageExportedSchema).default([])` on the export envelope. `formatVersion` unchanged at `1` per ADR-0008.
- Dexie schema v4: new `images` table keyed by `id`, indexed on `createdAt`. Additive — no `.upgrade()` callback because no existing row needs transforming.
- `JournalImagesRepo` (`createJournalImagesRepo`): create / getById / remove / removeMany. `journalEntriesRepo.remove` cascade-deletes referenced image rows in the same transaction. [+repo tests]
- Export pipeline (storage layer): `export-repo` encodes blobs to data URLs via `blobToDataUrl` before handing the snapshot to `buildExport`; `import-repo` decodes data URLs back to blobs via `dataUrlToBlob` inside the existing atomic transaction. Domain (`buildExport` / `mergeImport`) stays pure-synchronous — it sees only the exported wire shape. ImportPanel dry-run summary now shows the image count.
- Hooks (`@features/journal/hooks/`):
  - `useJournalImage(imageId)` — resolves an id to a blob URL, manages `URL.createObjectURL` / `URL.revokeObjectURL` lifecycle on mount/unmount and on underlying-blob change.
  - `useTradeJournalEntry` / `useSessionJournalEntry` / `useStrategyEntry` each gain `addImage(file, buildEntry)` and `removeImage(imageId, buildEntry)` returning the `AddImageResult` discriminated union (`'too-big' | 'wrong-mime' | 'decode' | 'cap' | 'storage'`). `addImage` is serialized via a `pendingRef` promise chain so concurrent paste-multiple-images doesn't race on the `imageIds` baseline.
  - `useImagePasteHandler(ref, onPaste)` — attaches a `paste` listener to a section ref; consumes only image-typed `clipboardData.items` and falls through for text-only paste so textareas keep working.
- UI primitives: `ImageUploadButton` (`<label>` wrapping a hidden `<input type="file">` with `aria-label="Add image"` and `accept` whitelist), `ImageGallery` (thumbnail tiles using `useJournalImage`, click-to-open via `<a target="_blank" rel="noopener noreferrer">`, X button per tile, missing-image placeholder when the underlying row vanishes), `ImageBanner` (`role="alert"` mapping `BannerReason → human copy`).
- All three forms wired (Trade / Session / Strategy): `ImageUploadButton` + `ImageGallery` + `ImageBanner` mounted, `useImagePasteHandler(sectionRef, handleAddImage)` attached, `onDragOver`/`onDrop` `preventDefault` on the form root to suppress browser drop-navigation. [+6 form tests]
- **Race fix that wasn't in the plan:** `commit` (fired by blur), `handleAddImage` (fired by file-pick / paste), and `handleRemoveImage` were all reading `hook.entry?.id` from the TanStack-Query cache. If the cache hadn't refetched after a recent write, two concurrent paths could both mint fresh UUIDs and create duplicate rows (one with the old `imageIds`, one with the new). All three handlers now `await readLatest()` (a Dexie query) to grab the canonical id / createdAt / imageIds before building the next entry. The flaky tests caught this before it shipped; the race window is small in real browsers (the OS file picker imposes a milliseconds-to-seconds gap between blur and file-pick) but non-zero on slow systems.
- E2E: `e2e/images-roundtrip.spec.ts` — four tests. (1) file-picker upload + reload + thumbnail persists; (2) upload + delete via X + reload + gone; (3) HEIC rejected with the wrong-mime banner; (4) export → fresh-context import + wallet re-paste + thumbnail persists. [+4 E2E tests]
- Test infrastructure: factored the jsdom `Blob` / `URL.createObjectURL` polyfills into `src/tests/setup.ts` so every component test gets them.
- ADR-0008 added to `docs/DECISIONS.md` documenting the four-part architectural bundle (two entity shapes, separate Dexie table, store-as-uploaded, base64-in-JSON without `formatVersion` bump).
- End state: **428 unit tests across 68 files** (was 360/53 after Session 7e; +68 this session), **17 E2E tests** (was 13; +4). `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build` all green.

**Decisions made:** ADR-0008 — "Separate `images` Dexie table for journal blob storage." Bundles four interrelated choices into one ADR per the brainstorming spec.

**Deferred / not done:**

- Inline lightbox / fullscreen modal — BACKLOG (`[next]`).
- Drag-and-drop upload affordance — BACKLOG.
- Image reorder UI — BACKLOG.
- Auto-compression / lossless WebP re-encoding for users hitting quota — BACKLOG.
- Per-image annotation / caption — BACKLOG.
- ZIP-bundle export format with `JSZip` for multi-GB exports — BACKLOG.
- Boot-time orphan-image sweep — BACKLOG.
- `navigator.storage.estimate()` quota UI in Settings — BACKLOG.
- Thumbnail chips on virtualized list surfaces (TradeHistoryList, JournalPanel sessions, /strategies rows) — BACKLOG.
- Saved-image preview in the ImportPanel dry-run table — BACKLOG.
- Quota-pressure copy when fillsCache writes start failing — BACKLOG (`[soon]`).
- Synthesized clipboard-paste E2E coverage — replaced by upload+delete-roundtrip; paste integration is unit-tested in `useImagePasteHandler.test.tsx` because Playwright's synthetic `ClipboardEvent` strips `clipboardData` for security in some Chromium builds.

**Gotchas for next session:**

- The plan's hand-coded `TINY_PNG_BYTES` array (67 bytes) was malformed — the IDAT chunk was missing 3 bytes of compressed data, so `decodeImageDimensions` rejected it. Replaced with a generated 70-byte 1×1 RGBA PNG. The HEIC test masked this initially because validation rejects on MIME *before* decoding. **If you ever embed binary fixtures inline in TypeScript, generate them with code (e.g., a `node -e` zlib + CRC32 round-trip) — don't hand-write bytes.**
- `addImage(file, buildEntry: (newImageId) => Entry)` is a mouthful but the `buildEntry` callback is required: it lets the hook serialize concurrent calls (paste-multiple-images) without each caller racing on the `imageIds` baseline. Don't "simplify" the signature to take an entry object — the single source of truth for the next id is inside the `pendingRef`-chained closure.
- `commit` / `handleAddImage` / `handleRemoveImage` all `await readLatest()` (a Dexie query) before building the next entry. This protects against the cache-stale race documented above. The ID, `createdAt`, and `imageIds` baseline must come from `readLatest()`, not from `hook.entry`.
- `entry.imageIds ?? []` coercion is required everywhere a pre-7f Dexie row is read (entry hook hydration, gallery render, form draft init). Pre-7f rows have `imageIds === undefined`; rows self-heal on next upsert.
- Cascade-delete is in `journalEntriesRepo.remove` only. Direct `db.journalEntries.delete(id)` calls (none today) would orphan image rows. If a future code path needs raw delete, mirror the cascade.
- jsdom does not implement `createImageBitmap`; tests that decode dimensions either mock the function or rely on the `Image()` fallback in `decodeImageDimensions`. Component tests get `Blob` / `URL.createObjectURL` polyfills from `src/tests/setup.ts`.
- Dexie v3 → v4 is a one-way bump; v3 → v4 upgrades silently on first open.
- The four-MIME whitelist (PNG / JPEG / WebP / GIF) is canonical. HEIC / AVIF / SVG / BMP are rejected with the `wrong-mime` banner. Adding a MIME means updating `ALLOWED_MIMES` in `validateImageBlob.ts` AND the `JournalImageMime` literal union AND the `accept` attribute on `ImageUploadButton`.
- The `aria-label="Add image"` on the file `<input>` is the canonical E2E selector. If a future redesign changes the affordance, keep that label intact or rewrite the spec.

**Invariants assumed:**

- Every blob in `db.images` has been validated by `validateImageBlob` (MIME whitelist + size cap) before insertion. No code path bypasses validation.
- Cascade delete via `journalEntriesRepo.remove` is the only path that removes images by entry. Manual single-image deletes go through `hook.removeImage`.
- `buildExport` and `mergeImport` never see a `Blob`. Encoding (Blob → dataUrl) lives in `export-repo`; decoding (dataUrl → Blob) lives in `import-repo`. Domain stays pure-synchronous.
- Pre-7f export files parse cleanly via `.optional()` / `.default([])` on the new fields. `formatVersion` stays `1`.
- Orphan rows in `db.images` (uploaded blob, journal entry never saved due to tab-close) are tolerated. A boot-time sweep is BACKLOG.
- IndexedDB quota is shared with `fillsCache`. Quota-pressure UX is BACKLOG.

---

## 2026-04-29 — Phase 2 Session 8a: Filter panel (5 dimensions)

**Session goal:** Open Phase 2 with the filter panel from plan §11.5. Five dimensions on `/w/:address` (date range with presets + custom, coin, side, status, outcome), URL search params as the source of truth, drawer + chip strip UI, uniform pre-filter across all four data surfaces.

**Done:**

- `src/entities/filter-state.ts`: `FilterState` type + `DateRange` discriminated union (`preset` / `custom`) + `DEFAULT_FILTER_STATE` constant. Lives in entities/ so both `lib/validation` and `domain/filters` can depend on it without violating the lib → domain boundary rule.
- `src/domain/filters/`: pure helpers — `isDefault`, `countActive`, `setCoin / setSide / setStatus / setOutcome / setDateRangePreset / setCustomDateRange`. Re-exports types from entities/. [+8 tests]
- `src/domain/filters/resolveDateRange.ts`: preset → ms boundaries with injected `now`; custom range UTC midnight from / end-of-day-exclusive to. [+7 tests]
- `src/domain/filters/applyFilters.ts`: main function + 5 exported predicates (`matchesDate / matchesCoin / matchesSide / matchesStatus / matchesOutcome`) composed as logical AND. Identity-returns the input on default state (short-circuit). Domain coverage 100% on `src/domain/filters/**`. [+10 tests]
- `src/lib/validation/filterState.ts`: `parseFilterStateFromSearchParams` + `serializeFilterStateToSearchParams`. Round-trip identity for representative samples. Garbage params silently default per-dimension; custom range wins over preset when both valid; default state produces zero params. Inlined a `DATE_RE` regex (avoids reaching into `@domain/dates`). [+22 tests]
- ADR-0009 added — first Radix primitive (`@radix-ui/react-dialog`) + the project's `Sheet` primitive at `src/lib/ui/components/sheet.tsx`. Right-side and bottom variants, semantic Tailwind tokens, `aria-describedby={undefined}` to silence Radix's optional-description warning. [+3 tests]
- `src/lib/ui/components/filter-chip.tsx`: clickable chip with X button + `aria-label`. New primitive — different from `tag-chip-list` which is read-only. [+3 tests]
- `src/features/wallets/components/FiltersDrawer.tsx`: 5 stacked control sections (preset row + custom date inputs, native `<select>` for coin, three radio-group segmented controls). Live-apply: every interaction calls `onChange(nextState)`. Inline `Section` / `PresetButton` / `SegmentedControl` subcomponents. [+6 tests]
- `src/features/wallets/components/ActiveFilterChips.tsx`: renders one `FilterChip` per non-default dimension above the metrics grid. Each chip's X resets that dimension; a top-level "Clear all" link resets to defaults. Renders `null` when state is default. [+5 tests]
- `WalletHeader.tsx`: two new required props (`onOpenFilters`, `filterCount`); count badge appears when `filterCount > 0`; aria-label communicates the active count. [+3 tests on top of existing 4]
- `TradeHistoryList.tsx`: two new optional props (`hasActiveFilters`, `onClearFilters`); empty-state copy switches from "No trades yet" to "No trades match these filters" with a Clear-all action when filters are active. [+1 test]
- `WalletView.tsx`: wires URL ↔ FilterState ↔ `applyFilters` ↔ four data surfaces. `availableCoins` from unfiltered trades. `filteredStats` recomputed from filtered subset (skipped when default to preserve reference identity for `WalletMetricsGrid`). `setSearchParams(replace: true)` so chip-X-click doesn't pollute browser history.
- E2E: `e2e/filters-roundtrip.spec.ts` — apply-and-share-via-URL, empty-result-with-clear-all, custom-date reload-persistence. [+3 E2E tests]
- End state: **496 unit tests across 76 files** (was 428 / 68 after Session 7f; +68 this session), **20 E2E tests** (was 17; +3). `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build` all green.

**Decisions made:** ADR-0009 — first Radix primitive (`@radix-ui/react-dialog`) + Sheet wrapper.

**Deferred / not done:**

- Session 8b — the other 7 dimensions from plan §11.5: hold-duration, leverage, time-of-day, day-of-week, tagged strategy, stop-loss usage, size range. Composes additively on `applyFilters` and `FilterState`.
- Calendar-cell click → `from=/to=` filter — BACKLOG (already flagged; unblocked now).
- Multi-coin select — BACKLOG (`coin: string[]` widening).
- Saved filter presets in Dexie — BACKLOG.
- Filter presets shareable via short ID — BACKLOG.
- Push-mode `setSearchParams` so back-button = filter undo — BACKLOG.
- Filter analytics ("you most often filter to X; want to make that default?") — BACKLOG.
- Custom date picker primitive (replacing `<input type="date">`) — BACKLOG (Phase 5 polish).
- Empty-result UX on equity curve / calendar (filter-aware copy) — BACKLOG.
- WalletView component-level tests for the URL ↔ filter pipeline — covered by the E2E spec; jsdom can't exercise the route + virtualizer + ECharts together.

**Gotchas for next session:**

- The plan originally placed `FilterState` in `@domain/filters/filterState`. The boundaries rule forbids `lib → domain`, so `lib/validation/filterState` couldn't import it from there. The fix relocated the types to `src/entities/filter-state.ts` per CONVENTIONS §7 + ADR-0006; `@domain/filters/filterState` now re-exports them for backward compat with feature/component callers. **When adding new types that need to be visible in `lib/validation/`, they must live in `entities/` from the start.**
- `lib/validation/filterState.ts` inlines a `DATE_RE` regex rather than importing `isValidDateString` from `@domain/dates` (lib → domain forbidden). The two date validators must stay in sync; if `isValidDateString` ever changes its strictness, mirror the change in `lib/validation/filterState.ts`.
- TypeScript can't narrow a discriminated union through a separate `isCustom` boolean variable — `state.dateRange.kind === 'custom'` must be inline at each access site for the narrowing to work. `FiltersDrawer.tsx` uses `dr.kind === 'custom' ? dr.from : ''` directly.
- `setSearchParams(next, { replace: true })` is the live-apply default. If we ever switch to push-mode (back-button = filter undo), the WalletView call site is the only place that changes.
- `availableCoins` is derived from `metrics.trades` (the unfiltered set), not `filteredTrades`. Otherwise narrowing to BTC removes ETH from the dropdown and the user can't widen back. The `useMemo` deps reflect this.
- `filteredStats` short-circuits to `metrics.stats` when state is default, preserving the same `stats` reference across renders. Important for `WalletMetricsGrid` not to re-render needlessly. If a future change adds a stats-affecting dimension that *isn't* a trade-array filter, this short-circuit needs revisiting.
- Radix Dialog emits a runtime warning if `Description` is missing; suppressed via `aria-describedby={undefined}` on `Dialog.Content`. Future Sheet consumers can opt back into a description by passing the prop.
- The `Sheet` primitive renders its content in a portal. Tests that mount a `FiltersDrawer` need to be aware that `screen.queryByText` searches the whole document, not just the test render root.
- `PresetButton` / `SegmentedControl` are inline subcomponents in `FiltersDrawer.tsx`. If a third drawer wants segmented controls, extract to `@lib/ui/components/`.

**Invariants assumed:**

- URL is the source of truth for filter state. `WalletView` never reads filter state from anywhere else; the `useMemo` chain rebuilds on every `searchParams` change.
- `applyFilters(trades, DEFAULT_FILTER_STATE)` returns the input array by reference (identity equality). Callers may rely on this for memoization.
- Garbage URL params self-heal via per-dimension Zod `safeParse` fallback to the default for that dimension. No throw, no error UI.
- `FilterState` is immutable — every setter returns a new object. Direct mutation is forbidden (and prevented by `Readonly<>` not being applied; the convention is policed by code review).
- `availableCoins` reflects the wallet's distinct coins from the unfiltered trades. Coin filter narrows trades but NEVER narrows the dropdown options.
- Custom date `to` is end-of-day-exclusive in `applyFilters` — `to=2026-04-28` matches up through `2026-04-28T23:59:59.999Z`.

---

## 2026-05-02 — Phase 2 Session 8b: Filter panel (4 trade-intrinsic dimensions)

**Session goal:** Extend 8a's filter pipeline with the four trade-intrinsic dimensions from plan §11.5: hold-duration bucket, time of day, day of week, and trade-size range. All multi-select. Local timezone for time-of-day and day-of-week; UTC unchanged for date filters.

**Done:**

- `src/entities/filter-state.ts`: 4 new bucket literal types (`HoldDurationBucket` / `TimeOfDayBand` / `DayOfWeek` / `TradeSizeBucket`) + 4 `*_ORDER` constants + extended `FilterState` and `DEFAULT_FILTER_STATE` with `ReadonlyArray` fields.
- `src/domain/filters/buckets.ts` (new): label + numeric-range constants for hold-duration, time-of-day bands, day-of-week labels, trade-size buckets. Range convention `[lo, hi)`; last bucket `+Infinity`. Compile-time guard against type-vs-id drift. [+8 unit tests]
- `src/domain/dates/timezone.ts` (new): `hourInTimeZone` / `weekdayIndexInTimeZone` via `Intl.DateTimeFormat`. Pure; tests pass arbitrary IANA `timeZone` for determinism. [+6 unit tests]
- `src/domain/filters/bucketize.ts` (new): pure id-assignment helpers (`holdDurationBucketOf` / `timeOfDayBandOf` / `dayOfWeekOf` / `tradeSizeBucketOf`). [+17 unit tests]
- `src/domain/filters/applyFilters.ts`: 4 new predicates (`matchesHoldDuration` / `matchesTimeOfDay` / `matchesDayOfWeek` / `matchesTradeSize`); `Options` extended with optional `timeZone`. Open trades use `now - openedAt`; truncated trades (`avgEntryPx === null`) excluded from any active size filter. [+18 unit tests]
- `src/domain/filters/filterState.ts`: 4 toggle setters + 4 per-dimension clear setters; `isDefault` and `countActive` extended for the new arrays. [+13 unit tests]
- `src/lib/validation/filterState.ts`: `parseEnumArrayOr` helper, `sortByCanonical` for serialize, four new param keys (`hold` / `tod` / `dow` / `size`), comma-delimited grammar with canonical-order serialization. URLSearchParams percent-encodes the comma (`%2C`) — round-trip works because `params.get` decodes losslessly. [+22 unit tests]
- `src/lib/ui/components/multi-bucket-control.tsx` (new): toggle-button-row primitive with `aria-pressed`. Used by all four 8b sections. [+5 unit tests]
- `src/features/wallets/components/FiltersDrawer.tsx`: reorganized into three semantic groups (`When` / `What` / `Outcome / shape`) with no collapsing; inline `Group` subcomponent; the four new sections wired via `MultiBucketControl`. [+5 unit tests]
- `src/features/wallets/components/ActiveFilterChips.tsx`: per-dimension chip with inline list when ≤ 3 buckets selected, "N selected" when ≥ 4. Chip X clears the entire dimension. Inline order matches canonical URL order. [+5 unit tests]
- `src/app/WalletView.tsx`: passes `timeZone` to `applyFilters` resolved once via `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- E2E: `e2e/filters-multiselect-roundtrip.spec.ts` — apply + URL-share + fresh-context-navigate test, plus impossible-combo (`size=whale&hold=scalp`) + clear-all test. [+2 E2E]
- End state: **589 unit tests across 80 files** (was 496 / 76 after 8a; +93 this session), **22 E2E tests** (was 20; +2). `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build` all green.

**Decisions made:** none requiring an ADR. Boundary handling for `*_ORDER` constants follows ADR-0006 + the 8a precedent (entities/ owns types crossing the lib/domain split).

**Deferred / not done:**

- Stop-loss usage + tagged strategy/setup — Session 8c (next). Both require joining `TradeJournalEntry` with trades, breaking the pure `applyFilters(trades, state)` signature.
- Leverage bucket — BACKLOG `[later]`, blocked on data-source decision.
- Per-bucket chip removal (`Day: Mon` X removes only Mon) — BACKLOG `[maybe]`.
- Hour-level time-of-day filtering — BACKLOG `[maybe]`.
- Wallet-relative trade-size quartiles — BACKLOG `[maybe]`.
- "All selected = no filter" UX hint — BACKLOG `[maybe]`.
- Bulk-select buttons inside `MultiBucketControl` (e.g., "Weekdays") — BACKLOG `[maybe]`.

**Gotchas for next session:**

- `*_ORDER` constants live in `src/entities/filter-state.ts`, NOT `src/domain/filters/buckets.ts`, because `lib/validation` cannot import from `domain/`. New dimensions in 8c must follow the same split: bucket id literal + ORDER → `entities/`; labels + numeric ranges → `domain/filters/buckets.ts`.
- `applyFilters`'s `Options` now carries `timeZone`. Defaulting via `Intl.DateTimeFormat().resolvedOptions().timeZone` makes most tests pass without explicitly passing it, but **any test that touches time-of-day or day-of-week MUST pass `timeZone: 'UTC'` explicitly** to avoid environment-dependent flake.
- Open-trade hold-duration is computed live (`now - openedAt`). The bucket can drift across boundaries as time passes. Tests pass explicit `now` to assert deterministic bucketing.
- Truncated trades (`avgEntryPx === null`) are excluded from any active size filter and included when default. Mirrors the outcome filter excluding open trades.
- Canonical-order serialization is enforced on URL writes only. URL → state → URL is canonical even if the state was assembled in non-canonical order (reads preserve source order; rewrites canonicalize).
- `URLSearchParams.set('hold', 'a,b')` produces `hold=a%2Cb` in the URL string. The percent-encoding is invisible to `params.get('hold')` (which returns `'a,b'`). E2E URL-regex assertions need `%2C`, not `,`.
- `MultiBucketControl` is generic over the bucket id type. The four call sites in `FiltersDrawer.tsx` parameterize it explicitly via the type of `buckets`. If you reuse the primitive in 8c, mirror this pattern.
- Drawer `Group` subcomponent is inline to `FiltersDrawer.tsx` (mirrors 8a's `Section` / `PresetButton`). If 8c needs grouped UI elsewhere, extract to `lib/ui/`.
- The `ActiveFilterChips` `renderArrayChip` helper is local to that file; if 8c's chips need the same multi-select rendering, move the helper to a shared location or copy the pattern.
- The `vitest.config` / `tsconfig` enables strict-undefined-index. New tests that index into arrays inside loops (`arr[i].field`) need non-null assertions (`arr[i]!.field`). Fixed in `buckets.test.ts` during T7; pattern is established.

**Invariants assumed:**

- URL is the source of truth for filter state.
- `applyFilters(trades, DEFAULT_FILTER_STATE)` returns the input array by reference (identity equality).
- Bucket arrays are canonical-ordered on URL serialize (round-trip identity).
- Bucket boundaries are inclusive-low / exclusive-high; last bucket extends to `+Infinity`.
- Open-trade hold-duration is live-recalculated against `now`; closed-trade uses stored `holdTimeMs`.
- Truncated trades (`avgEntryPx === null`) are excluded from any active size-filter; included when default.
- `availableCoins` reflects the wallet's distinct coins from unfiltered trades (8a invariant preserved).

---
