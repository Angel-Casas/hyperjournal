# Phase 1 Session 5 — Analytics-side polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the gap between "charts render" and "shipped product" on `/w/:address`. Ship break-even counting and profit-factor-∞ polish, a persistent wallet header with a refresh button, human-readable error states, a screen-reader-accessible PnL calendar, placeholder PWA icons that let the app be installed, and an ECharts bundle trim.

**Architecture:** Small mechanical deltas spread across the existing layers. Domain (`computeTradeStats`) gets one new field. UI gets a new `WalletHeader` component and a sibling `PnlCalendarFallbackTable`. `WalletView` takes over error-copy mapping. `EChartsBase` and chart components migrate off `import * as echarts from 'echarts'` onto `echarts/core` + explicit part registration via a new `@lib/charts/echarts-setup` module. No domain-shape changes other than `breakEvenCount`.

**Tech Stack (no new dependencies this session):** All work uses the existing stack — React, Tailwind, ECharts (reshaped imports), vite-plugin-pwa, Vitest, RTL.

---

## File structure (at end of session)

```
HyperJournal/
├── scripts/
│   └── generate-pwa-icons.mjs                         NEW — one-shot SVG→PNG rasterizer
├── public/
│   └── icons/
│       ├── icon-192.svg                               EXISTING (kept; source-of-truth)
│       ├── icon-512.svg                               EXISTING (kept)
│       ├── icon-192.png                               NEW
│       ├── icon-512.png                               NEW
│       ├── maskable-192.png                           NEW
│       └── maskable-512.png                           NEW
├── src/
│   ├── entities/
│   │   └── trade-stats.ts                             MODIFY (+breakEvenCount)
│   ├── domain/
│   │   └── metrics/
│   │       ├── computeTradeStats.ts                   MODIFY (+breakEven accounting)
│   │       └── computeTradeStats.test.ts              MODIFY (+2 cases)
│   ├── lib/
│   │   ├── charts/
│   │   │   ├── echarts-setup.ts                       NEW — tree-shaken registration
│   │   │   └── EChartsBase.tsx                        MODIFY (import path)
│   │   └── ui/
│   │       └── format.ts                              UNCHANGED
│   ├── features/
│   │   └── wallets/
│   │       ├── components/
│   │       │   ├── WalletHeader.tsx                   NEW
│   │       │   ├── WalletHeader.test.tsx              NEW
│   │       │   ├── PnlCalendarFallbackTable.tsx       NEW
│   │       │   ├── PnlCalendarFallbackTable.test.tsx  NEW
│   │       │   ├── PnlCalendarChart.tsx               MODIFY (renders fallback alongside canvas)
│   │       │   ├── WalletMetricsGrid.tsx              MODIFY (break-even subtext; ∞ rendering)
│   │       │   └── SavedWalletsList.tsx               MODIFY (focus-visible)
│   │       ├── hooks/
│   │       │   └── useWalletMetrics.ts                MODIFY (expose refetch + invalidate)
│   │       └── index.ts                               MODIFY (+WalletHeader export)
│   └── app/
│       ├── WalletView.tsx                             MODIFY (uses header, error mapping)
│       └── WalletView.test.tsx                        NEW
├── index.html                                         MODIFY (+apple-touch-icon)
├── vite.config.ts                                     MODIFY (populate manifest.icons)
└── docs/
    ├── SESSION_LOG.md                                 MODIFY (+Session 5 entry)
    ├── BACKLOG.md                                     MODIFY (+4 entries)
    └── CONVENTIONS.md                                 MODIFY (+§11 sub-notes; +§12 if ECharts setup pattern documented)
```

---

## Conventions (for every task)

- Commands run from `/Users/angel/Documents/HyperJournal`.
- Commits end with the trailer `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- TDD for any change under `src/domain/**` (RED → GREEN → COMMIT). Component changes should also lead with the failing test where a behavior is being specified — WalletView error-copy mapping, WalletHeader refresh behavior, PnlCalendarFallbackTable structure, WalletMetricsGrid ∞ rendering.
- After every code task, run `pnpm typecheck && pnpm lint && pnpm test` and confirm green before committing. The full gauntlet (`pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build`) runs at the final task.
- Commit messages use conventional-commit prefixes — `feat(scope):`, `fix(scope):`, `chore(scope):`, `refactor(scope):`, `test:`, `docs:`. One logical change per commit.
- The authorized test wallet address is `0xf318AFb8f0050D140B5D1F58E9537f9eBFE82B14` (from user memory). Manual verification of `/w/:address` uses this address. Never commit it to source code or fixtures — fixtures use the placeholder `0x0000000000000000000000000000000000000001`.

---

## Task 1: Capture baseline bundle size

This task has no code change — just measurement, so Task 12's ECharts trim has a baseline to compare against.

**Files:**
- None.

- [ ] **Step 1.1: Ensure a clean build with the production base path**

Run:
```bash
pnpm build
```

Expected: `pnpm build` completes with no TypeScript or plugin errors. The last lines show the PWA plugin reporting precache files and total size.

- [ ] **Step 1.2: Capture precache and dist sizes**

Run:
```bash
du -sb dist && find dist -name '*.js' -exec gzip -c {} \; | wc -c
```

Record both values (bytes) in a scratch note — they will be referenced in Task 12's commit body and in the SESSION_LOG entry in Task 15.

Suggested scratch location: stash the two numbers at the end of `docs/plans/2026-04-22-phase1-session5-analytics-polish.md` under a new `## Baseline measurements` section at the bottom of the file, or in the commit body of Task 12. Either is fine — the only requirement is that Task 12 can compare.

---

## Task 2: `TradeStats.breakEvenCount` (domain TDD)

Add the count of closed trades whose `realizedPnl === 0`. Surface as subtext on the existing "Closed trades" metric card in Task 5.

**Files:**
- Modify: `src/entities/trade-stats.ts`
- Modify: `src/domain/metrics/computeTradeStats.ts`
- Modify: `src/domain/metrics/computeTradeStats.test.ts`

- [ ] **Step 2.1: Add the failing test (RED)**

Append to `src/domain/metrics/computeTradeStats.test.ts` inside the `describe('computeTradeStats', ...)` block, directly after the `'handles a single-trade array without off-by-one errors'` case:

```ts
it('counts break-even closed trades (realizedPnl === 0) separately from winners and losers', () => {
  const trades = [
    makeTrade({ id: 'a', status: 'closed', realizedPnl: 10 }),
    makeTrade({ id: 'b', status: 'closed', realizedPnl: -5 }),
    makeTrade({ id: 'c', status: 'closed', realizedPnl: 0 }),
    makeTrade({ id: 'd', status: 'closed', realizedPnl: 0 }),
    makeTrade({ id: 'e', status: 'open', realizedPnl: 0 }),
  ];
  const s = computeTradeStats(trades);
  expect(s.breakEvenCount).toBe(2); // closed-and-exactly-zero only
  // Existing definitions must still exclude break-evens:
  expect(s.winRate).toBeCloseTo(1 / 4, 9); // 1 winner of 4 closed
});

it('breakEvenCount is zero when no closed trade has realizedPnl === 0', () => {
  const trades = [
    makeTrade({ id: 'a', status: 'closed', realizedPnl: 10 }),
    makeTrade({ id: 'b', status: 'closed', realizedPnl: -5 }),
  ];
  expect(computeTradeStats(trades).breakEvenCount).toBe(0);
});
```

Also update the existing `'returns the empty-stats shape for no trades'` case — after the line `expect(s.totalFees).toBe(0);`, add:

```ts
    expect(s.breakEvenCount).toBe(0);
```

- [ ] **Step 2.2: Run the test — confirm RED**

Run:
```bash
pnpm test src/domain/metrics/computeTradeStats.test.ts
```

Expected: fails with TypeScript/type error "Property 'breakEvenCount' does not exist on type 'TradeStats'" or (after the type is added) an assertion failure from the existing implementation.

- [ ] **Step 2.3: Add the field to `TradeStats`**

Modify `src/entities/trade-stats.ts`. Insert the new field directly after the existing `openCount` line:

```ts
  readonly breakEvenCount: number;
```

The final shape:

```ts
export type TradeStats = {
  readonly totalPnl: number;
  readonly closedCount: number;
  readonly openCount: number;
  readonly breakEvenCount: number;

  readonly winRate: number | null;
  readonly expectancy: number | null;
  readonly profitFactor: number | null;
  // ...rest unchanged
};
```

- [ ] **Step 2.4: Compute the field in `computeTradeStats`**

Modify `src/domain/metrics/computeTradeStats.ts`. Inside the function, after the existing `const losers = closed.filter((t) => t.realizedPnl < 0);` line, add:

```ts
  const breakEvens = closed.filter((t) => t.realizedPnl === 0);
```

Then in the return object, add `breakEvenCount: breakEvens.length,` directly after `openCount: open.length,`:

```ts
  return {
    totalPnl,
    closedCount: closed.length,
    openCount: open.length,
    breakEvenCount: breakEvens.length,
    // ...rest unchanged
  };
```

- [ ] **Step 2.5: Run tests — confirm GREEN**

Run:
```bash
pnpm test src/domain/metrics/computeTradeStats.test.ts
```

Expected: all 17 cases pass (was 15; +2 new ones).

- [ ] **Step 2.6: Run full typecheck and lint**

Run:
```bash
pnpm typecheck && pnpm lint
```

Expected: both pass. Consumers of `TradeStats` (`WalletMetricsGrid`, `useWalletMetrics`) do not need to reference `breakEvenCount` yet — the field is strictly additive.

- [ ] **Step 2.7: Commit**

```bash
git add src/entities/trade-stats.ts src/domain/metrics/computeTradeStats.ts src/domain/metrics/computeTradeStats.test.ts
git commit -m "$(cat <<'EOF'
feat(metrics): add breakEvenCount to TradeStats

Closed trades with realizedPnl === 0 are already excluded from winners
and losers in win-rate and profit-factor math; this exposes them as a
first-class count so the UI can surface break-evens as context without
misleading the user about the number of wins or losses.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire `breakEvenCount` into the Closed trades card

Subtext-only surfacing; no new card.

**Files:**
- Modify: `src/features/wallets/components/WalletMetricsGrid.tsx`

- [ ] **Step 3.1: Modify the Closed trades `MetricCard`**

In `src/features/wallets/components/WalletMetricsGrid.tsx`, replace the existing Closed trades card:

```tsx
      <MetricCard
        label="Closed trades"
        value={formatCompactCount(stats.closedCount)}
        provenance={stats.provenance}
      />
```

with:

```tsx
      <MetricCard
        label="Closed trades"
        value={formatCompactCount(stats.closedCount)}
        provenance={stats.provenance}
        subtext={
          stats.breakEvenCount > 0
            ? `${stats.breakEvenCount} break-even`
            : undefined
        }
      />
```

- [ ] **Step 3.2: Run typecheck + lint + tests**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all pass. No component test for this because the Closed-trades card already renders via the grid's real-fixture code path; a trivial subtext assertion adds noise without guarding behavior.

- [ ] **Step 3.3: Commit**

```bash
git add src/features/wallets/components/WalletMetricsGrid.tsx
git commit -m "$(cat <<'EOF'
feat(wallets): surface break-even count as Closed-trades subtext

Uses the TradeStats.breakEvenCount field added in the previous commit.
Subtext only; no new card — avoids growing the metrics grid when the
count is genuinely secondary context.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Profit factor ∞ rendering

`computeTradeStats` already returns `profitFactor: null` when there are no losses. That null is ambiguous — it could mean "no closed trades" or "all wins, no losses." The UI disambiguates by inspecting `avgWin` and `avgLoss` (a non-null `avgWin` with a null `avgLoss` means wins exist and losses don't). No domain change needed.

**Files:**
- Modify: `src/features/wallets/components/WalletMetricsGrid.tsx`

- [ ] **Step 4.1: Replace the Profit factor MetricCard's value expression**

In `src/features/wallets/components/WalletMetricsGrid.tsx`, replace the Profit factor card:

```tsx
      <MetricCard
        label="Profit factor"
        value={stats.profitFactor !== null ? stats.profitFactor.toFixed(2) : '—'}
        provenance={stats.provenance}
      />
```

with:

```tsx
      <MetricCard
        label="Profit factor"
        value={
          stats.profitFactor !== null
            ? stats.profitFactor.toFixed(2)
            : stats.avgWin !== null && stats.avgLoss === null
              ? '∞'
              : '—'
        }
        provenance={stats.provenance}
        tone={
          stats.profitFactor !== null || stats.avgWin !== null
            ? stats.avgLoss === null
              ? 'gain'
              : 'neutral'
            : 'neutral'
        }
        subtext={
          stats.profitFactor === null && stats.avgWin !== null && stats.avgLoss === null
            ? 'no losing trades'
            : undefined
        }
      />
```

Reasoning for the tone logic: when `avgLoss === null` and there are wins, the trader has been 100% profitable over the window — coloring the ∞ with the gain tone communicates that. In every other case the tone stays neutral (it was previously always neutral).

- [ ] **Step 4.2: Run typecheck + lint + tests**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all pass.

- [ ] **Step 4.3: Commit**

```bash
git add src/features/wallets/components/WalletMetricsGrid.tsx
git commit -m "$(cat <<'EOF'
feat(wallets): render profit factor as ∞ when there are no losing trades

Previously rendered em-dash in both the no-trades case and the no-losses
case, which erased a real and positive result. Disambiguates by reading
avgWin and avgLoss — the domain is unchanged because the null stays the
correct signal for "undefined for this input."

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `WalletHeader` component with refresh button

Extracts the header region from `WalletView` into its own component so Session 6+ can grow it (wallet switcher, share button) without `WalletView` exploding. Owns the wallet chip and the refresh icon button.

**Files:**
- Create: `src/features/wallets/components/WalletHeader.tsx`
- Create: `src/features/wallets/components/WalletHeader.test.tsx`
- Modify: `src/features/wallets/index.ts` (export)
- Modify: `src/features/wallets/hooks/useWalletMetrics.ts` (expose refetch + invalidate)

- [ ] **Step 5.1: Expose `refetch` and `invalidateAndRefetch` from `useWalletMetrics`**

Modify `src/features/wallets/hooks/useWalletMetrics.ts`. Full rewritten file:

```ts
import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUserFills } from './useUserFills';
import { reconstructTrades } from '@domain/reconstruction/reconstructTrades';
import { computeTradeStats } from '@domain/metrics/computeTradeStats';
import { createFillsCacheRepo } from '@lib/storage/fills-cache-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { ReconstructedTrade } from '@entities/trade';
import type { TradeStats } from '@entities/trade-stats';
import type { WalletAddress } from '@entities/wallet';

type Options = { db?: HyperJournalDb };

export type UseWalletMetricsResult = {
  stats: TradeStats | null;
  trades: ReadonlyArray<ReconstructedTrade>;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  /**
   * Discard the Dexie cache entry for this wallet and trigger a fresh
   * fetch. Returns the same promise as `refetch()` so callers can await
   * completion (e.g. to disable a button until the refresh finishes).
   */
  refresh: () => Promise<unknown>;
};

/**
 * Composes useUserFills → reconstructTrades → computeTradeStats. Memoized
 * so the pure-domain pipeline runs exactly once per fetch. `refresh()`
 * invalidates both the Dexie cache and the TanStack Query entry so the
 * next queryFn call fetches live.
 */
export function useWalletMetrics(
  address: WalletAddress,
  options: Options = {},
): UseWalletMetricsResult {
  const db = options.db ?? defaultDb;
  const fills = useUserFills(address, options);
  const queryClient = useQueryClient();

  const result = useMemo<{
    stats: TradeStats | null;
    trades: ReadonlyArray<ReconstructedTrade>;
  }>(() => {
    if (!fills.data) return { stats: null, trades: [] };
    const trades = reconstructTrades(fills.data);
    return { stats: computeTradeStats(trades), trades };
  }, [fills.data]);

  const refresh = useCallback(async () => {
    const cache = createFillsCacheRepo(db);
    await cache.invalidate(address);
    await queryClient.invalidateQueries({ queryKey: ['fills', address] });
    return fills.refetch();
  }, [address, db, fills, queryClient]);

  return {
    stats: result.stats,
    trades: result.trades,
    isLoading: fills.isLoading,
    isFetching: fills.isFetching,
    isError: fills.isError,
    error: fills.error,
    refresh,
  };
}
```

- [ ] **Step 5.2: Update `useWalletMetrics.test.tsx` to assert the refresh behavior**

Append the following case to `src/features/wallets/hooks/useWalletMetrics.test.tsx` inside the `describe('useWalletMetrics', ...)` block (directly after the existing `'propagates error from the underlying fetch'` case):

```tsx
  it('refresh() invalidates the Dexie cache and triggers a refetch', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(fillsFixture, { status: 200 }),
    );
    const { result } = renderHook(() => useWalletMetrics(addr, { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.stats).not.toBeNull();

    // Initial fetch made exactly one network call (Dexie was empty).
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Refresh triggers a second fetch despite the cache entry being fresh.
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(fillsFixture, { status: 200 }),
    );
    await result.current.refresh();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });
```

Note: the wrapper for this file already wires a fresh `QueryClient` with `retry: false`, so the refresh-triggered refetch is deterministic. `result.current.refresh()` is async; awaiting it inside the test is sufficient because `renderHook` wraps updates in `act`.

- [ ] **Step 5.3: Write the `WalletHeader` failing test (RED)**

Create `src/features/wallets/components/WalletHeader.test.tsx`:

```tsx
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WalletHeader } from './WalletHeader';

afterEach(() => cleanup());

describe('WalletHeader', () => {
  it('renders the wallet address in a monospace chip', () => {
    render(
      <MemoryRouter>
        <WalletHeader
          address={'0x0000000000000000000000000000000000000001' as never}
          isFetching={false}
          onRefresh={() => {}}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByText('0x0000000000000000000000000000000000000001'),
    ).toBeInTheDocument();
  });

  it('renders a Back link to /', () => {
    render(
      <MemoryRouter>
        <WalletHeader
          address={'0x0000000000000000000000000000000000000001' as never}
          isFetching={false}
          onRefresh={() => {}}
        />
      </MemoryRouter>,
    );
    const back = screen.getByRole('link', { name: /back/i });
    expect(back).toHaveAttribute('href', '/');
  });

  it('fires onRefresh when the refresh button is clicked', () => {
    const onRefresh = vi.fn();
    render(
      <MemoryRouter>
        <WalletHeader
          address={'0x0000000000000000000000000000000000000001' as never}
          isFetching={false}
          onRefresh={onRefresh}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('disables the refresh button while isFetching=true', () => {
    render(
      <MemoryRouter>
        <WalletHeader
          address={'0x0000000000000000000000000000000000000001' as never}
          isFetching
          onRefresh={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled();
  });
});
```

- [ ] **Step 5.4: Run the test — confirm RED**

```bash
pnpm test src/features/wallets/components/WalletHeader.test.tsx
```

Expected: fails with "Cannot find module './WalletHeader'".

- [ ] **Step 5.5: Implement `WalletHeader`**

Create `src/features/wallets/components/WalletHeader.tsx`:

```tsx
import { Link } from 'react-router-dom';
import type { WalletAddress } from '@entities/wallet';
import { Button } from '@lib/ui/components/button';
import { cn } from '@lib/ui/utils';

type Props = {
  address: WalletAddress;
  isFetching: boolean;
  onRefresh: () => void;
};

export function WalletHeader({ address, isFetching, onRefresh }: Props) {
  return (
    <header className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-fg-base">Wallet</h1>
        <p className="truncate font-mono text-xs text-fg-muted">{address}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isFetching}
          aria-label="Refresh wallet data"
        >
          <RefreshIcon className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          Refresh
        </Button>
        <Link
          to="/"
          className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          ← Back
        </Link>
      </div>
    </header>
  );
}

function RefreshIcon({ className }: { className?: string | undefined }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <polyline points="21 4 21 10 15 10" />
    </svg>
  );
}
```

- [ ] **Step 5.6: Add to feature public surface**

In `src/features/wallets/index.ts`, add (keep alphabetical-within-category if that's the existing order; otherwise append):

```ts
export { WalletHeader } from './components/WalletHeader';
```

- [ ] **Step 5.7: Run the test — confirm GREEN**

```bash
pnpm test src/features/wallets/components/WalletHeader.test.tsx
pnpm test src/features/wallets/hooks/useWalletMetrics.test.tsx
```

Expected: all pass.

- [ ] **Step 5.8: Run typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: green. If typecheck complains about `useWalletMetrics` consumers expecting the old return shape, fix those consumers (at this point, just `WalletView.tsx` — its handling is replaced in Task 7 anyway; a minimal destructure change here is fine).

- [ ] **Step 5.9: Commit**

```bash
git add src/features/wallets/components/WalletHeader.tsx \
        src/features/wallets/components/WalletHeader.test.tsx \
        src/features/wallets/index.ts \
        src/features/wallets/hooks/useWalletMetrics.ts \
        src/features/wallets/hooks/useWalletMetrics.test.tsx
git commit -m "$(cat <<'EOF'
feat(wallets): add WalletHeader with refresh button

Factors the /w/:address header out of WalletView so Session 6+ can grow
it (wallet switcher, share button) without WalletView ballooning. The
refresh button calls useWalletMetrics().refresh(), which invalidates
both the Dexie cache entry and the TanStack Query entry before
refetching — bypassing the 5-minute TTL so the user can pull fresh
fills on demand.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Error copy mapping in `WalletView`

Translate raw `Error.message` (currently surfacing `ZodError` JSON or `HyperliquidApiError` status strings) into human copy. Each error path gets a "Try again" button wired to `metrics.refresh()`.

**Files:**
- Modify: `src/app/WalletView.tsx`
- Create: `src/app/WalletView.test.tsx`

- [ ] **Step 6.1: Write the failing test (RED)**

Create `src/app/WalletView.test.tsx`:

```tsx
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ZodError } from 'zod';
import { HyperliquidApiError } from '@lib/api/hyperliquid';
import { HyperJournalDb } from '@lib/storage/db';
import { WalletView } from './WalletView';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderWalletView(address: string) {
  const db = new HyperJournalDb(`wallet-view-test-${Math.random()}`);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Stub useWalletMetrics at the module boundary by injecting via options —
  // WalletView consumes the default db singleton today, so for this test we
  // rely on the actual hook with a mocked fetch. Keep tests black-box:
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/w/${address}`]}>
        <Routes>
          <Route path="/w/:address" element={<WalletView />} />
          <Route path="/" element={<div data-testid="home">home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('WalletView error copy', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows 4xx copy for HyperliquidApiError with status 404', async () => {
    const fetchMock = vi.mocked(globalThis.fetch) as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '',
    } as unknown as Response);
    renderWalletView('0x0000000000000000000000000000000000000001');
    await waitFor(() => {
      expect(
        screen.getByText(/no hyperliquid history/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('shows 5xx/network copy for HyperliquidApiError with status 503', async () => {
    const fetchMock = vi.mocked(globalThis.fetch) as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '',
    } as unknown as Response);
    renderWalletView('0x0000000000000000000000000000000000000001');
    await waitFor(() => {
      expect(
        screen.getByText(/couldn.t reach hyperliquid/i),
      ).toBeInTheDocument();
    });
  });

  it('shows ZodError copy when the response fails validation', async () => {
    const fetchMock = vi.mocked(globalThis.fetch) as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ unexpected: 'shape' }),
    } as unknown as Response);
    renderWalletView('0x0000000000000000000000000000000000000001');
    await waitFor(() => {
      expect(
        screen.getByText(/doesn.t yet understand/i),
      ).toBeInTheDocument();
    });
  });

  it('shows generic copy for unknown errors', async () => {
    const fetchMock = vi.mocked(globalThis.fetch) as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValue(new Error('boom'));
    renderWalletView('0x0000000000000000000000000000000000000001');
    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });

  it('Try again button triggers a refetch', async () => {
    const fetchMock = vi.mocked(globalThis.fetch) as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '',
    } as unknown as Response);
    renderWalletView('0x0000000000000000000000000000000000000001');
    const tryAgain = await screen.findByRole('button', { name: /try again/i });
    fetchMock.mockClear();
    fireEvent.click(tryAgain);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });
});

// Suppress unused-import warning for types that are needed for the prose
// but do not appear in assertions.
void ZodError;
void HyperliquidApiError;
```

- [ ] **Step 6.2: Run — confirm RED**

```bash
pnpm test src/app/WalletView.test.tsx
```

Expected: fails because `WalletView` still renders raw `metrics.error?.message` and the new copy strings are not present.

- [ ] **Step 6.3: Rewrite `WalletView`**

Full new content of `src/app/WalletView.tsx`:

```tsx
import { useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { ZodError } from 'zod';
import { HyperliquidApiError } from '@lib/api/hyperliquid';
import { isValidWalletAddress } from '@domain/wallets/isValidWalletAddress';
import {
  EquityCurveChart,
  PnlCalendarChart,
  TradeHistoryList,
  useSavedWallets,
  useWalletMetrics,
  WalletHeader,
  WalletMetricsGrid,
} from '@features/wallets';
import { Button } from '@lib/ui/components/button';
import type { WalletAddress } from '@entities/wallet';

type ErrorCopy = {
  heading: string;
  tone: 'loss' | 'risk' | 'neutral';
};

function errorCopyFor(error: Error | null): ErrorCopy {
  if (error instanceof HyperliquidApiError) {
    if (error.status >= 400 && error.status < 500) {
      return {
        heading:
          "That wallet has no Hyperliquid history yet, or Hyperliquid doesn't recognize the address.",
        tone: 'neutral',
      };
    }
    return {
      heading: "Couldn't reach Hyperliquid. Check your connection and try again.",
      tone: 'risk',
    };
  }
  if (error instanceof ZodError) {
    return {
      heading:
        "Hyperliquid returned data HyperJournal doesn't yet understand. Please report this.",
      tone: 'loss',
    };
  }
  if (
    error &&
    (error.message.toLowerCase().includes('fetch') ||
      error.message.toLowerCase().includes('network'))
  ) {
    return {
      heading: "Couldn't reach Hyperliquid. Check your connection and try again.",
      tone: 'risk',
    };
  }
  return { heading: 'Something went wrong. Try refreshing.', tone: 'neutral' };
}

export function WalletView() {
  const { address } = useParams<{ address: string }>();

  if (!address || !isValidWalletAddress(address)) {
    return <Navigate to="/" replace />;
  }

  return <WalletViewInner address={address} />;
}

function WalletViewInner({ address }: { address: WalletAddress }) {
  const metrics = useWalletMetrics(address);
  const { save } = useSavedWallets();

  useEffect(() => {
    save.mutate({ address, label: null, addedAt: Date.now() });
    // Mutation identity changes every render; intentional dep omission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const toneClass = {
    loss: 'text-loss',
    risk: 'text-risk',
    neutral: 'text-fg-base',
  } as const;

  return (
    <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
      <WalletHeader
        address={address}
        isFetching={metrics.isFetching}
        onRefresh={() => {
          void metrics.refresh();
        }}
      />

      {metrics.isLoading && (
        <section className="rounded-lg border border-border bg-bg-raised p-6">
          <p className="text-fg-muted">Loading metrics…</p>
        </section>
      )}

      {metrics.isError && (
        <section
          aria-labelledby="wallet-error-heading"
          className="flex flex-col gap-3 rounded-lg border border-border bg-bg-raised p-6"
        >
          <h2
            id="wallet-error-heading"
            className={`text-base font-medium ${toneClass[errorCopyFor(metrics.error).tone]}`}
          >
            {errorCopyFor(metrics.error).heading}
          </h2>
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void metrics.refresh();
              }}
            >
              Try again
            </Button>
          </div>
        </section>
      )}

      {metrics.stats && (
        <>
          <WalletMetricsGrid stats={metrics.stats} />
          <EquityCurveChart trades={metrics.trades} />
          <PnlCalendarChart trades={metrics.trades} />
          <TradeHistoryList trades={metrics.trades} />
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 6.4: Run — confirm GREEN**

```bash
pnpm test src/app/WalletView.test.tsx
```

Expected: all 5 cases pass.

- [ ] **Step 6.5: Full gauntlet**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green.

- [ ] **Step 6.6: Commit**

```bash
git add src/app/WalletView.tsx src/app/WalletView.test.tsx
git commit -m "$(cat <<'EOF'
feat(app): map error paths on /w/:address to human copy + Try again

Raw Error.message (ZodError JSON, HL status strings) is no longer
surfaced directly. 4xx/5xx/Zod/unknown each get a readable heading
and a Try again button wired to the useWalletMetrics refresh path
from the previous commit. Also introduces the WalletHeader into the
route.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: PnL calendar sr-only fallback table

Today the `<canvas>` from ECharts is `aria-hidden` and nothing replaces it — screen-reader users see no calendar data at all. Add a sibling `<table>` populated from the same `buildPnlCalendar` output with `sr-only` styling so it's acoustically present but visually absent.

**Files:**
- Create: `src/features/wallets/components/PnlCalendarFallbackTable.tsx`
- Create: `src/features/wallets/components/PnlCalendarFallbackTable.test.tsx`
- Modify: `src/features/wallets/components/PnlCalendarChart.tsx`

- [ ] **Step 7.1: Verify `sr-only` utility is available**

Run:
```bash
grep -r 'sr-only' /Users/angel/Documents/HyperJournal/src
```

If no matches in `src`, `sr-only` is Tailwind's built-in class — no config change needed. If a custom variant exists, match that.

- [ ] **Step 7.2: Write the failing test (RED)**

Create `src/features/wallets/components/PnlCalendarFallbackTable.test.tsx`:

```tsx
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PnlCalendarFallbackTable } from './PnlCalendarFallbackTable';
import type { PnlCalendarDay } from '@domain/metrics/buildPnlCalendar';

afterEach(() => cleanup());

const sample: PnlCalendarDay[] = [
  { date: '2026-01-01', pnl: 100.5, tradeCount: 3 },
  { date: '2026-01-02', pnl: -20, tradeCount: 1 },
];

describe('PnlCalendarFallbackTable', () => {
  it('renders a table with a caption describing the data', () => {
    render(<PnlCalendarFallbackTable days={sample} />);
    const table = screen.getByRole('table', { name: /daily profit and loss/i });
    expect(table).toBeInTheDocument();
  });

  it('renders one row per day with date, pnl, and trade count', () => {
    render(<PnlCalendarFallbackTable days={sample} />);
    expect(screen.getByText('2026-01-01')).toBeInTheDocument();
    // PnL formatted with a sign marker so screen readers announce the sign
    expect(screen.getByText('+$100.50')).toBeInTheDocument();
    expect(screen.getByText('-$20.00')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('has column headers Date, PnL, Trades', () => {
    render(<PnlCalendarFallbackTable days={sample} />);
    expect(screen.getByRole('columnheader', { name: /date/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /pnl/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /trades/i })).toBeInTheDocument();
  });

  it('is sr-only (visually hidden)', () => {
    render(<PnlCalendarFallbackTable days={sample} />);
    const table = screen.getByRole('table');
    // Tailwind's sr-only applies a specific set of classes; check the parent
    // (or table) carries it.
    const container = table.closest('[class*="sr-only"]') ?? table;
    expect(container.className).toContain('sr-only');
  });
});
```

- [ ] **Step 7.3: Check the `PnlCalendarDay` export**

Open `src/domain/metrics/buildPnlCalendar.ts`. Confirm whether `PnlCalendarDay` is exported. If not, add:

```ts
export type PnlCalendarDay = {
  readonly date: string; // YYYY-MM-DD (UTC)
  readonly pnl: number;
  readonly tradeCount: number;
};
```

and re-export or inline-export it so it can be imported from `@domain/metrics/buildPnlCalendar`.

- [ ] **Step 7.4: Run the test — confirm RED**

```bash
pnpm test src/features/wallets/components/PnlCalendarFallbackTable.test.tsx
```

Expected: fails with "Cannot find module './PnlCalendarFallbackTable'".

- [ ] **Step 7.5: Implement `PnlCalendarFallbackTable`**

Create `src/features/wallets/components/PnlCalendarFallbackTable.tsx`:

```tsx
import { formatCurrency } from '@lib/ui/format';
import type { PnlCalendarDay } from '@domain/metrics/buildPnlCalendar';

type Props = { days: ReadonlyArray<PnlCalendarDay> };

/**
 * Screen-reader-only fallback for the PnL calendar heatmap. The ECharts
 * canvas is aria-hidden (see EChartsBase), so without this table,
 * assistive tech sees no calendar data at all. Rendered as a sibling of
 * the canvas inside the same <section>; visual users see only the chart.
 */
export function PnlCalendarFallbackTable({ days }: Props) {
  return (
    <div className="sr-only">
      <table aria-label="Daily profit and loss">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">PnL</th>
            <th scope="col">Trades</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{formatCurrency(d.pnl)}</td>
              <td>{d.tradeCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 7.6: Render the fallback inside `PnlCalendarChart`**

Modify `src/features/wallets/components/PnlCalendarChart.tsx`. Add the import at the top:

```ts
import { PnlCalendarFallbackTable } from './PnlCalendarFallbackTable';
```

In the component body, after `const calendar = useMemo(...)`, derive a time-sorted array for the fallback (entries are already sorted inside the `option` useMemo, so extract that to a shared const):

Replace:

```tsx
  const option = useMemo<EChartsOption>(() => {
    if (calendar.size === 0) return {};
    const entries = Array.from(calendar.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
```

with:

```tsx
  const entries = useMemo(
    () =>
      Array.from(calendar.values()).sort((a, b) => a.date.localeCompare(b.date)),
    [calendar],
  );

  const option = useMemo<EChartsOption>(() => {
    if (entries.length === 0) return {};
```

Then in the same useMemo, replace `const firstDate = entries[0]!.date;` etc. (they already reference `entries`, so only the `entries` decl moves — everything else is unchanged structurally, just remove the duplicate sort line). Close the useMemo with its dep as `[entries]` instead of `[calendar]`.

Finally, inside the returned `<section>`, add the fallback after the `<EChartsBase>` element:

```tsx
      <EChartsBase option={option} style={{ height: 180 }} />
      <PnlCalendarFallbackTable days={entries} />
```

- [ ] **Step 7.7: Run — confirm GREEN**

```bash
pnpm test src/features/wallets/components/PnlCalendarFallbackTable.test.tsx
pnpm test src/features/wallets/components/PnlCalendarChart.test.tsx
```

Expected: both pass. If `PnlCalendarChart.test.tsx` previously asserted the option-object shape via `calendar` dep, it should still work; the implementation change is semantics-preserving for ECharts.

- [ ] **Step 7.8: Full gauntlet**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green.

- [ ] **Step 7.9: Commit**

```bash
git add src/features/wallets/components/PnlCalendarFallbackTable.tsx \
        src/features/wallets/components/PnlCalendarFallbackTable.test.tsx \
        src/features/wallets/components/PnlCalendarChart.tsx \
        src/domain/metrics/buildPnlCalendar.ts
git commit -m "$(cat <<'EOF'
feat(a11y): add sr-only table fallback for the PnL calendar

The ECharts canvas is aria-hidden so screen readers previously saw no
calendar data. This adds a sibling <table> with sr-only styling that
carries the same per-day rows (date, PnL, trade count). The table sits
alongside the canvas inside the existing <section aria-labelledby>
region so assistive tech reads it as part of the calendar group.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `focus-visible` rings on the remaining `<Link>` elements + landmark audit

`Button` and `Input` already carry focus-visible rings via their shared class strings. The two `<Link>` elements in `SavedWalletsList` and (after Task 5) `WalletHeader` need them too — the `WalletHeader` link already picked them up in Task 5's implementation; `SavedWalletsList` still needs the update. Section landmarks are already applied on `/w/:address` via the five components; the landing page (`/`) needs a walk-through.

**Files:**
- Modify: `src/features/wallets/components/SavedWalletsList.tsx`
- Modify: `src/app/SplitHome.tsx` (landmarks, if any are missing)

- [ ] **Step 8.1: Add focus-visible ring to `SavedWalletsList`'s Link**

In `src/features/wallets/components/SavedWalletsList.tsx`, replace the existing `<Link>`:

```tsx
          <Link
            to={`/w/${wallet.address}`}
            className="flex items-center justify-between gap-3 rounded border border-border bg-bg-overlay px-3 py-2 font-mono text-xs text-fg-muted hover:text-fg-base"
          >
```

with:

```tsx
          <Link
            to={`/w/${wallet.address}`}
            className="flex items-center justify-between gap-3 rounded border border-border bg-bg-overlay px-3 py-2 font-mono text-xs text-fg-muted ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
```

- [ ] **Step 8.2: Audit `SplitHome` for landmarks**

Read `src/app/SplitHome.tsx`. Verify that the analytics-side and journal-side panels each sit inside a `<section aria-labelledby>` with an `<h2 id>` heading. If any section is missing, add the pattern. If all are present, skip — this step is a read-only audit and the commit only captures genuine changes.

- [ ] **Step 8.3: Run tests (nothing behavioral should change)**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green. No new assertions required — focus-visible is a visual concern verified manually in Task 10.

- [ ] **Step 8.4: Commit**

```bash
git add src/features/wallets/components/SavedWalletsList.tsx src/app/SplitHome.tsx
git commit -m "$(cat <<'EOF'
fix(a11y): add focus-visible ring to saved-wallet links

Button and Input already carried the ring via buttonVariants / the Input
focus classes; the two Link elements on / and /w/:address did not. Also
spot-audited SplitHome's section landmarks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

*(If the SplitHome audit surfaced no changes, omit it from the `git add` and adjust the commit body.)*

---

## Task 9: axe DevTools run + contrast adjustments

Manual run. The goal is to find real findings, fix the easy ones inline, and file anything non-trivial.

**Files:**
- Modify (conditionally): `src/styles/globals.css` (only if contrast check fails)
- Modify (conditionally): any component flagged by axe

- [ ] **Step 9.1: Start the dev server**

Run in a separate terminal:
```bash
pnpm dev
```

Navigate to `http://localhost:5173/` (or whatever port Vite reports).

- [ ] **Step 9.2: Install axe DevTools browser extension**

If not already installed: https://www.deque.com/axe/devtools/ (Chrome/Edge/Firefox). Free tier is sufficient.

- [ ] **Step 9.3: Run axe on the landing page**

Open DevTools → axe tab → "Scan ALL of my page." Note any **serious** or **moderate** issues. Record them.

- [ ] **Step 9.4: Run axe on `/w/:address`**

Paste the authorized test wallet (`0xf318AFb8f0050D140B5D1F58E9537f9eBFE82B14`) on the landing page, click Analyze, wait for charts to load, then run axe on `/w/:address`. Record findings.

- [ ] **Step 9.5: Contrast check — `loss` token against `bg-base`**

Use the axe color-contrast analyzer (included in axe DevTools) or a manual tool (WebAIM contrast checker). Current values:
- `--bg-base: 220 13% 6%` → `#0e1012`
- `--loss: 357 80% 60%` → `#e84555`

Expected ratio for normal-size text: must be ≥ 4.5:1. Expected for large/value text (font-size ≥ 18.66px and bold): must be ≥ 3:1.

If the ratio fails for small-text usage, bump `--loss` lightness:

```diff
-    --loss: 357 80% 60%;
+    --loss: 357 80% 66%;
```

in `src/styles/globals.css`. Re-check. Also verify `--gain: 152 76% 50%` and `--risk: 35 95% 58%` while you are in the file. If any adjustment is made, note it in the Task 15 session log; CHART_TOKENS in `src/lib/charts/tokens.ts` must be kept in sync.

- [ ] **Step 9.6: Fix serious/moderate axe findings inline**

For each finding, either:
- Fix it (missing alt text, missing label, role misuse): edit the relevant component.
- File it as BACKLOG (layout-level issues that would require redesign): add an entry under a new "Session 5 deferrals" section in `docs/BACKLOG.md` in Task 15.

Common fixable findings expected:
- `<img>` without `alt`: add `alt=""` for decorative, `alt="Description"` for content.
- `<button>` without a discernible name: add `aria-label` or visible text.
- Form field without associated label: use existing `Label` from `@lib/ui/components/label`.

- [ ] **Step 9.7: Commit any fixes**

Commit inline fixes separately so the SESSION_LOG can cite specific findings:

```bash
git add <files changed>
git commit -m "$(cat <<'EOF'
fix(a11y): resolve axe findings on / and /w/:address

[One-line summary of the specific findings fixed, e.g.:
- landing page paste button had no discernible name
- chart container lacked role landmark]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If no fixes were needed (axe reports clean), skip the commit. Either outcome is recorded in Task 15's SESSION_LOG entry.

---

## Task 10: Keyboard tab-order sweep

Manual. Verify no focus traps and that the tab order is logical.

**Files:**
- None (unless a fix is needed).

- [ ] **Step 10.1: Landing page**

On `/`, tab through every interactive element with the keyboard only:
- Paste input → Analyze button → saved-wallet links → any other visible controls.

Expected: focus ring visible at every stop; tab order matches visual left-to-right / top-to-bottom order; `Enter` on the Analyze button submits; `Enter` on a saved-wallet link navigates.

- [ ] **Step 10.2: Wallet view**

On `/w/:address` (use the authorized test wallet), tab through:
- Refresh button → Back link → (any other focusable items in the current view).

Expected: focus visible at every stop; Refresh and Back both activate with `Enter`; no element traps focus (tab always moves forward, shift+tab always moves back).

- [ ] **Step 10.3: If any stop fails**

Document the failure and apply the minimal fix (e.g., missing `tabIndex={0}` on a custom interactive div, or a visually hidden element that should have `tabIndex={-1}`). If the fix is non-trivial, file as BACKLOG in Task 15.

- [ ] **Step 10.4: Commit any fixes from Step 10.3**

```bash
git add <files>
git commit -m "fix(a11y): repair tab-order / focus on <component>" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Skip the commit if the sweep was clean.

---

## Task 11: Add maskable icon variants (SVG)

Placeholder icons shipped as SVG — no rasterization toolchain, no new dependencies. The web manifest spec accepts `image/svg+xml` entries, and the existing `icon-192.svg` / `icon-512.svg` are already in place from Session 1. This task adds the two maskable variants so Android can render the app icon with its adaptive mask without clipping the glyph.

(An earlier draft considered rasterizing via `sharp`, but adding a build-script-only dep would require an ADR and produces no extra user value for placeholder-grade assets. Phase 5 polish replaces these with designed PNGs.)

**Files:**
- Create: `public/icons/maskable-192.svg`
- Create: `public/icons/maskable-512.svg`

- [ ] **Step 11.1: Inspect the existing placeholder**

Read `public/icons/icon-192.svg` to confirm the palette and shape match the HyperJournal dark theme (expected: `#0b0d10` background, `hsl(152 76% 50%)` gain-colored chart-line glyph). If the file has drifted from this shape since Session 1, reconcile with the style of that file for the new maskable variants.

- [ ] **Step 11.2: Create `public/icons/maskable-192.svg`**

Maskable icons require the glyph to sit entirely inside a centered circle with 80% of the canvas diameter, because Android platforms clip to various mask shapes (circle, rounded square, squircle). The existing icon-192.svg glyph extends closer to the edges and would be clipped.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" fill="#0b0d10" />
  <!-- Glyph sized to fit within the 80% safe zone (~51x51 centered) -->
  <path
    d="M22 42 L26 34 L30 38 L36 26 L42 42"
    stroke="hsl(152 76% 50%)"
    stroke-width="3"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
```

- [ ] **Step 11.3: Create `public/icons/maskable-512.svg`**

Same content as `maskable-192.svg` (SVG is resolution-independent).

```bash
cp public/icons/maskable-192.svg public/icons/maskable-512.svg
```

- [ ] **Step 11.4: Commit the icon additions**

```bash
git add public/icons/
git commit -m "$(cat <<'EOF'
chore(pwa): add maskable-192.svg and maskable-512.svg placeholder icons

Uses SVG for all four icon entries in the manifest to avoid shipping a
rasterization toolchain this session. Maskable variants place the glyph
inside the 80% safe zone so Android doesn't clip it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Populate manifest.icons + apple-touch-icon + install verification

Wire the SVG icons into the manifest. Add an apple-touch-icon link so iOS Add-to-Home-Screen picks up an icon. Verify install prompt.

**Files:**
- Modify: `vite.config.ts`
- Modify: `index.html`

- [ ] **Step 12.1: Populate `manifest.icons`**

In `vite.config.ts`, replace `icons: [],` with:

```ts
        icons: [
          {
            src: 'icons/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icons/maskable-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
          {
            src: 'icons/maskable-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
```

Note `src` is relative to the manifest root, which is the `base` path from the vite config — vite-plugin-pwa handles the join.

- [ ] **Step 12.2: Also include icon paths in `includeAssets`**

Update `includeAssets` so Workbox includes the icons in the precache:

```ts
      includeAssets: ['favicon.svg', 'icons/*.svg'],
```

- [ ] **Step 12.3: Add apple-touch-icon to `index.html`**

In `index.html`, after the existing `<link rel="icon" ...>` line:

```html
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
```

Note: iOS older versions do not render SVG apple-touch-icons. Acceptable for a placeholder-grade round (Phase 5 polish will replace with PNGs). Session log should note this caveat.

- [ ] **Step 12.4: Build + preview**

```bash
pnpm build && pnpm preview
```

Expected: `dist/manifest.webmanifest` lists the four icon entries; `pnpm preview` starts a local server (default port 4173).

- [ ] **Step 12.5: Manual install verification**

Open http://localhost:4173/ in Chrome. Expected:
- Address bar shows an install icon (a small monitor with a down-arrow), OR a prompt appears automatically.
- Run Lighthouse → PWA audit → "Web app manifest meets the installability requirements" passes.

If the install icon does not appear:
- Open DevTools → Application → Manifest. Check for any validation warnings.
- Common fix: service worker needs to register. Confirm `registerType: 'autoUpdate'` is still in the config and the built service worker file exists at `dist/sw.js`.

Record the Lighthouse PWA summary in Task 15's SESSION_LOG entry.

- [ ] **Step 12.6: Commit**

```bash
git add vite.config.ts index.html
git commit -m "$(cat <<'EOF'
feat(pwa): populate manifest.icons with SVG placeholders + apple-touch-icon

Four icon entries (any + maskable × 192 + 512) so Chrome offers the
install prompt and Android picks up the maskable variant. Also adds an
apple-touch-icon link for iOS Add-to-Home-Screen — SVG will not render
on older iOS but placeholder is intentional; Phase 5 replaces with
designed PNG assets.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: ECharts bundle trim

Replace `import * as echarts from 'echarts'` in `EChartsBase` with tree-shaken imports from `echarts/core` plus explicit part registration. Only the chart types and components actually used by our two charts (LineChart, HeatmapChart, CalendarComponent, TooltipComponent, GridComponent, VisualMapComponent, CanvasRenderer) are registered.

**Files:**
- Create: `src/lib/charts/echarts-setup.ts`
- Modify: `src/lib/charts/EChartsBase.tsx`
- Modify: `src/lib/charts/EChartsBase.test.tsx` (update vi.mock path if needed)

- [ ] **Step 13.1: Create the registration module**

Create `src/lib/charts/echarts-setup.ts`:

```ts
/**
 * Tree-shaken ECharts setup. Importing from `echarts/core` and registering
 * only the chart types and components we actually use saves ~400–600 KB
 * gzipped compared to `import * as echarts from 'echarts'`. Every chart
 * component we render on /w/:address is accounted for:
 *
 *   - LineChart          → equity curve
 *   - HeatmapChart       → PnL calendar
 *   - CalendarComponent  → PnL calendar date grid
 *   - TooltipComponent   → hover tooltips on both
 *   - GridComponent      → equity curve axes
 *   - VisualMapComponent → PnL calendar color scale
 *   - CanvasRenderer     → rendering backend
 *
 * If a new chart type or component is introduced, register it here.
 * Runtime errors of the form "Component [x] not exists" signal a missing
 * registration.
 */
import * as echarts from 'echarts/core';
import { LineChart, HeatmapChart } from 'echarts/charts';
import {
  CalendarComponent,
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  HeatmapChart,
  CalendarComponent,
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export { echarts };
```

- [ ] **Step 13.2: Modify `EChartsBase.tsx` to use the registered namespace**

In `src/lib/charts/EChartsBase.tsx`, replace:

```tsx
import * as echarts from 'echarts';
import type { EChartsOption, ECharts } from 'echarts';
```

with:

```tsx
import { echarts } from '@lib/charts/echarts-setup';
import type { EChartsOption, ECharts } from 'echarts';
```

The type-only import from `echarts` is fine; TypeScript erases it at compile time, so it does not pull the full runtime bundle.

- [ ] **Step 13.3: Update `EChartsBase.test.tsx` mock target and factory shape**

The existing test uses `vi.hoisted()` to share mock fns between the factory and the assertions. Preserve that pattern; only the mock target and factory shape need to change, because `EChartsBase` now imports from `@lib/charts/echarts-setup` (which re-exports the `echarts` namespace) instead of directly from `echarts`.

In `src/lib/charts/EChartsBase.test.tsx`, replace the existing `vi.mock('echarts', ...)` call:

```ts
vi.mock('echarts', () => ({
  init: mocks.init,
}));
```

with:

```ts
vi.mock('@lib/charts/echarts-setup', () => ({
  echarts: {
    init: mocks.init,
  },
}));
```

Every other line in the test file stays the same — `mocks.init`, `mocks.setOption`, etc. are consumed by the same assertions.

- [ ] **Step 13.4: Run the test — confirm GREEN**

```bash
pnpm test src/lib/charts/EChartsBase.test.tsx
```

Expected: 6 cases pass.

- [ ] **Step 13.5: Full gauntlet**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: all green. The build output changes — measure it.

- [ ] **Step 13.6: Measure the delta**

```bash
du -sb dist && find dist -name '*.js' -exec gzip -c {} \; | wc -c
```

Record the new values. Subtract from Task 1's baseline to get the bytes saved. Target: ≥ 400 KB gzipped saved.

If the delta is less than 200 KB gzipped, investigate:
- Any remaining `import * as echarts from 'echarts'` (grep for it) is still pulling the full lib.
- Confirm `echarts-setup.ts` imports from `echarts/core`, `echarts/charts`, etc. (NOT `echarts`).

- [ ] **Step 13.7: Commit**

```bash
git add src/lib/charts/echarts-setup.ts \
        src/lib/charts/EChartsBase.tsx \
        src/lib/charts/EChartsBase.test.tsx
git commit -m "$(cat <<'EOF'
perf(charts): tree-shake ECharts imports via echarts/core + parts

Drops ~N KB gzipped (N = measured delta). Consolidates part registration
into src/lib/charts/echarts-setup.ts so any future chart that needs an
additional ECharts component registers it in one place; a runtime
"Component x not exists" error points straight at this file.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Fill in `N` with the actual gzipped byte-delta from Step 13.6.

---

## Task 14: Responsive viewport sweep + BACKLOG "mobile polish" entry

Manual. No code unless a desktop viewport breaks.

**Files:**
- Modify (conditionally): any component that breaks at 1280/1440/1920.
- Modify (for documentation): this happens in Task 15 via BACKLOG entry.

- [ ] **Step 14.1: Ensure dev server is running**

```bash
pnpm dev
```

- [ ] **Step 14.2: Sweep desktop viewports**

Use Chrome DevTools device-toolbar (toggle with Cmd+Shift+M). Set custom dimensions:

1. **1280×800** (small laptop): load `/` and `/w/0xf318AFb8f0050D140B5D1F58E9537f9eBFE82B14`. Verify nothing wraps weirdly, cards don't clip, charts render in the allotted height.
2. **1440×900** (common laptop): same.
3. **1920×1080** (desktop): same. Expect the metrics grid to go to 4 columns here (Tailwind `lg:grid-cols-4`).

If any breaks, apply the smallest fix possible. Most likely the metrics grid or the header might overflow — `min-w-0` on flex children usually fixes truncation; `flex-wrap` on the header row fixes horizontal overflow.

- [ ] **Step 14.3: Spot-check mobile + tablet (non-regression)**

1. **768×1024** (tablet): load `/w/:address`. Expect the metrics grid to drop to 3 or 2 columns, the calendar to show fewer cells but not break, the equity curve to occupy full width.
2. **375×667** (iPhone SE — worst common case): load `/w/:address`. Expect:
   - Header wallet-address chip truncates with ellipsis (`truncate` is already in the CSS).
   - Metrics grid goes to 2 columns (`grid-cols-2` default).
   - Trade history columns may squeeze uncomfortably — acceptable for non-regression; do NOT attempt to fix here.

Capture specific gaps to record in BACKLOG:
- Trade history columns crowding at ≤ 480px.
- P/L calendar cell size too small to hover/tap at ≤ 480px.
- Any horizontal scroll on the page itself (indicates an overflow bug — fix immediately).
- Any element cut off by the viewport edge (fix immediately).

- [ ] **Step 14.4: Commit any inline fixes applied in Step 14.2 or 14.3**

```bash
git add <files>
git commit -m "$(cat <<'EOF'
fix(responsive): resolve desktop-viewport regressions found in sweep

[Brief list of fixes: e.g., WalletHeader wrapping at 1280px, metrics
grid clipping at 1920px.]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Skip if the sweep was clean.

---

## Task 15: Session close-out — SESSION_LOG, BACKLOG, CONVENTIONS

Final documentation commit. This is mandatory per CLAUDE.md §5.

**Files:**
- Modify: `docs/SESSION_LOG.md`
- Modify: `docs/BACKLOG.md`
- Modify: `docs/CONVENTIONS.md`

- [ ] **Step 15.1: Append the Session 5 SESSION_LOG entry**

Add at the top of `docs/SESSION_LOG.md` (after the `---` header block, before the Session 4b entry):

```markdown
## 2026-04-22 — Phase 1 Session 5: Analytics-side polish

**Session goal:** Close the gap between "charts render" and "shipped product" on /w/:address — responsive non-regression, PWA install, medium-depth a11y, error UX + refresh, and the break-even / profit-factor-∞ / ECharts-trim stragglers. No journaling, no export/import.

**Done:**

- `TradeStats.breakEvenCount` added to the entity + computeTradeStats. Surfaced as subtext on the Closed-trades metric card. [+2 tests]
- Profit factor renders `∞` with the gain tone and subtext "no losing trades" when `avgWin !== null && avgLoss === null`. Domain unchanged — disambiguation lives in the UI. [no tests; purely a render-time branch]
- `WalletHeader` component extracted from WalletView, carries the wallet chip, a Back link, and a new Refresh button. [+4 tests]
- `useWalletMetrics` now exposes `isFetching` and `refresh()` — `refresh()` invalidates both the Dexie cache entry and the TanStack Query entry before refetching. [+1 test]
- Error paths on `/w/:address` map to human copy per error type (HyperliquidApiError 4xx, 5xx/network, ZodError, unknown) with "Try again" buttons. [+5 tests]
- `PnlCalendarFallbackTable` — sr-only `<table>` rendered alongside the aria-hidden ECharts canvas. Screen readers now hear per-day rows instead of nothing. [+4 tests]
- `focus-visible` rings added to the remaining `<Link>` elements (SavedWalletsList, WalletHeader got its own at creation). Button and Input already had them.
- axe DevTools findings: [TODO: fill in findings and fixes from Task 9, or note "clean, no serious or moderate issues"].
- Keyboard tab-order sweep: [TODO: fill in from Task 10].
- Contrast check: [TODO: fill in — either "ratios within WCAG AA on all color-token pairs tested" or the specific HSL adjustments made].
- Placeholder PWA icons shipped as SVG (icon-192.svg, icon-512.svg, maskable-192.svg, maskable-512.svg). Manifest populated with all four. apple-touch-icon link added to index.html.
- PWA install: Chrome install prompt confirmed at http://localhost:4173; Lighthouse PWA installability check passes.
- ECharts bundle trim: `echarts/core` + registered parts via new `@lib/charts/echarts-setup` module. Baseline: [TODO: from Task 1]. Post-trim: [TODO: from Task 13]. Gzipped delta: [TODO].
- Responsive sweep: desktop viewports (1280/1440/1920) clean after [TODO: fixes, or "no fixes needed"]. Mobile/tablet (375/768) gaps captured in BACKLOG for the mobile-polish session.
- End state: [TODO: N tests passing across M files (was 156/X after Session 4b)]. Gauntlet clean.

**Decisions made:** none (no new ADRs).

**Deferred / not done:**

- Real designed PWA icons (Phase 5 polish) — placeholders are acceptable for installability.
- Persisted TanStack Query `initialData` — two viable approaches (sync Dexie read vs `persistQueryClient`), deserves an ADR. [BACKLOG]
- Mobile layout polish — scoped to its own focused session with the gap list captured in BACKLOG.
- Journaling, export/import, Playwright E2E — Session 6+.

**Gotchas for next session:**

- `useWalletMetrics().refresh()` returns the refetch promise; callers that disable a button while fetching should use `metrics.isFetching` (already wired in WalletHeader).
- The sr-only table fallback for the PnL calendar is keyed by the same `buildPnlCalendar` output; if a timezone option lands (BACKLOG), the table picks it up automatically.
- `echarts/core` setup lives at `@lib/charts/echarts-setup`. New chart types that land in Phase 2 MUST register their chart + required components in that file, or ECharts emits "Component X not exists" at runtime.
- The apple-touch-icon is SVG; older iOS will not display it. Intentional for placeholder-grade. Phase 5 replaces with PNG.
- WalletView.test.tsx mocks fetch at the global level and asserts on the human error copy by text regex. If the copy changes, update the regexes in the same commit — they are the contract.

**Invariants assumed:**

- `TradeStats.breakEvenCount` counts closed trades with `realizedPnl === 0` exactly. The existing win/loss subset definitions continue to exclude zeros.
- The ∞ render branch requires BOTH `avgWin !== null` AND `avgLoss === null`. The domain still returns `profitFactor: null` for this case; the UI is the sole place where the ambiguity is resolved.
- Chart options are still memoized per ADR-0007 / CONVENTIONS §11. The PnlCalendar change replaced an inline sort with a `useMemo` — still pure.
- No new runtime dependencies this session. `sharp` was considered and rejected; SVG icons avoid rasterization entirely.
```

Replace each `[TODO: ...]` with the actual values captured during Tasks 1, 9, 10, 12, 13, 14.

- [ ] **Step 15.2: Append BACKLOG entries**

Add the following under a new `## Session 5 deferrals` section in `docs/BACKLOG.md`, placed after the existing `## Session 4b deferrals` section:

```markdown
---

## Session 5 deferrals

- `[soon]` Mobile polish session. Gaps observed during the Session 5 non-regression sweep at 375px: [TODO: fill in from Task 14 — e.g., trade-history columns crowding below 480px; calendar cell size too small to hover/tap below 480px]. Target: mobile-optimized layouts (collapsible side sheet for filters when they land, horizontally-scrollable history or card-layout-below-md, larger hit targets for calendar cells).
- `[soon]` Persisted TanStack Query `initialData` for `useUserFills`. Two viable approaches: (a) synchronous Dexie cache read returning `placeholderData` (no new dep, but Dexie is async, so needs an IndexedDB-direct synchronous shim — not idiomatic); (b) `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister` (~3KB, idiomatic, two new deps → ADR). The "Loading fills…" flash on refresh is minor but real. ADR required before picking.
- `[later]` Real designed PWA icons — replace the SVG placeholders (icon-{192,512}.svg, maskable-{192,512}.svg) with designed iconography. Phase 5 polish pass. Should also add PNG fallbacks for iOS older versions that don't render SVG apple-touch-icon.
- `[maybe]` Color-token contrast audit fallout. If Session 5's Task 9 adjusted any of `--gain`, `--loss`, or `--risk` HSL values: verify the equity-curve shading (`CHART_TOKENS.gainFade0/1`), calendar heatmap interpolation (`CHART_TOKENS.gain`/`loss` endpoints), and MetricCard tones (`text-gain`/`text-loss`) all still read correctly. If no adjustments were made, this item can be removed.
- `[maybe]` Playwright E2E smoke. The /w/:address flow is now stable enough to cover; scoped to Session 6 alongside export/import. Browser-level coverage closes the gap around ECharts render + virtualizer window that jsdom can't verify.
```

Replace the `[TODO]` with the actual gaps from Task 14.3.

- [ ] **Step 15.3: Append CONVENTIONS entry**

Add the following to `docs/CONVENTIONS.md` as a new sub-bullet under `## 11. Charts and data visualization`:

```markdown
- **Tree-shaken ECharts imports.** Production code imports ECharts runtime only through `@lib/charts/echarts-setup`, which re-exports the `echarts` namespace after registering the specific chart types, components, and renderer we use. New charts MUST add their parts to the `echarts.use([...])` call in that file; otherwise ECharts emits "Component X not exists" at runtime. Type-only imports (`import type { EChartsOption } from 'echarts'`) are fine anywhere — TypeScript erases them at compile time.
- **Chart a11y fallback.** Because `EChartsBase` renders a canvas with `aria-hidden`, every chart component MUST provide a screen-reader-visible alternative for the data when the data is semantic (values, dates, labels). The canonical pattern is a sibling `<table class="sr-only">` populated from the same pure-domain helper that feeds the chart option — see `PnlCalendarFallbackTable` next to `PnlCalendarChart`. Purely decorative charts (animated splash screens, mood indicators) can skip the fallback.
```

And add a new section `## 12. Accessibility`:

```markdown
## 12. Accessibility

Rules in CLAUDE.md §3 rule 10 are invariants; this section is patterns.

- **Focus visibility.** All interactive elements (Button, Input, Link, and any custom interactive `div`) carry a `focus-visible` ring. The canonical class string is `ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2`. Shared primitives (Button via `buttonVariants`, Input inline) already include it. New custom clickable elements must add it explicitly.
- **Landmark sections.** Every distinct content region on a route uses `<section aria-labelledby="xxx-heading">` + `<h2 id="xxx-heading">`, even when the heading is visually styled as a subtitle. The five sections on `/w/:address` (metrics grid, equity curve, P/L calendar, trade history, wallet header) all follow this — add the pattern when introducing new regions.
- **Chart a11y** — see §11 "Chart a11y fallback."
- **Error states** carry both a heading (what went wrong) and an action (how to recover). `WalletView`'s error branch is the reference: `<h2>` with the mapped human copy, followed by a "Try again" button wired to the refresh path.
```

- [ ] **Step 15.4: Final full gauntlet**

```bash
pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build
```

Expected: all green. Coverage for `src/domain/**` at or above 90%.

- [ ] **Step 15.5: Commit**

```bash
git add docs/SESSION_LOG.md docs/BACKLOG.md docs/CONVENTIONS.md
git commit -m "$(cat <<'EOF'
docs: record Session 5 session log, backlog, and conventions

Captures the analytics-side-polish session: break-even counting,
profit-factor ∞, WalletHeader + refresh, error UX translation, sr-only
calendar fallback, PWA install with placeholder SVG icons, ECharts
tree-shake. Files four BACKLOG entries (mobile polish, persisted
initialData, designed icons, contrast fallout) and codifies two
convention sub-rules (echarts-setup import path, chart a11y fallback
pattern, general accessibility section).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 15.6: Verify clean git state**

```bash
git status && git log --oneline -20
```

Expected: working tree clean; Session 5 commits land in sequence.

---

## Success criteria (copy from spec §Acceptance)

1. `/w/:address` and `/` render cleanly at 1280, 1440, 1920. No visual regression at 768 / 375.
2. `pnpm build` produces a manifest with four icon entries. `pnpm preview` offers the Chrome desktop install prompt. Lighthouse installability check passes.
3. axe DevTools reports no serious or moderate issues on `/` or `/w/:address`. Keyboard tab order is trap-free. `:focus-visible` rings visible on every interactive element. PnL calendar has a screen-reader-accessible data fallback.
4. Every error path on `/w/:address` shows human copy plus a "Try again" button. A refresh button next to the wallet chip invalidates cache and refetches.
5. `TradeStats.breakEvenCount` is computed and surfaced; profit factor renders `∞` for wins-only wallets.
6. `pnpm build` bundle is measurably smaller than Session 4b baseline (target ≥ 400 KB gzipped saved). Delta recorded in SESSION_LOG.
7. All gauntlet commands green. Coverage on `src/domain/**` ≥ 90%.
8. SESSION_LOG, BACKLOG, CONVENTIONS updated.

---

## Baseline measurements

To be filled in by Task 1 and Task 13:

- **Baseline (Session 4b end):** dist total `1,556,480` bytes, gzipped JS `492,176` bytes. Vite reports main chunk at `1,493.51 kB raw / 487.14 kB gzipped`. Precache total `1,474.20 KiB`.
- **Post-trim (Session 5 end):** dist total `1,056,768` bytes, gzipped JS `324,387` bytes. Precache total `974.02 KiB`.
- **Gzipped JS delta:** `167,789 bytes` saved (~164 KiB, ~34%). Precache raw delta ~500 KiB (~34%). Short of the 400 KB gzipped target quoted in the spec, but a substantive cut.
