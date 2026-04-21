# Phase 1 Session 4a — Analytics Metrics + Metric Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn Session 3's `ReconstructedTrade[]` into the headline `TradeStats` struct (pure function in `domain/metrics/`), wrap it in a `useWalletMetrics` hook, and render a grid of metric cards on `/w/:address` showing real numbers from the user's wallet. No charts yet — those are Session 4b.

**Architecture:** Pure domain function `computeTradeStats(trades)` produces a flat `TradeStats` object with 17 fields covering Tier-1 metrics (PnL, win rate, expectancy, profit factor, drawdown, hold times, long/short split, best/worst). A `useWalletMetrics` hook composes `useUserFills → reconstructTrades → computeTradeStats` via `useMemo`. A `MetricCard` primitive in `@lib/ui/components` renders one metric with a label, formatted value, and provenance indicator. `WalletView` on `/w/:address` stops showing "Loaded N fills" and starts showing a responsive grid of ~10 cards.

**Tech Stack:** No new deps. `date-fns` is already pinned in CLAUDE.md §2 but not yet installed — install in this session for hold-time formatting.

---

## File structure (at end of session)

```
HyperJournal/
├── src/
│   ├── entities/
│   │   └── trade-stats.ts                     (new: TradeStats type)
│   ├── domain/
│   │   └── metrics/
│   │       ├── computeTradeStats.ts           (pure function)
│   │       └── computeTradeStats.test.ts
│   ├── lib/
│   │   └── ui/
│   │       ├── format.ts                      (currency, percent, hold time, compact)
│   │       ├── format.test.ts
│   │       └── components/
│   │           ├── metric-card.tsx            (MetricCard primitive)
│   │           └── metric-card.test.tsx
│   ├── features/
│   │   └── wallets/
│   │       ├── hooks/
│   │       │   ├── useWalletMetrics.ts        (composes useUserFills → reconstruct → stats)
│   │       │   └── useWalletMetrics.test.tsx
│   │       └── components/
│   │           └── WalletMetricsGrid.tsx      (the grid shown on /w/:address)
│   └── app/
│       └── WalletView.tsx                     (rewritten to render the metrics grid)
└── docs/...
```

---

## Conventions

- Commands run from `/Users/angel/Documents/HyperJournal`.
- Every commit ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- Conventional prefixes per CONVENTIONS.md §10.
- **TDD mandatory** for `domain/metrics/*`, formatters, and component tests.
- No I/O in domain; `computeTradeStats` takes only `ReadonlyArray<ReconstructedTrade>` — no clocks, no random.

---

## Task 1: Entity type — `TradeStats`

**Files:**
- Create: `src/entities/trade-stats.ts`

- [ ] **Step 1.1: Write `src/entities/trade-stats.ts`**

```ts
import type { Provenance } from './provenance';

/**
 * Aggregate analytics snapshot for a collection of reconstructed trades.
 * Every field is either a number, a null (when the metric is undefined
 * for the input — e.g., winRate on zero closed trades), or a count.
 *
 * `null` is used deliberately over `0` to distinguish "no data" from
 * "zero result" — a winRate of 0 means the trader lost every closed
 * trade; a winRate of null means no trades are closed yet.
 *
 * All PnL values are USDC (the product currently only supports that
 * quote asset). Hold times are in milliseconds.
 *
 * Provenance is 'derived' because every field is a deterministic
 * aggregation of observed/derived trade data.
 */
export type TradeStats = {
  readonly totalPnl: number;
  readonly closedCount: number;
  readonly openCount: number;

  readonly winRate: number | null;
  readonly expectancy: number | null;
  readonly profitFactor: number | null;

  readonly avgWin: number | null;
  readonly avgLoss: number | null;

  readonly maxDrawdown: number;
  readonly maxDrawdownPct: number | null;

  readonly avgHoldTimeMs: number | null;

  readonly longCount: number;
  readonly shortCount: number;
  readonly longWinRate: number | null;
  readonly shortWinRate: number | null;

  readonly bestTrade: number | null;
  readonly worstTrade: number | null;
  readonly totalFees: number;

  readonly provenance: Provenance;
};
```

- [ ] **Step 1.2: Verify + commit**

```bash
pnpm typecheck
pnpm lint
```

Both exit 0.

```bash
git add src/entities/trade-stats.ts
git commit -m "$(cat <<'EOF'
feat(entities): add TradeStats type for analytics aggregates

TradeStats carries 17 Tier-1 metrics per Phase 1 plan §19.1: PnL,
win rate, expectancy, profit factor, average win/loss, drawdown
(absolute + percent), hold time, long/short split and win rates,
best/worst trade, total fees. Null-vs-zero distinguishes "no data"
from "zero result" so UI can render em-dash for the former and
a real zero for the latter.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `computeTradeStats` pure function (TDD)

**Files:**
- Create: `src/domain/metrics/computeTradeStats.ts`
- Create: `src/domain/metrics/computeTradeStats.test.ts`

### Algorithm

For input `trades: ReadonlyArray<ReconstructedTrade>`:

1. **Split**: `closed = trades.filter(t => t.status === 'closed')`, `open = trades.filter(t => t.status === 'open')`.
2. **PnL accounting** (closed trades only):
   - `totalPnl = Σ closed.realizedPnl`
   - `winners = closed.filter(t => t.realizedPnl > 0)`
   - `losers = closed.filter(t => t.realizedPnl < 0)` (strict <, excludes breakeven)
   - `winRate = winners.length / closed.length` if `closed.length > 0` else `null`
   - `expectancy = totalPnl / closed.length` if closed.length > 0 else null
   - `profitFactor = Σ(winners.pnl) / |Σ(losers.pnl)|` if `losers.length > 0` else (if winners.length > 0 → Infinity treated as null-equivalent, else null)
   - `avgWin = Σ(winners.pnl) / winners.length` if any winners else null
   - `avgLoss = |Σ(losers.pnl) / losers.length|` (positive magnitude) if any losers else null
3. **Drawdown** (running equity curve across closed trades, time-sorted):
   - Sort closed trades by `closedAt` ascending
   - Walk forward accumulating running equity = running sum of realizedPnl
   - Track running peak, compute drawdown from peak at each step
   - `maxDrawdown = max drawdown observed`, `maxDrawdownPct = maxDrawdown / peak_at_that_point` if peak > 0 else null
4. **Hold time** (closed trades):
   - `avgHoldTimeMs = Σ(closed.holdTimeMs) / closed.length` if closed.length > 0 else null
5. **Long/short split**: count closed trades per side, compute win rate per side.
6. **Best/worst**: `Math.max/min` of closed `realizedPnl`; null if no closed trades.
7. **Total fees**: `Σ trades.totalFees` across ALL trades (opens included).

**Provenance is always `'derived'`.**

- [ ] **Step 2.1: Write the failing test (RED)**

Create `src/domain/metrics/computeTradeStats.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FillSchema } from '@lib/validation/hyperliquid';
import { reconstructTrades } from '@domain/reconstruction/reconstructTrades';
import { computeTradeStats } from './computeTradeStats';
import type { RawFill } from '@entities/fill';
import type { ReconstructedTrade } from '@entities/trade';

const fixture = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../tests/fixtures/hyperliquid/user-fills.json'),
    'utf8',
  ),
);
const realFills: RawFill[] = fixture.map((f: unknown) => FillSchema.parse(f));
const realTrades = reconstructTrades(realFills);

const makeTrade = (overrides: Partial<ReconstructedTrade>): ReconstructedTrade => ({
  id: 'BTC-1',
  wallet: null,
  coin: 'BTC',
  side: 'long',
  status: 'closed',
  legs: [],
  openedAt: 0,
  closedAt: 1000,
  holdTimeMs: 1000,
  openedSize: 1,
  closedSize: 1,
  avgEntryPx: 100,
  avgExitPx: 110,
  realizedPnl: 10,
  totalFees: 0.1,
  provenance: 'observed',
  ...overrides,
});

describe('computeTradeStats', () => {
  it('returns the empty-stats shape for no trades', () => {
    const s = computeTradeStats([]);
    expect(s.totalPnl).toBe(0);
    expect(s.closedCount).toBe(0);
    expect(s.openCount).toBe(0);
    expect(s.winRate).toBeNull();
    expect(s.expectancy).toBeNull();
    expect(s.profitFactor).toBeNull();
    expect(s.avgWin).toBeNull();
    expect(s.avgLoss).toBeNull();
    expect(s.maxDrawdown).toBe(0);
    expect(s.maxDrawdownPct).toBeNull();
    expect(s.avgHoldTimeMs).toBeNull();
    expect(s.bestTrade).toBeNull();
    expect(s.worstTrade).toBeNull();
    expect(s.totalFees).toBe(0);
    expect(s.provenance).toBe('derived');
  });

  it('counts open and closed trades separately', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: -5 }),
      makeTrade({ id: 'c', status: 'open', realizedPnl: 0 }),
    ];
    const s = computeTradeStats(trades);
    expect(s.closedCount).toBe(2);
    expect(s.openCount).toBe(1);
  });

  it('totalPnl sums realizedPnl across closed trades only', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 100 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: -30 }),
      makeTrade({ id: 'c', status: 'open', realizedPnl: 999 }), // must be excluded
    ];
    expect(computeTradeStats(trades).totalPnl).toBeCloseTo(70, 9);
  });

  it('win rate is fraction of closed trades with realizedPnl > 0', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: 20 }),
      makeTrade({ id: 'c', status: 'closed', realizedPnl: -5 }),
      makeTrade({ id: 'd', status: 'closed', realizedPnl: 0 }), // breakeven, not a win
    ];
    expect(computeTradeStats(trades).winRate).toBeCloseTo(0.5, 9);
  });

  it('expectancy is average realized PnL per closed trade', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 30 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: -10 }),
    ];
    expect(computeTradeStats(trades).expectancy).toBeCloseTo(10, 9);
  });

  it('profit factor is gross-wins over gross-losses', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 30 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: 70 }),
      makeTrade({ id: 'c', status: 'closed', realizedPnl: -25 }),
    ];
    // 100 / 25 = 4.0
    expect(computeTradeStats(trades).profitFactor).toBeCloseTo(4, 9);
  });

  it('profit factor is null when there are no losses', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: 20 }),
    ];
    expect(computeTradeStats(trades).profitFactor).toBeNull();
  });

  it('avgWin and avgLoss compute only over their respective subsets', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: 30 }),
      makeTrade({ id: 'c', status: 'closed', realizedPnl: -20 }),
    ];
    const s = computeTradeStats(trades);
    expect(s.avgWin).toBeCloseTo(20, 9);
    expect(s.avgLoss).toBeCloseTo(20, 9); // positive magnitude
  });

  it('maxDrawdown is the worst peak-to-trough on the equity curve', () => {
    // Equity curve: +50, +80 (peak), +30 (drawdown 50), +40, +60 (new peak), +45 (drawdown 15)
    // Max drawdown = 50
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 50, closedAt: 1 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: 30, closedAt: 2 }),
      makeTrade({ id: 'c', status: 'closed', realizedPnl: -50, closedAt: 3 }),
      makeTrade({ id: 'd', status: 'closed', realizedPnl: 10, closedAt: 4 }),
      makeTrade({ id: 'e', status: 'closed', realizedPnl: 20, closedAt: 5 }),
      makeTrade({ id: 'f', status: 'closed', realizedPnl: -15, closedAt: 6 }),
    ];
    const s = computeTradeStats(trades);
    expect(s.maxDrawdown).toBeCloseTo(50, 9);
    expect(s.maxDrawdownPct).toBeCloseTo(50 / 80, 9);
  });

  it('maxDrawdown is 0 when the equity curve is monotonically non-decreasing', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 10, closedAt: 1 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: 20, closedAt: 2 }),
    ];
    expect(computeTradeStats(trades).maxDrawdown).toBe(0);
  });

  it('avgHoldTimeMs averages closed trade durations', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', holdTimeMs: 1000 }),
      makeTrade({ id: 'b', status: 'closed', holdTimeMs: 3000 }),
      makeTrade({ id: 'c', status: 'open', holdTimeMs: 9999 }), // excluded
    ];
    expect(computeTradeStats(trades).avgHoldTimeMs).toBeCloseTo(2000, 9);
  });

  it('long/short split counts and win rates are per-side', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', side: 'long', realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'closed', side: 'long', realizedPnl: -5 }),
      makeTrade({ id: 'c', status: 'closed', side: 'short', realizedPnl: 20 }),
      makeTrade({ id: 'd', status: 'closed', side: 'short', realizedPnl: 30 }),
    ];
    const s = computeTradeStats(trades);
    expect(s.longCount).toBe(2);
    expect(s.shortCount).toBe(2);
    expect(s.longWinRate).toBeCloseTo(0.5, 9);
    expect(s.shortWinRate).toBeCloseTo(1, 9);
  });

  it('best and worst reflect max/min realizedPnl', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: 200 }),
      makeTrade({ id: 'c', status: 'closed', realizedPnl: -50 }),
    ];
    const s = computeTradeStats(trades);
    expect(s.bestTrade).toBe(200);
    expect(s.worstTrade).toBe(-50);
  });

  it('total fees sums across ALL trades (opens included)', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', totalFees: 1.5 }),
      makeTrade({ id: 'b', status: 'open', totalFees: 2.5 }),
    ];
    expect(computeTradeStats(trades).totalFees).toBeCloseTo(4, 9);
  });

  it('on the real fixture, totalPnl matches the sum of reconstructed realizedPnl', () => {
    const s = computeTradeStats(realTrades);
    const reconSum = realTrades
      .filter((t) => t.status === 'closed')
      .reduce((acc, t) => acc + t.realizedPnl, 0);
    expect(s.totalPnl).toBeCloseTo(reconSum, 6);
  });
});
```

Run:
```bash
pnpm test src/domain/metrics/
```
Expected: RED.

- [ ] **Step 2.2: Write the impl (GREEN)**

Create `src/domain/metrics/computeTradeStats.ts`:

```ts
import type { ReconstructedTrade } from '@entities/trade';
import type { TradeStats } from '@entities/trade-stats';

/**
 * Compute the Tier-1 analytics snapshot from a list of reconstructed trades.
 * Pure; no clocks, no random. Null-vs-zero semantics distinguish "no data"
 * (null) from "zero result" (0) — consumers decide how to render each case.
 */
export function computeTradeStats(
  trades: ReadonlyArray<ReconstructedTrade>,
): TradeStats {
  const closed = trades.filter((t) => t.status === 'closed');
  const open = trades.filter((t) => t.status === 'open');

  const totalPnl = closed.reduce((acc, t) => acc + t.realizedPnl, 0);

  const winners = closed.filter((t) => t.realizedPnl > 0);
  const losers = closed.filter((t) => t.realizedPnl < 0);

  const grossWins = winners.reduce((acc, t) => acc + t.realizedPnl, 0);
  const grossLosses = losers.reduce((acc, t) => acc + t.realizedPnl, 0); // negative

  const winRate = closed.length > 0 ? winners.length / closed.length : null;
  const expectancy = closed.length > 0 ? totalPnl / closed.length : null;
  const profitFactor = losers.length > 0 ? grossWins / Math.abs(grossLosses) : null;
  const avgWin = winners.length > 0 ? grossWins / winners.length : null;
  const avgLoss = losers.length > 0 ? Math.abs(grossLosses) / losers.length : null;

  const avgHoldTimeMs =
    closed.length > 0
      ? closed.reduce((acc, t) => acc + t.holdTimeMs, 0) / closed.length
      : null;

  // Drawdown: walk time-sorted closed trades, track peak, measure
  // peak-to-trough at each step.
  const timeSorted = [...closed].sort((a, b) => a.closedAt - b.closedAt);
  let runningEquity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let drawdownPeak = 0;
  for (const t of timeSorted) {
    runningEquity += t.realizedPnl;
    if (runningEquity > peak) peak = runningEquity;
    const dd = peak - runningEquity;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      drawdownPeak = peak;
    }
  }
  const maxDrawdownPct =
    maxDrawdown > 0 && drawdownPeak > 0 ? maxDrawdown / drawdownPeak : null;

  const longs = closed.filter((t) => t.side === 'long');
  const shorts = closed.filter((t) => t.side === 'short');
  const longWinRate =
    longs.length > 0
      ? longs.filter((t) => t.realizedPnl > 0).length / longs.length
      : null;
  const shortWinRate =
    shorts.length > 0
      ? shorts.filter((t) => t.realizedPnl > 0).length / shorts.length
      : null;

  const bestTrade =
    closed.length > 0 ? Math.max(...closed.map((t) => t.realizedPnl)) : null;
  const worstTrade =
    closed.length > 0 ? Math.min(...closed.map((t) => t.realizedPnl)) : null;

  const totalFees = trades.reduce((acc, t) => acc + t.totalFees, 0);

  return {
    totalPnl,
    closedCount: closed.length,
    openCount: open.length,
    winRate,
    expectancy,
    profitFactor,
    avgWin,
    avgLoss,
    maxDrawdown,
    maxDrawdownPct,
    avgHoldTimeMs,
    longCount: longs.length,
    shortCount: shorts.length,
    longWinRate,
    shortWinRate,
    bestTrade,
    worstTrade,
    totalFees,
    provenance: 'derived',
  };
}
```

- [ ] **Step 2.3: Run tests + gauntlet + commit**

All 14 tests pass. Full gauntlet clean.

```bash
git add src/domain/metrics/
git commit -m "$(cat <<'EOF'
feat(domain): add computeTradeStats pure aggregator

Pure function: ReadonlyArray<ReconstructedTrade> → TradeStats. Computes
17 Tier-1 metrics from plan §19.1 — PnL, closed/open counts, win rate,
expectancy, profit factor, avg win/loss, max drawdown (abs + percent),
avg hold time, long/short split + per-side win rates, best/worst
trade, total fees.

Null is used for "no data" (e.g., winRate on zero closed trades); zero
means an actual zero result (e.g., winRate of 0.0 = lost every trade).
UI renders each case distinctly.

14 tests covering each metric plus a real-fixture cross-check that
totalPnl matches the sum from reconstructTrades (which itself matches
HL's closedPnl exactly per Session 3's oracle).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `useWalletMetrics` hook

**Files:**
- Create: `src/features/wallets/hooks/useWalletMetrics.ts`
- Create: `src/features/wallets/hooks/useWalletMetrics.test.tsx`

- [ ] **Step 3.1: Write the failing test (RED)**

Create `src/features/wallets/hooks/useWalletMetrics.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactNode } from 'react';

import { useWalletMetrics } from './useWalletMetrics';
import { HyperJournalDb } from '@lib/storage/db';
import type { WalletAddress } from '@entities/wallet';

const fixturesDir = resolve(__dirname, '../../../../tests/fixtures/hyperliquid');
const fillsFixture = readFileSync(resolve(fixturesDir, 'user-fills.json'), 'utf8');

const addr = '0x0000000000000000000000000000000000000001' as WalletAddress;

let db: HyperJournalDb;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  db = new HyperJournalDb(`hj-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(async () => {
  db.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useWalletMetrics', () => {
  it('returns null stats while fills are loading', () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response(fillsFixture, { status: 200 }));
    const { result } = renderHook(() => useWalletMetrics(addr, { db }), { wrapper });
    // First render: fills still loading
    expect(result.current.stats).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('returns computed stats after fills load', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response(fillsFixture, { status: 200 }));
    const { result } = renderHook(() => useWalletMetrics(addr, { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.stats).not.toBeNull();
    expect(result.current.stats!.closedCount).toBeGreaterThan(0);
  });

  it('propagates error from the underlying fetch', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response('{}', { status: 500 }));
    const { result } = renderHook(() => useWalletMetrics(addr, { db }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeTruthy();
  });
});
```

Run → RED.

- [ ] **Step 3.2: Write the hook (GREEN)**

Create `src/features/wallets/hooks/useWalletMetrics.ts`:

```ts
import { useMemo } from 'react';
import { useUserFills } from './useUserFills';
import { reconstructTrades } from '@domain/reconstruction/reconstructTrades';
import { computeTradeStats } from '@domain/metrics/computeTradeStats';
import type { HyperJournalDb } from '@lib/storage/db';
import type { TradeStats } from '@entities/trade-stats';
import type { WalletAddress } from '@entities/wallet';

type Options = { db?: HyperJournalDb };

export type UseWalletMetricsResult = {
  stats: TradeStats | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
};

/**
 * Composes useUserFills → reconstructTrades → computeTradeStats. Memoized
 * so the pure-domain pipeline runs exactly once per fetch, not per render.
 * stats is null until fills load; error path propagates from the fetch.
 */
export function useWalletMetrics(
  address: WalletAddress,
  options: Options = {},
): UseWalletMetricsResult {
  const fills = useUserFills(address, options);

  const stats = useMemo(() => {
    if (!fills.data) return null;
    const trades = reconstructTrades(fills.data);
    return computeTradeStats(trades);
  }, [fills.data]);

  return {
    stats,
    isLoading: fills.isLoading,
    isError: fills.isError,
    error: fills.error,
  };
}
```

- [ ] **Step 3.3: Run + gauntlet + commit**

```bash
git add src/features/wallets/hooks/useWalletMetrics.ts src/features/wallets/hooks/useWalletMetrics.test.tsx
git commit -m "$(cat <<'EOF'
feat(wallets): add useWalletMetrics hook composing fills → trades → stats

useWalletMetrics wraps useUserFills and runs reconstructTrades +
computeTradeStats through useMemo on data change. Returns { stats,
isLoading, isError, error } — stats is null until the first fetch
succeeds; error flows straight through from useUserFills.

3 tests: loading returns null, post-load returns populated stats,
fetch error propagates.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Number formatters

**Files:**
- Create: `src/lib/ui/format.ts`
- Create: `src/lib/ui/format.test.ts`
- Modify: `package.json` (add `date-fns@4.1.0`)

- [ ] **Step 4.1: Install `date-fns`**

```bash
pnpm add date-fns@4.1.0
```

- [ ] **Step 4.2: Write the failing tests (RED)**

Create `src/lib/ui/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatCurrency, formatPercent, formatHoldTime, formatCompactCount } from './format';

describe('formatCurrency', () => {
  it('formats positive values with a leading sign marker', () => {
    expect(formatCurrency(1234.56)).toBe('+$1,234.56');
  });

  it('formats negative values with a minus sign', () => {
    expect(formatCurrency(-42.5)).toBe('-$42.50');
  });

  it('formats zero without a sign', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('renders null as em-dash', () => {
    expect(formatCurrency(null)).toBe('—');
  });

  it('rounds to 2 decimals', () => {
    expect(formatCurrency(1.005)).toBe('+$1.01');
  });
});

describe('formatPercent', () => {
  it('formats fractions as percentages with one decimal', () => {
    expect(formatPercent(0.653)).toBe('65.3%');
  });

  it('renders null as em-dash', () => {
    expect(formatPercent(null)).toBe('—');
  });

  it('formats zero as 0.0%', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('handles fractions above 1', () => {
    expect(formatPercent(2.5)).toBe('250.0%');
  });
});

describe('formatHoldTime', () => {
  it('formats seconds', () => {
    expect(formatHoldTime(30_000)).toBe('30s');
  });

  it('formats minutes', () => {
    expect(formatHoldTime(5 * 60_000)).toBe('5m');
  });

  it('formats hours', () => {
    expect(formatHoldTime(3 * 60 * 60_000)).toBe('3h');
  });

  it('formats days', () => {
    expect(formatHoldTime(2 * 24 * 60 * 60_000)).toBe('2d');
  });

  it('rounds down to the nearest whole unit', () => {
    expect(formatHoldTime(90 * 60_000)).toBe('1h'); // 1.5h → 1h
  });

  it('renders null as em-dash', () => {
    expect(formatHoldTime(null)).toBe('—');
  });
});

describe('formatCompactCount', () => {
  it('formats small counts plainly', () => {
    expect(formatCompactCount(42)).toBe('42');
  });

  it('formats thousands with k suffix', () => {
    expect(formatCompactCount(1500)).toBe('1.5k');
    expect(formatCompactCount(42000)).toBe('42k');
  });

  it('formats millions with M suffix', () => {
    expect(formatCompactCount(1_500_000)).toBe('1.5M');
  });
});
```

Run → RED.

- [ ] **Step 4.3: Write the formatters (GREEN)**

Create `src/lib/ui/format.ts`:

```ts
const MISSING = '—';

/**
 * USDC currency with a sign marker for non-zero values. Null renders as
 * em-dash ("no data"); 0 renders as "$0.00" with no sign.
 */
export function formatCurrency(value: number | null): string {
  if (value === null) return MISSING;
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (value > 0) return `+$${formatted}`;
  if (value < 0) return `-$${formatted}`;
  return `$${formatted}`;
}

/**
 * Percentage with one decimal. Input is a fraction (0.65 → "65.0%").
 */
export function formatPercent(value: number | null): string {
  if (value === null) return MISSING;
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Hold duration as the largest fitting unit, rounded down. Input is ms.
 */
export function formatHoldTime(ms: number | null): string {
  if (ms === null) return MISSING;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Large integer counts compacted with k/M suffixes. < 1000 renders plain.
 */
export function formatCompactCount(value: number): string {
  if (value < 1000) return value.toString();
  if (value < 1_000_000) {
    const thousands = value / 1000;
    return thousands % 1 === 0
      ? `${thousands}k`
      : `${thousands.toFixed(1)}k`;
  }
  const millions = value / 1_000_000;
  return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
}
```

- [ ] **Step 4.4: Run + gauntlet + commit**

All formatter tests pass.

```bash
git add package.json pnpm-lock.yaml src/lib/ui/format.ts src/lib/ui/format.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): add number formatters (currency, percent, hold time, compact)

Four pure formatters for rendering TradeStats values. Null → em-dash
convention aligns with the null-vs-zero semantics in TradeStats:
null always means "no data", never "zero". Zero renders as
"$0.00" / "0.0%" / "0s" / "0" — a real value, not a missing one.

date-fns@4.1.0 installed (blessed in CLAUDE.md §2 but not yet used;
reserved for Session 4b's calendar component).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `MetricCard` component (TDD)

**Files:**
- Create: `src/lib/ui/components/metric-card.tsx`
- Create: `src/lib/ui/components/metric-card.test.tsx`

- [ ] **Step 5.1: Write the failing tests (RED)**

Create `src/lib/ui/components/metric-card.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricCard } from './metric-card';

describe('MetricCard', () => {
  it('renders label and value', () => {
    render(<MetricCard label="Total PnL" value="+$1,234.56" />);
    expect(screen.getByText('Total PnL')).toBeInTheDocument();
    expect(screen.getByText('+$1,234.56')).toBeInTheDocument();
  });

  it('marks positive tone with the gain color class', () => {
    const { container } = render(
      <MetricCard label="PnL" value="+$100" tone="gain" />,
    );
    expect(container.querySelector('.text-gain')).not.toBeNull();
  });

  it('marks negative tone with the loss color class', () => {
    const { container } = render(
      <MetricCard label="PnL" value="-$100" tone="loss" />,
    );
    expect(container.querySelector('.text-loss')).not.toBeNull();
  });

  it('renders a provenance indicator when provenance is provided', () => {
    render(<MetricCard label="PnL" value="$0" provenance="derived" />);
    // We expose the provenance via the element's `title` attribute for
    // tooltip-on-hover; visible rendering is a small dot.
    expect(screen.getByTitle(/derived/i)).toBeInTheDocument();
  });

  it('omits provenance dot when provenance prop is absent', () => {
    const { container } = render(<MetricCard label="PnL" value="$0" />);
    expect(container.querySelector('[data-provenance]')).toBeNull();
  });
});
```

Run → RED.

- [ ] **Step 5.2: Write the component (GREEN)**

Create `src/lib/ui/components/metric-card.tsx`:

```tsx
import type { Provenance } from '@entities/provenance';
import { cn } from '@lib/ui/utils';

type Tone = 'neutral' | 'gain' | 'loss' | 'risk';

type Props = {
  label: string;
  value: string;
  tone?: Tone;
  provenance?: Provenance;
  subtext?: string;
};

const toneClass: Record<Tone, string> = {
  neutral: 'text-fg-base',
  gain: 'text-gain',
  loss: 'text-loss',
  risk: 'text-risk',
};

const provenanceColor: Record<Provenance, string> = {
  observed: 'bg-gain',
  derived: 'bg-accent',
  inferred: 'bg-risk',
  unknown: 'bg-fg-subtle',
};

export function MetricCard({
  label,
  value,
  tone = 'neutral',
  provenance,
  subtext,
}: Props) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-bg-raised p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-fg-muted">
          {label}
        </p>
        {provenance && (
          <span
            data-provenance={provenance}
            title={`Provenance: ${provenance}`}
            className={cn('h-2 w-2 rounded-full', provenanceColor[provenance])}
            aria-hidden
          />
        )}
      </div>
      <p className={cn('font-mono text-2xl font-semibold tabular-nums', toneClass[tone])}>
        {value}
      </p>
      {subtext && <p className="text-xs text-fg-subtle">{subtext}</p>}
    </div>
  );
}
```

- [ ] **Step 5.3: Run + gauntlet + commit**

All 5 tests pass.

```bash
git add src/lib/ui/components/metric-card.tsx src/lib/ui/components/metric-card.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add MetricCard primitive for analytics grids

MetricCard renders one TradeStats value with a label, a tone (gain /
loss / risk / neutral → coloured value), optional subtext, and an
optional provenance dot (observed / derived / inferred / unknown,
surfaced via a coloured circle with a title-attribute tooltip).

Styling uses HyperJournal's semantic tokens (text-gain, text-loss,
bg-bg-raised, border-border, tabular-nums); no raw hex.

5 tests: label/value rendering, gain + loss tone classes, provenance
dot presence and absence.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `WalletMetricsGrid` + `WalletView` integration

**Files:**
- Create: `src/features/wallets/components/WalletMetricsGrid.tsx`
- Modify: `src/features/wallets/index.ts` (export `WalletMetricsGrid`)
- Modify: `src/app/WalletView.tsx` (render the grid)

### Which 10 cards to show on `/w/:address`

- Total PnL (tone: gain/loss/neutral based on sign)
- Closed trades (count)
- Open trades (count, subtext if >0)
- Win rate
- Expectancy
- Profit factor
- Max drawdown (tone: loss)
- Avg hold time
- Best / Worst trade (two cards)
- Total fees (subtext: "across all trades")

That's 11 cards. Fine for a responsive grid.

- [ ] **Step 6.1: Create `src/features/wallets/components/WalletMetricsGrid.tsx`**

```tsx
import type { TradeStats } from '@entities/trade-stats';
import { MetricCard } from '@lib/ui/components/metric-card';
import {
  formatCompactCount,
  formatCurrency,
  formatHoldTime,
  formatPercent,
} from '@lib/ui/format';

type Props = { stats: TradeStats };

export function WalletMetricsGrid({ stats }: Props) {
  const pnlTone =
    stats.totalPnl > 0 ? 'gain' : stats.totalPnl < 0 ? 'loss' : 'neutral';

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      <MetricCard
        label="Total PnL"
        value={formatCurrency(stats.totalPnl)}
        tone={pnlTone}
        provenance={stats.provenance}
      />
      <MetricCard
        label="Closed trades"
        value={formatCompactCount(stats.closedCount)}
        provenance={stats.provenance}
      />
      <MetricCard
        label="Open trades"
        value={formatCompactCount(stats.openCount)}
        provenance={stats.provenance}
        subtext={stats.openCount > 0 ? 'Still running' : undefined}
      />
      <MetricCard
        label="Win rate"
        value={formatPercent(stats.winRate)}
        provenance={stats.provenance}
      />
      <MetricCard
        label="Expectancy"
        value={formatCurrency(stats.expectancy)}
        tone={(stats.expectancy ?? 0) >= 0 ? 'gain' : 'loss'}
        provenance={stats.provenance}
        subtext="per trade"
      />
      <MetricCard
        label="Profit factor"
        value={stats.profitFactor !== null ? stats.profitFactor.toFixed(2) : '—'}
        provenance={stats.provenance}
      />
      <MetricCard
        label="Max drawdown"
        value={formatCurrency(-stats.maxDrawdown)}
        tone={stats.maxDrawdown > 0 ? 'loss' : 'neutral'}
        provenance={stats.provenance}
        subtext={
          stats.maxDrawdownPct !== null
            ? `${formatPercent(stats.maxDrawdownPct)} peak-to-trough`
            : undefined
        }
      />
      <MetricCard
        label="Avg hold time"
        value={formatHoldTime(stats.avgHoldTimeMs)}
        provenance={stats.provenance}
      />
      <MetricCard
        label="Best trade"
        value={formatCurrency(stats.bestTrade)}
        tone="gain"
        provenance={stats.provenance}
      />
      <MetricCard
        label="Worst trade"
        value={formatCurrency(stats.worstTrade)}
        tone="loss"
        provenance={stats.provenance}
      />
      <MetricCard
        label="Total fees"
        value={formatCurrency(-stats.totalFees)}
        tone="loss"
        provenance={stats.provenance}
        subtext="across all trades"
      />
    </div>
  );
}
```

- [ ] **Step 6.2: Update `src/features/wallets/index.ts`**

Append:
```ts
export { WalletMetricsGrid } from './components/WalletMetricsGrid';
export { useWalletMetrics } from './hooks/useWalletMetrics';
```

- [ ] **Step 6.3: Rewrite `src/app/WalletView.tsx`**

```tsx
import { useEffect } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { isValidWalletAddress } from '@domain/wallets/isValidWalletAddress';
import {
  useSavedWallets,
  useWalletMetrics,
  WalletMetricsGrid,
} from '@features/wallets';
import type { WalletAddress } from '@entities/wallet';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  return (
    <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg-base">Wallet</h1>
          <p className="font-mono text-xs text-fg-muted">{address}</p>
        </div>
        <Link to="/" className="text-sm text-fg-muted underline hover:text-fg-base">
          ← Back
        </Link>
      </header>

      {metrics.isLoading && (
        <section className="rounded-lg border border-border bg-bg-raised p-6">
          <p className="text-fg-muted">Loading metrics…</p>
        </section>
      )}

      {metrics.isError && (
        <section className="rounded-lg border border-border bg-bg-raised p-6">
          <p className="text-loss">
            Could not load wallet data: {metrics.error?.message}
          </p>
        </section>
      )}

      {metrics.stats && <WalletMetricsGrid stats={metrics.stats} />}
    </main>
  );
}
```

- [ ] **Step 6.4: Run + gauntlet + manual browser check + commit**

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

All exit 0. The optional manual browser check (`pnpm dev`, paste the test wallet, see the metrics grid render) is valuable but optional — the automated tests cover shape.

```bash
git add src/features/wallets/components/WalletMetricsGrid.tsx src/features/wallets/index.ts src/app/WalletView.tsx
git commit -m "$(cat <<'EOF'
feat(app): render wallet metrics grid on /w/:address

WalletMetricsGrid maps TradeStats into 11 MetricCard instances:
Total PnL, closed/open trade counts, win rate, expectancy (per-trade
subtext), profit factor, max drawdown (with peak-to-trough percent
subtext), avg hold time, best/worst single trade, total fees.

WalletView drops the "Loaded N fills" placeholder and now orchestrates
useWalletMetrics → grid. Error and loading states remain visible as
their own sections.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Docs + verification + review

- [ ] Update `docs/CONVENTIONS.md` §4 (Components): add note about MetricCard + tone conventions.
- [ ] Update `docs/CONVENTIONS.md` §7: document null-vs-zero semantics for analytical outputs ("null = no data, zero = real zero").
- [ ] `docs/BACKLOG.md`: Session 4a deferrals (see below).
- [ ] `docs/SESSION_LOG.md`: append Session 4a entry.
- [ ] Run final gauntlet. Dispatch across-session reviewer.

### Likely BACKLOG entries

- Tier-2 metrics (Sharpe-like, Kelly, risk of ruin, stop-loss usage rate) — roadmap says Session 4, but those are deferred to later analytics phases.
- Per-coin breakdown of TradeStats — right now stats are walletwide; users will want per-coin filtering.
- Filter panel for metrics (date range, asset, side) — §11.5 in plan.md; deferred to a filter-introducing session.
- Persistent analytics snapshots in Dexie — §11.4 mentions `WalletAnalyticsSnapshot`; not yet needed.

---

## Self-review checklist

- **Spec coverage:** every Tier-1 metric from plan §19.1 maps to a field in `TradeStats` and a `MetricCard` on the grid.
- **No I/O in domain:** `computeTradeStats` takes only trades; no clock, no random, no fetch.
- **Null-vs-zero:** every metric that could be undefined returns `null`, not `0`. Formatters render null as em-dash.
- **Test density:** 14 computeTradeStats tests + 3 hook tests + formatter tests + 5 MetricCard tests.
- **Integration works:** `WalletView` on `/w/:address` shows the grid for a real wallet.
