# Phase 1 Session 3 — Trade Reconstruction Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn `RawFill[]` into `ReconstructedTrade[]` — pure functions in `domain/reconstruction/` that group fills into logical trades (open → possibly-scale-in/out → close or flip). Verified by round-tripping Hyperliquid's own reported `closedPnl` through the reconstruction and matching the sum within floating-point tolerance. No UI wiring — Session 4 consumes this output to render charts and tables.

**Architecture:** Strictly pure functions, strictly in `domain/`. No React, no storage, no I/O. Input: `ReadonlyArray<RawFill>` (from the committed fixture in tests, from Dexie in production via Session 2b's cache). Output: `ReadonlyArray<ReconstructedTrade>` plus a small entity surface (`TradeLeg`, `TradeStatus`). Every trade carries provenance on derived fields.

**Core insight:** Hyperliquid's `dir` field (`"Open Long" | "Close Long" | "Open Short" | "Close Short"`) already classifies each fill's intent. Reconstruction walks fills in time-order per coin, maintaining a live segment; opens extend, closes reduce, and the moment cumulative position returns to 0 (or flips sign), the segment finalizes into a `ReconstructedTrade`. Cross-checked against `sum(closedPnl)` per coin, which is HL's own realized PnL oracle.

**Tech Stack:** Zod is not involved (this layer consumes already-validated data). No new dependencies.

---

## Observed fixture shape (from Session 2a fixture exploration)

- `dir` values in 100-fill sample: `["Close Long", "Close Short", "Open Long", "Open Short"]` — exhaustive for normal trading
- `side`: `"A" | "B"` (always both present — A is sell, B is buy)
- `coin`: 7 distinct in the sample including namespaced `xyz:*` equity symbols
- No `sz: 0` fills — funding and fees are separate endpoints
- `closedPnl` is a signed numeric string; zero on opens, non-zero on closes
- `startPosition` is the signed position size BEFORE the fill

**What this fixture does NOT exercise (may appear in production):**
- Liquidations (would likely add `"Liquidation"` to `dir`)
- Exact-flip fills (single fill crossing zero) — in practice HL splits these into two fills
- Funding accruals on `userFills` (they're on `userFunding`, not here)

We handle the 4 observed `dir` values as the canonical set. If production data shows a new `dir` value, the reconstruction fails loudly with a typed error rather than silently mis-classifies.

---

## File structure (at end of session)

```
HyperJournal/
├── src/
│   ├── entities/
│   │   ├── trade.ts                         (new: TradeLeg, TradeStatus, ReconstructedTrade)
│   │   └── provenance.ts                    (existing; extend with helper if needed)
│   ├── domain/
│   │   ├── reconstruction/
│   │   │   ├── groupFillsByCoin.ts          (pure helper)
│   │   │   ├── groupFillsByCoin.test.ts
│   │   │   ├── reconstructCoinTrades.ts     (per-coin: fills → trades)
│   │   │   ├── reconstructCoinTrades.test.ts
│   │   │   ├── reconstructTrades.ts         (top-level: fills → trades, composes the helpers)
│   │   │   ├── reconstructTrades.test.ts
│   │   │   ├── checkRealizedPnl.ts          (oracle: sum reconstructed realizedPnl ≈ sum HL closedPnl)
│   │   │   └── checkRealizedPnl.test.ts
│   │   └── wallets/                         (existing)
│   └── lib/                                 (untouched this session)
└── tests/
    └── fixtures/hyperliquid/                (existing, read-only in this session)
```

---

## Conventions

- Commands run from `/Users/angel/Documents/HyperJournal`.
- Every commit ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- Conventional prefixes per CONVENTIONS.md §10.
- **No I/O, no Date.now(), no Math.random(), no React** in any `domain/` file. Period.
- **TDD is mandatory** for every new file in `domain/` — tests first, verify RED, then impl.

---

## Task 1: Entity types — `TradeLeg`, `TradeStatus`, `ReconstructedTrade`

**Files:**
- Create: `src/entities/trade.ts`

- [ ] **Step 1.1: Write `src/entities/trade.ts`**

```ts
import type { WalletAddress } from './wallet';
import type { Provenance } from './provenance';
import type { RawFill } from './fill';

/**
 * A TradeLeg wraps a single fill that contributed to a reconstructed trade,
 * with its role in the trade's lifecycle. Every RawFill in a trade becomes
 * exactly one TradeLeg; no aggregation at this level.
 */
export type TradeLeg = {
  readonly fill: RawFill;
  /**
   * 'open' fills start or extend the position; 'close' fills reduce or
   * terminate it. Derived directly from the fill's `dir` field (Open * →
   * 'open', Close * → 'close').
   */
  readonly role: 'open' | 'close';
};

/**
 * Classification of a trade's current state.
 * - 'closed': the position returned to zero at the last close leg; realizedPnl
 *   is final.
 * - 'open': the trade is still running; no realized PnL yet (unrealizedPnl
 *   lives in clearinghouseState, not here).
 */
export type TradeStatus = 'closed' | 'open';

/**
 * Side of the overall trade. A trade that opens long and closes back to zero
 * is 'long'; an opens-short-closes-back trade is 'short'. Flips are emitted
 * as two separate trades, one per direction.
 */
export type TradeSide = 'long' | 'short';

/**
 * A reconstructed trade: a logical unit spanning one or more fills on the
 * same coin that together represent opening, possibly scaling, and closing
 * a position. The product's primary analytical unit.
 *
 * Provenance: observed fields flow from the underlying fills; derived fields
 * (avgEntryPx, avgExitPx, realizedPnl, holdTimeMs, openedAt, closedAt) are
 * deterministic functions of those. No inferred fields at this layer — any
 * inference (e.g., "was there a stop loss?") lives in Session 4+ pattern
 * detection, not here.
 */
export type ReconstructedTrade = {
  readonly id: string;
  readonly wallet: WalletAddress | null;
  readonly coin: string;
  readonly side: TradeSide;
  readonly status: TradeStatus;
  readonly legs: ReadonlyArray<TradeLeg>;

  /** Unix ms of the first fill. */
  readonly openedAt: number;
  /** Unix ms of the last fill; equals openedAt for single-fill trades. */
  readonly closedAt: number;
  /** closedAt - openedAt. Zero for single-fill trades. */
  readonly holdTimeMs: number;

  /** Total size opened, summed across all 'open' legs (always positive). */
  readonly openedSize: number;
  /** Total size closed, summed across all 'close' legs (always positive). */
  readonly closedSize: number;

  /** Size-weighted average entry price across all 'open' legs. */
  readonly avgEntryPx: number;
  /**
   * Size-weighted average exit price across all 'close' legs, or null if the
   * trade is still open.
   */
  readonly avgExitPx: number | null;

  /**
   * Sum of closedPnl from every 'close' leg — matches Hyperliquid's own
   * realized PnL accounting. Zero for open trades.
   */
  readonly realizedPnl: number;
  /** Sum of `fee` across every leg (always non-negative). */
  readonly totalFees: number;

  readonly provenance: Provenance;
};
</ts>
```

(Note: the last token of that code block is an unterminated fence marker — strip it when writing the file. Replace ``` </ts> ``` with a plain ``` ``` closer if your editor flags it.)

Cleaner: write the file with the content between the outer fences, ending at `};` on its own line with a trailing newline. No trailing `</ts>` artifact.

- [ ] **Step 1.2: Verify**

```bash
pnpm typecheck
pnpm lint
```

Both exit 0.

- [ ] **Step 1.3: Commit**

```bash
git add src/entities/trade.ts
git commit -m "$(cat <<'EOF'
feat(entities): add TradeLeg, TradeStatus, ReconstructedTrade types

ReconstructedTrade is the primary analytical unit Session 3's engine
produces and Sessions 4+ consume. A trade aggregates one or more legs
(wrapped RawFills with role='open'|'close') on the same coin into a
single open→(scale)→close lifecycle. Flips become two separate trades,
one per direction.

Derived fields (avgEntryPx, realizedPnl, holdTimeMs, …) have a single
'observed' provenance because they flow deterministically from observed
fill data. Inferred patterns (stop-loss inference etc.) live in later
sessions, not in entities.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Group fills by coin + sort by time (TDD)

**Files:**
- Create: `src/domain/reconstruction/groupFillsByCoin.ts`
- Create: `src/domain/reconstruction/groupFillsByCoin.test.ts`

This is the smallest pure helper. It isolates sorting/grouping so reconstruction itself can assume ordered-per-coin input.

- [ ] **Step 2.1: Write the failing test (RED)**

Create `src/domain/reconstruction/groupFillsByCoin.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { groupFillsByCoin } from './groupFillsByCoin';
import { FillSchema } from '@lib/validation/hyperliquid';
import type { RawFill } from '@entities/fill';

const fixture = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../tests/fixtures/hyperliquid/user-fills.json'),
    'utf8',
  ),
);
const realFills: RawFill[] = fixture.map((f: unknown) => FillSchema.parse(f));

const makeFill = (overrides: Partial<RawFill>): RawFill => ({
  coin: 'BTC',
  px: 100,
  sz: 1,
  side: 'B',
  time: 0,
  startPosition: 0,
  dir: 'Open Long',
  closedPnl: 0,
  hash: '',
  oid: 0,
  crossed: true,
  fee: 0,
  tid: 0,
  feeToken: 'USDC',
  twapId: null,
  ...overrides,
});

describe('groupFillsByCoin', () => {
  it('returns an empty map for empty input', () => {
    expect(groupFillsByCoin([])).toEqual(new Map());
  });

  it('partitions fills into one array per coin', () => {
    const input = [
      makeFill({ coin: 'BTC', time: 1, tid: 1 }),
      makeFill({ coin: 'ETH', time: 2, tid: 2 }),
      makeFill({ coin: 'BTC', time: 3, tid: 3 }),
    ];
    const out = groupFillsByCoin(input);
    expect(out.get('BTC')).toHaveLength(2);
    expect(out.get('ETH')).toHaveLength(1);
  });

  it('sorts each coin bucket by time ascending, with tid as a stable tiebreaker', () => {
    const input = [
      makeFill({ coin: 'BTC', time: 10, tid: 2 }),
      makeFill({ coin: 'BTC', time: 10, tid: 1 }),
      makeFill({ coin: 'BTC', time: 5, tid: 3 }),
    ];
    const out = groupFillsByCoin(input).get('BTC')!;
    expect(out.map((f) => f.tid)).toEqual([3, 1, 2]);
  });

  it('returns a Map whose iteration order matches first-seen insertion order', () => {
    const input = [
      makeFill({ coin: 'ETH', time: 1, tid: 1 }),
      makeFill({ coin: 'BTC', time: 2, tid: 2 }),
    ];
    const keys = Array.from(groupFillsByCoin(input).keys());
    expect(keys).toEqual(['ETH', 'BTC']);
  });

  it('handles the real fixture without losing fills', () => {
    const grouped = groupFillsByCoin(realFills);
    const total = Array.from(grouped.values()).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );
    expect(total).toBe(realFills.length);
  });

  it('produces per-coin arrays sorted by time in the real fixture', () => {
    const grouped = groupFillsByCoin(realFills);
    for (const arr of grouped.values()) {
      for (let i = 1; i < arr.length; i++) {
        const prev = arr[i - 1]!;
        const curr = arr[i]!;
        expect(curr.time).toBeGreaterThanOrEqual(prev.time);
        if (curr.time === prev.time) {
          expect(curr.tid).toBeGreaterThanOrEqual(prev.tid);
        }
      }
    }
  });
});
```

Run:

```bash
pnpm test src/domain/reconstruction/groupFillsByCoin.test.ts
```

Expected: RED, "Cannot find module".

- [ ] **Step 2.2: Write the helper (GREEN)**

Create `src/domain/reconstruction/groupFillsByCoin.ts`:

```ts
import type { RawFill } from '@entities/fill';

/**
 * Partition fills into one array per coin, each sorted by `time` ascending
 * with `tid` as a stable tiebreaker. Pure; does not mutate input.
 *
 * Map iteration order follows first-seen insertion order for deterministic
 * downstream ordering.
 */
export function groupFillsByCoin(
  fills: ReadonlyArray<RawFill>,
): ReadonlyMap<string, ReadonlyArray<RawFill>> {
  const buckets = new Map<string, RawFill[]>();
  for (const fill of fills) {
    const existing = buckets.get(fill.coin);
    if (existing) {
      existing.push(fill);
    } else {
      buckets.set(fill.coin, [fill]);
    }
  }
  for (const [, arr] of buckets) {
    arr.sort((a, b) => a.time - b.time || a.tid - b.tid);
  }
  return buckets;
}
```

- [ ] **Step 2.3: Run tests + gauntlet**

```bash
pnpm test src/domain/reconstruction/
pnpm lint
pnpm typecheck
pnpm test:coverage
```

All exit 0. Coverage for `groupFillsByCoin.ts` should be 100%.

- [ ] **Step 2.4: Commit**

```bash
git add src/domain/reconstruction/
git commit -m "$(cat <<'EOF'
feat(domain): add groupFillsByCoin helper (sort per-coin by time+tid)

Pure helper that partitions RawFill[] into one array per coin, each
sorted by (time asc, tid asc). Downstream reconstruction assumes this
invariant — moving the sort/group out of the main algorithm keeps that
code focused on the position-state machine.

6 tests: empty input, multi-coin partition, stable sort tiebreaker,
insertion-ordered keys, real-fixture shape preservation, real-fixture
sort correctness.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Per-coin reconstruction (TDD) — `reconstructCoinTrades`

This is the core of the engine. A pure function that walks one coin's time-sorted fills and emits the ReconstructedTrade array for that coin.

**Algorithm:**

Maintain state: `openLegs: TradeLeg[]`, `side: TradeSide | null`, `size: number` (running signed position; invariant: `side === null` ⟺ `size === 0`).

For each incoming fill (already sorted):

1. Derive the leg's role from `dir`:
   - `"Open Long" | "Open Short"` → `open`
   - `"Close Long" | "Close Short"` → `close`
   - anything else → throw a typed error (defensive; fixture doesn't exercise but production might)

2. If role is `open`:
   - If no trade is in progress (`openLegs` empty): start a new trade. Set `side = dir === "Open Long" ? "long" : "short"`. Push leg. Update size (`+= sz` for long, `+= sz` for short — we track absolute size, not signed).
   - If trade in progress and side matches (scaling in): push leg, update size.
   - If trade in progress and side DIFFERS (impossible given HL's dir semantics — an "Open Long" shouldn't appear while short). Defensive: emit current trade as-is (close it with whatever it has), then start a new trade from this open leg. Log via a typed warning in the return object (see Step 3.2's return type).

3. If role is `close`:
   - If no trade in progress: this is a dangling close (shouldn't happen with validated HL data). Defensive: skip or throw. Decide on THROW — correctness over silence.
   - Else: push leg. Reduce size by `sz`. If size hits 0 (within tolerance), finalize: compute avgEntry/avgExit/realizedPnl/holdTime and emit the trade. Reset state.
   - If size would go negative: treat as a "flip". Not observed in the fixture and HL seems to split flips into separate close + open fills (each with its own tid). Emit current trade as closed with `sz = remaining_to_close`, then treat the leftover as a new open of the opposite side. For now, THROW on this case — document as a known limitation in BACKLOG.

4. End of loop: if `openLegs.length > 0`, emit the in-progress trade as `status: 'open'`.

**Fee allocation:** `totalFees` = sum of `fee` across every leg (open AND close).

**PnL:** `realizedPnl` = sum of `closedPnl` across every CLOSE leg. This matches HL's accounting. Opens have `closedPnl: 0`.

**Tolerance for "size = 0":** floating-point sum of signed numeric strings can drift by ~1e-10. Use `Math.abs(size) < 1e-9` as the zero check.

**ID:** deterministic hash — `"${coin}-${firstLegTid}"`. Uses the first leg's `tid` which HL guarantees unique per fill.

- [ ] **Step 3.1: Write the failing tests (RED)**

Create `src/domain/reconstruction/reconstructCoinTrades.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { reconstructCoinTrades } from './reconstructCoinTrades';
import type { RawFill } from '@entities/fill';

const makeFill = (overrides: Partial<RawFill>): RawFill => ({
  coin: 'BTC',
  px: 100,
  sz: 1,
  side: 'B',
  time: 0,
  startPosition: 0,
  dir: 'Open Long',
  closedPnl: 0,
  hash: '',
  oid: 0,
  crossed: true,
  fee: 0,
  tid: 0,
  feeToken: 'USDC',
  twapId: null,
  ...overrides,
});

describe('reconstructCoinTrades', () => {
  it('returns no trades for an empty fill list', () => {
    expect(reconstructCoinTrades('BTC', [])).toEqual([]);
  });

  it('reconstructs a simple open→close long trade', () => {
    const fills = [
      makeFill({ dir: 'Open Long', px: 100, sz: 1, time: 1, tid: 1, fee: 0.1 }),
      makeFill({ dir: 'Close Long', px: 110, sz: 1, time: 2, tid: 2, fee: 0.1, closedPnl: 10 }),
    ];
    const [trade] = reconstructCoinTrades('BTC', fills);
    expect(trade).toBeDefined();
    expect(trade!.side).toBe('long');
    expect(trade!.status).toBe('closed');
    expect(trade!.legs).toHaveLength(2);
    expect(trade!.avgEntryPx).toBeCloseTo(100, 9);
    expect(trade!.avgExitPx).toBeCloseTo(110, 9);
    expect(trade!.realizedPnl).toBeCloseTo(10, 9);
    expect(trade!.totalFees).toBeCloseTo(0.2, 9);
    expect(trade!.openedSize).toBeCloseTo(1, 9);
    expect(trade!.closedSize).toBeCloseTo(1, 9);
    expect(trade!.openedAt).toBe(1);
    expect(trade!.closedAt).toBe(2);
    expect(trade!.holdTimeMs).toBe(1);
  });

  it('computes size-weighted averages across multiple opens and a single close', () => {
    const fills = [
      makeFill({ dir: 'Open Long', px: 100, sz: 1, time: 1, tid: 1 }),
      makeFill({ dir: 'Open Long', px: 110, sz: 3, time: 2, tid: 2 }),
      makeFill({ dir: 'Close Long', px: 120, sz: 4, time: 3, tid: 3, closedPnl: 50 }),
    ];
    const [trade] = reconstructCoinTrades('BTC', fills);
    // Entry avg = (100*1 + 110*3) / 4 = 107.5
    expect(trade!.avgEntryPx).toBeCloseTo(107.5, 9);
    expect(trade!.avgExitPx).toBeCloseTo(120, 9);
    expect(trade!.openedSize).toBeCloseTo(4, 9);
    expect(trade!.closedSize).toBeCloseTo(4, 9);
    expect(trade!.realizedPnl).toBeCloseTo(50, 9);
  });

  it('handles a short trade', () => {
    const fills = [
      makeFill({ dir: 'Open Short', px: 100, sz: 2, side: 'A', time: 1, tid: 1 }),
      makeFill({ dir: 'Close Short', px: 90, sz: 2, side: 'B', time: 2, tid: 2, closedPnl: 20 }),
    ];
    const [trade] = reconstructCoinTrades('BTC', fills);
    expect(trade!.side).toBe('short');
    expect(trade!.realizedPnl).toBeCloseTo(20, 9);
  });

  it('emits an open-status trade for an unclosed position at the end', () => {
    const fills = [
      makeFill({ dir: 'Open Long', px: 100, sz: 1, time: 1, tid: 1 }),
    ];
    const trades = reconstructCoinTrades('BTC', fills);
    expect(trades).toHaveLength(1);
    expect(trades[0]!.status).toBe('open');
    expect(trades[0]!.avgExitPx).toBeNull();
    expect(trades[0]!.closedSize).toBe(0);
    expect(trades[0]!.realizedPnl).toBe(0);
  });

  it('emits two trades for a close → open sequence (after a full close)', () => {
    const fills = [
      makeFill({ dir: 'Open Long', px: 100, sz: 1, time: 1, tid: 1 }),
      makeFill({ dir: 'Close Long', px: 110, sz: 1, time: 2, tid: 2, closedPnl: 10 }),
      makeFill({ dir: 'Open Short', px: 110, sz: 1, side: 'A', time: 3, tid: 3 }),
      makeFill({ dir: 'Close Short', px: 100, sz: 1, side: 'B', time: 4, tid: 4, closedPnl: 10 }),
    ];
    const trades = reconstructCoinTrades('BTC', fills);
    expect(trades).toHaveLength(2);
    expect(trades[0]!.side).toBe('long');
    expect(trades[0]!.status).toBe('closed');
    expect(trades[1]!.side).toBe('short');
    expect(trades[1]!.status).toBe('closed');
  });

  it('deterministically IDs trades by coin + first leg tid', () => {
    const fills = [
      makeFill({ dir: 'Open Long', sz: 1, time: 1, tid: 42 }),
      makeFill({ dir: 'Close Long', sz: 1, time: 2, tid: 43 }),
    ];
    const [trade] = reconstructCoinTrades('BTC', fills);
    expect(trade!.id).toBe('BTC-42');
  });

  it('throws a typed error on a dangling close (no open trade)', () => {
    const fills = [
      makeFill({ dir: 'Close Long', sz: 1, time: 1, tid: 1, closedPnl: 10 }),
    ];
    expect(() => reconstructCoinTrades('BTC', fills)).toThrow(/dangling close/i);
  });

  it('throws on an unknown dir value', () => {
    const fills = [
      // @ts-expect-error — deliberately violating the type to test runtime guard
      makeFill({ dir: 'Liquidation' }),
    ];
    expect(() => reconstructCoinTrades('BTC', fills)).toThrow(/unknown dir/i);
  });

  it('throws on a close that would flip position sign (unsupported in v1)', () => {
    const fills = [
      makeFill({ dir: 'Open Long', sz: 1, time: 1, tid: 1 }),
      makeFill({ dir: 'Close Long', sz: 2, time: 2, tid: 2 }), // tries to close 2 with only 1 open
    ];
    expect(() => reconstructCoinTrades('BTC', fills)).toThrow(/flip|oversized close/i);
  });
});
```

Run:

```bash
pnpm test src/domain/reconstruction/reconstructCoinTrades.test.ts
```

Expected: RED, "Cannot find module".

- [ ] **Step 3.2: Write the reconstructor (GREEN)**

Create `src/domain/reconstruction/reconstructCoinTrades.ts`:

```ts
import type { RawFill } from '@entities/fill';
import type { ReconstructedTrade, TradeLeg, TradeSide } from '@entities/trade';

const ZERO_TOLERANCE = 1e-9;

/**
 * Walk a time-sorted list of fills for a single coin and emit the logical
 * trades they represent. Pure; `coin` is a parameter (not derived from the
 * fills) so the caller can pass an empty list without ambiguity.
 *
 * Throws on unexpected input (unknown `dir`, dangling close, oversized
 * close). The caller's responsibility to surface those cleanly — Session 3
 * does not tolerate silent data corruption in the reconstruction layer.
 */
export function reconstructCoinTrades(
  coin: string,
  fills: ReadonlyArray<RawFill>,
): ReadonlyArray<ReconstructedTrade> {
  const out: ReconstructedTrade[] = [];
  let legs: TradeLeg[] = [];
  let side: TradeSide | null = null;
  let openSize = 0;

  const finalize = (status: 'closed' | 'open') => {
    if (legs.length === 0) return;
    out.push(buildTrade(coin, legs, side!, status));
    legs = [];
    side = null;
    openSize = 0;
  };

  for (const fill of fills) {
    const role = dirToRole(fill.dir);

    if (role === 'open') {
      const fillSide: TradeSide = fill.dir === 'Open Long' ? 'long' : 'short';
      if (side === null) {
        side = fillSide;
      } else if (side !== fillSide) {
        // Defensive: HL's `dir` semantics shouldn't produce this, but guard.
        throw new Error(
          `reconstructCoinTrades: ${coin}: open ${fillSide} while ${side} trade is still open`,
        );
      }
      legs.push({ fill, role: 'open' });
      openSize += fill.sz;
    } else {
      // role === 'close'
      if (side === null) {
        throw new Error(
          `reconstructCoinTrades: ${coin}: dangling close fill at tid=${fill.tid}`,
        );
      }
      const closeSide: TradeSide = fill.dir === 'Close Long' ? 'long' : 'short';
      if (closeSide !== side) {
        throw new Error(
          `reconstructCoinTrades: ${coin}: close ${closeSide} while ${side} trade is open (tid=${fill.tid})`,
        );
      }
      if (fill.sz > openSize + ZERO_TOLERANCE) {
        throw new Error(
          `reconstructCoinTrades: ${coin}: oversized close / flip not supported in v1 (tid=${fill.tid})`,
        );
      }
      legs.push({ fill, role: 'close' });
      openSize -= fill.sz;
      if (Math.abs(openSize) <= ZERO_TOLERANCE) {
        finalize('closed');
      }
    }
  }

  finalize('open');
  return out;
}

function dirToRole(dir: string): 'open' | 'close' {
  switch (dir) {
    case 'Open Long':
    case 'Open Short':
      return 'open';
    case 'Close Long':
    case 'Close Short':
      return 'close';
    default:
      throw new Error(`reconstructCoinTrades: unknown dir "${dir}"`);
  }
}

function buildTrade(
  coin: string,
  legs: ReadonlyArray<TradeLeg>,
  side: TradeSide,
  status: 'closed' | 'open',
): ReconstructedTrade {
  const opens = legs.filter((l) => l.role === 'open');
  const closes = legs.filter((l) => l.role === 'close');

  const openedSize = opens.reduce((s, l) => s + l.fill.sz, 0);
  const closedSize = closes.reduce((s, l) => s + l.fill.sz, 0);

  const sumOpenNotional = opens.reduce((s, l) => s + l.fill.sz * l.fill.px, 0);
  const sumCloseNotional = closes.reduce((s, l) => s + l.fill.sz * l.fill.px, 0);

  const avgEntryPx = openedSize > 0 ? sumOpenNotional / openedSize : 0;
  const avgExitPx = closedSize > 0 ? sumCloseNotional / closedSize : null;

  const realizedPnl = closes.reduce((s, l) => s + l.fill.closedPnl, 0);
  const totalFees = legs.reduce((s, l) => s + l.fill.fee, 0);

  const openedAt = legs[0]!.fill.time;
  const closedAt = legs[legs.length - 1]!.fill.time;

  return {
    id: `${coin}-${legs[0]!.fill.tid}`,
    wallet: null,
    coin,
    side,
    status,
    legs,
    openedAt,
    closedAt,
    holdTimeMs: closedAt - openedAt,
    openedSize,
    closedSize,
    avgEntryPx,
    avgExitPx,
    realizedPnl,
    totalFees,
    provenance: 'observed',
  };
}
```

- [ ] **Step 3.3: Run tests**

```bash
pnpm test src/domain/reconstruction/reconstructCoinTrades.test.ts
```

Expected: 9 tests pass. If the "oversized close" test produces a surprising outcome (e.g., real HL fills split flips so finely that oversized-close never happens), investigate — the test asserts v1's documented limitation, not HL's data.

- [ ] **Step 3.4: Full gauntlet**

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm test:coverage
```

All exit 0. Coverage for the new files should be near 100%.

- [ ] **Step 3.5: Commit**

```bash
git add src/domain/reconstruction/reconstructCoinTrades.ts src/domain/reconstruction/reconstructCoinTrades.test.ts
git commit -m "$(cat <<'EOF'
feat(domain): add reconstructCoinTrades core reconstruction algorithm

Pure function: fills (time-sorted, single coin) → ReconstructedTrade[].
Walks fills maintaining openSize; an 'open' fill starts or extends a
trade, a 'close' fill reduces it. When openSize returns to zero
(within 1e-9 floating-point tolerance), the trade finalizes with
status='closed'. Positions still open at the end emit one trade with
status='open' (avgExitPx=null, realizedPnl=0, closedSize=0).

Size-weighted avgEntryPx / avgExitPx, holdTimeMs, totalFees all
derived. realizedPnl = sum(closedPnl) on close legs — matches HL's
own realized-PnL accounting exactly. ID is `{coin}-{firstLegTid}`.

v1 throws on: unknown `dir` values (e.g., "Liquidation"), dangling
close (close without a prior open), and oversized close (flip in a
single fill). These are BACKLOG items, not ignored cases.

9 tests cover: empty input, open→close long, scaled open + single
close (weighted avgs), short trade, unclosed trailing trade, close
→ new open in same coin, deterministic IDs, and the three error cases.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Top-level `reconstructTrades` + real-fixture integration test

- [ ] **Step 4.1: Test (RED)**

Create `src/domain/reconstruction/reconstructTrades.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reconstructTrades } from './reconstructTrades';
import { FillSchema } from '@lib/validation/hyperliquid';
import type { RawFill } from '@entities/fill';

const fixture = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../tests/fixtures/hyperliquid/user-fills.json'),
    'utf8',
  ),
);
const realFills: RawFill[] = fixture.map((f: unknown) => FillSchema.parse(f));

describe('reconstructTrades', () => {
  it('returns an empty array for no fills', () => {
    expect(reconstructTrades([])).toEqual([]);
  });

  it('produces trades from the real fixture covering every coin present', () => {
    const trades = reconstructTrades(realFills);
    const coinsInFills = new Set(realFills.map((f) => f.coin));
    const coinsInTrades = new Set(trades.map((t) => t.coin));
    expect(coinsInTrades).toEqual(coinsInFills);
  });

  it('every leg in the output belongs to its trade by coin', () => {
    const trades = reconstructTrades(realFills);
    for (const trade of trades) {
      for (const leg of trade.legs) {
        expect(leg.fill.coin).toBe(trade.coin);
      }
    }
  });

  it('the union of all legs equals the input fill set (one-to-one)', () => {
    const trades = reconstructTrades(realFills);
    const legTids = trades.flatMap((t) => t.legs.map((l) => l.fill.tid));
    expect(legTids.sort()).toEqual(realFills.map((f) => f.tid).sort());
  });

  it('closed trades have closedSize approximately equal to openedSize', () => {
    const trades = reconstructTrades(realFills);
    for (const t of trades.filter((t) => t.status === 'closed')) {
      expect(Math.abs(t.closedSize - t.openedSize)).toBeLessThan(1e-6);
    }
  });

  it('open trades have closedSize === 0 and avgExitPx === null', () => {
    const trades = reconstructTrades(realFills);
    for (const t of trades.filter((t) => t.status === 'open')) {
      expect(t.closedSize).toBe(0);
      expect(t.avgExitPx).toBeNull();
      expect(t.realizedPnl).toBe(0);
    }
  });
});
```

Run → RED.

- [ ] **Step 4.2: Impl (GREEN)**

Create `src/domain/reconstruction/reconstructTrades.ts`:

```ts
import type { RawFill } from '@entities/fill';
import type { ReconstructedTrade } from '@entities/trade';
import { groupFillsByCoin } from './groupFillsByCoin';
import { reconstructCoinTrades } from './reconstructCoinTrades';

/**
 * Top-level reconstruction: group by coin, then per-coin reconstruct.
 * Output is flat (not grouped) — ordered by coin iteration order (first-
 * seen) with per-coin trades in chronological order.
 */
export function reconstructTrades(
  fills: ReadonlyArray<RawFill>,
): ReadonlyArray<ReconstructedTrade> {
  const grouped = groupFillsByCoin(fills);
  const out: ReconstructedTrade[] = [];
  for (const [coin, coinFills] of grouped) {
    out.push(...reconstructCoinTrades(coin, coinFills));
  }
  return out;
}
```

- [ ] **Step 4.3: Run + gauntlet + commit**

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm test:coverage
```

All exit 0.

```bash
git add src/domain/reconstruction/reconstructTrades.ts src/domain/reconstruction/reconstructTrades.test.ts
git commit -m "$(cat <<'EOF'
feat(domain): add reconstructTrades top-level entry point

Composes groupFillsByCoin + reconstructCoinTrades. Output is a flat
trade array, coin-first-seen then chronological per coin. No
per-coin grouping in the output — callers that need it reassemble
via Map.groupBy or similar.

6 tests cover: empty input, real fixture coverage (every coin
present → trade present), leg-coin consistency, leg-fill one-to-one
preservation, closed-trade size consistency, open-trade invariants.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: PnL cross-check oracle — `checkRealizedPnl`

This is the session's correctness gate. If the sum of reconstructed `realizedPnl` (per coin) does not match the sum of HL's `closedPnl` from close-role fills, reconstruction is wrong.

- [ ] **Step 5.1: Test (RED)**

Create `src/domain/reconstruction/checkRealizedPnl.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FillSchema } from '@lib/validation/hyperliquid';
import { reconstructTrades } from './reconstructTrades';
import { checkRealizedPnl } from './checkRealizedPnl';
import type { RawFill } from '@entities/fill';

const fixture = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../tests/fixtures/hyperliquid/user-fills.json'),
    'utf8',
  ),
);
const realFills: RawFill[] = fixture.map((f: unknown) => FillSchema.parse(f));

describe('checkRealizedPnl', () => {
  it('returns matched: true when reconstructed realizedPnl equals HL closedPnl per coin', () => {
    const trades = reconstructTrades(realFills);
    const result = checkRealizedPnl(realFills, trades);
    expect(result.matched).toBe(true);
    expect(result.perCoin.size).toBeGreaterThan(0);
    for (const [coin, cmp] of result.perCoin) {
      expect(Math.abs(cmp.hlSum - cmp.reconstructedSum)).toBeLessThan(0.01);
    }
  });

  it('detects a mismatch when realizedPnl is tampered with', () => {
    const trades = reconstructTrades(realFills).map((t, i) =>
      i === 0 ? { ...t, realizedPnl: t.realizedPnl + 999 } : t,
    );
    const result = checkRealizedPnl(realFills, trades);
    expect(result.matched).toBe(false);
    // Find the coin that was tampered and confirm it shows a delta
    const tamperedCoin = reconstructTrades(realFills)[0]!.coin;
    expect(result.perCoin.get(tamperedCoin)!.delta).toBeGreaterThan(900);
  });
});
```

Run → RED.

- [ ] **Step 5.2: Impl (GREEN)**

Create `src/domain/reconstruction/checkRealizedPnl.ts`:

```ts
import type { RawFill } from '@entities/fill';
import type { ReconstructedTrade } from '@entities/trade';

/**
 * Tolerance (USDC) for per-coin PnL matching. Floating-point sum of many
 * numeric-string coerced values drifts by at most a few cents for a 100-
 * fill account; 0.01 is generous and catches real bugs.
 */
const PNL_MATCH_TOLERANCE = 0.01;

export type PnlComparison = {
  readonly coin: string;
  readonly hlSum: number;
  readonly reconstructedSum: number;
  readonly delta: number;
};

export type PnlCheckResult = {
  readonly matched: boolean;
  readonly perCoin: ReadonlyMap<string, PnlComparison>;
};

/**
 * Oracle that validates reconstructTrades against Hyperliquid's own
 * accounting. For each coin, sum the closedPnl on every close-role fill
 * (HL's answer) and the realizedPnl across every reconstructed trade
 * (our answer). Matched iff every coin's delta is within tolerance.
 *
 * This is the correctness gate for Session 3: the reconstruction is only
 * trustworthy if this check passes on the real fixture.
 */
export function checkRealizedPnl(
  fills: ReadonlyArray<RawFill>,
  trades: ReadonlyArray<ReconstructedTrade>,
): PnlCheckResult {
  const hlPerCoin = new Map<string, number>();
  for (const fill of fills) {
    const isClose = fill.dir === 'Close Long' || fill.dir === 'Close Short';
    if (!isClose) continue;
    hlPerCoin.set(fill.coin, (hlPerCoin.get(fill.coin) ?? 0) + fill.closedPnl);
  }

  const reconPerCoin = new Map<string, number>();
  for (const trade of trades) {
    reconPerCoin.set(
      trade.coin,
      (reconPerCoin.get(trade.coin) ?? 0) + trade.realizedPnl,
    );
  }

  const coins = new Set([...hlPerCoin.keys(), ...reconPerCoin.keys()]);
  const perCoin = new Map<string, PnlComparison>();
  let matched = true;
  for (const coin of coins) {
    const hlSum = hlPerCoin.get(coin) ?? 0;
    const reconstructedSum = reconPerCoin.get(coin) ?? 0;
    const delta = Math.abs(hlSum - reconstructedSum);
    if (delta > PNL_MATCH_TOLERANCE) matched = false;
    perCoin.set(coin, { coin, hlSum, reconstructedSum, delta });
  }
  return { matched, perCoin };
}
```

- [ ] **Step 5.3: Run + gauntlet + commit**

Full gauntlet. The real-fixture test is the hard one — if it fails, the reconstruction has a bug. Debug by printing per-coin deltas; the delta should point at the offending coin.

```bash
git add src/domain/reconstruction/checkRealizedPnl.ts src/domain/reconstruction/checkRealizedPnl.test.ts
git commit -m "$(cat <<'EOF'
feat(domain): add checkRealizedPnl oracle for reconstruction correctness

Sums closedPnl on close-role fills (HL's accounting) per coin, and
realizedPnl across reconstructed trades per coin, and checks that
each coin matches within PNL_MATCH_TOLERANCE ($0.01). Returns a
PnlCheckResult with per-coin deltas for diagnostic visibility.

This is the session-level correctness gate: reconstruction is only
trusted if this passes on the real fixture. 2 tests: matched path
on real fills, detected-mismatch path via synthetic tampering.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Docs + final verification + review

- [ ] **Step 6.1: Update CONVENTIONS.md §3 (Domain layer)** — append:

```markdown
- The reconstruction engine (`src/domain/reconstruction/`) is the canonical worked example of multi-file domain logic: one file per concern (group, per-coin reconstruct, top-level orchestrator, oracle), each with its own `.test.ts`. Future multi-file domains should follow this shape.
- Domain functions that walk data with running state (e.g., `reconstructCoinTrades`) use local `let` variables in a pure function — not classes, not closures captured externally. The function is pure because input and output are plain data; the mutation is local.
- When a domain module throws on unexpected input (e.g., unknown `dir` values, dangling close fills), the error message must name the function, the coin, and the offending `tid` so future debugging from a production stack trace is possible without access to the full input.
```

- [ ] **Step 6.2: BACKLOG.md — Session 3 deferrals**

Append:

```markdown
## Session 3 deferrals

- `[soon]` Support liquidation fills. The fixture did not exercise `dir: "Liquidation"` but production wallets may hit it. Today the reconstruction throws on unknown `dir` — the engine is loud, not silent. When real liquidation data arrives, decide whether to treat it as a close (probably) or a distinct leg role.
- `[soon]` Support oversized close / flips within a single fill. v1 throws; document that HL appears to split flips into back-to-back fills, so this may never fire in practice — but production observation beats assumption.
- `[maybe]` Funding payments — currently excluded (they're on `userFunding`, not `userFills`). Session 4's per-trade PnL display could attribute funding proportionally; decision deferred until analytics lands.
- `[maybe]` Weighted-avg exit for partial closes that leave a residual position — today reconstruction does not emit such trades (it requires size→0). If users want to see "partial-close" snapshots, add a separate `getCurrentOpenPosition()` helper that surfaces the running state without emitting a trade.
- `[maybe]` `wallet` field on ReconstructedTrade is currently always `null` — the reconstruction engine doesn't know which wallet it's reconstructing for. Wire in Session 4 or when a multi-wallet aggregate view is needed.
```

- [ ] **Step 6.3: SESSION_LOG.md entry** — append after Session 2b's entry (draft; edit as you go). Capture: what shipped, PnL-check result on the real fixture (include the per-coin deltas in the log for future reference), deferred items, gotchas, invariants.

- [ ] **Step 6.4: Commit docs**

- [ ] **Step 6.5: Final gauntlet + across-session review**

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test:coverage
VITE_BASE_PATH=/hyperjournal/ pnpm build
git status
```

All green. Dispatch `superpowers:code-reviewer` with scope: every commit from the plan file's commit through the docs commit. Apply fixes in a single follow-up if issues surface.

---

## Self-review checklist

- **Spec coverage:** every Session 3 roadmap bullet maps to a task — reconstruction → T3/T4, entities → T1, provenance labels → T1, fixtures → reused from 2a, cross-check → T5.
- **Purity:** every `domain/reconstruction/` file has no imports from `@lib/*`, `@features/*`, `@app/*`. Only `@entities/*` and other `@domain/*`. Verified by the boundaries lint rule.
- **Oracle first:** the PnL cross-check (T5) is the gate. If it fails on real data, Task 3 has a bug. The presence of this test is the reason we can trust the reconstruction output for Sessions 4+.
- **Edge cases deferred, not ignored:** liquidations, oversized closes, and funding are all documented in BACKLOG with reasons — the engine throws loudly on them rather than silently mis-classifying.
