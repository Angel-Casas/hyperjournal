# Session 8a — Filter panel implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 5-dimension filtering on `/w/:address` (date range / coin / side / status / outcome), with URL search params as the single source of truth, a Radix Sheet drawer for the controls, and an active-filter chip strip above the metrics grid.

**Architecture:** Pure-domain `applyFilters(trades, FilterState)` runs at the route level inside `WalletView`. URL is parsed via Zod into a typed `FilterState`; live-apply (`replace`-mode `setSearchParams`) on every control change. Garbage params silently fall back to defaults. Uniform pre-filter feeds all four data surfaces — no surface-specific filter logic.

**Tech Stack:** TypeScript strict, React, react-router v6 (`useSearchParams`), Zod, Tailwind, Vitest + RTL, Playwright. Adds `@radix-ui/react-dialog` (first Radix primitive in the project; in-stack per CLAUDE.md §2).

**Spec:** `docs/superpowers/specs/2026-04-28-session-8a-filters-design.md`.

---

## Phases & Checkpoints

The plan is structured in 7 phases. Each phase ends with a natural checkpoint where the implementer can pause, run the gauntlet, and reset context.

- **Phase 1** — Pure domain (T1–T3)
- **Phase 2** — URL validation (T4–T5)
- **Phase 3** — UI primitives (T6–T7)
- **Phase 4** — Filter UI components (T8–T9)
- **Phase 5** — Wallet integration (T10–T12)
- **Phase 6** — E2E + final gauntlet (T13–T14)
- **Phase 7** — Documentation (T15)

**Test counts (running totals):**
- Start: 428 unit / 17 E2E.
- Target end: ~490 unit / 20 E2E.

---

# Phase 1 — Pure domain (T1–T3)

---

### Task 1: `FilterState` type, defaults, predicates, immutable updaters

**Files:**
- Create: `src/domain/filters/filterState.ts`
- Create: `src/domain/filters/filterState.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/filters/filterState.test.ts
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FILTER_STATE,
  isDefault,
  countActive,
  setCoin,
  setSide,
  setStatus,
  setOutcome,
  setDateRangePreset,
  setCustomDateRange,
  type FilterState,
} from './filterState';
import type { YYYYMMDD } from '@domain/dates/isValidDateString';

const asDate = (s: string) => s as YYYYMMDD;

describe('isDefault', () => {
  it('returns true for DEFAULT_FILTER_STATE', () => {
    expect(isDefault(DEFAULT_FILTER_STATE)).toBe(true);
  });

  it('returns false when any dimension differs', () => {
    expect(isDefault(setCoin(DEFAULT_FILTER_STATE, 'BTC'))).toBe(false);
    expect(isDefault(setSide(DEFAULT_FILTER_STATE, 'long'))).toBe(false);
    expect(isDefault(setStatus(DEFAULT_FILTER_STATE, 'closed'))).toBe(false);
    expect(isDefault(setOutcome(DEFAULT_FILTER_STATE, 'winner'))).toBe(false);
    expect(isDefault(setDateRangePreset(DEFAULT_FILTER_STATE, '30d'))).toBe(false);
  });
});

describe('countActive', () => {
  it('returns 0 for default', () => {
    expect(countActive(DEFAULT_FILTER_STATE)).toBe(0);
  });

  it('counts each non-default dimension', () => {
    let s = setCoin(DEFAULT_FILTER_STATE, 'BTC');
    expect(countActive(s)).toBe(1);
    s = setSide(s, 'long');
    expect(countActive(s)).toBe(2);
    s = setDateRangePreset(s, '30d');
    expect(countActive(s)).toBe(3);
    s = setStatus(s, 'closed');
    s = setOutcome(s, 'winner');
    expect(countActive(s)).toBe(5);
  });
});

describe('setters are immutable', () => {
  it('setCoin returns a new object and only changes coin', () => {
    const next = setCoin(DEFAULT_FILTER_STATE, 'BTC');
    expect(next).not.toBe(DEFAULT_FILTER_STATE);
    expect(next.coin).toBe('BTC');
    expect(next.side).toBe(DEFAULT_FILTER_STATE.side);
  });

  it('setCustomDateRange switches kind to custom', () => {
    const next = setCustomDateRange(DEFAULT_FILTER_STATE, asDate('2026-01-01'), asDate('2026-04-28'));
    expect(next.dateRange).toEqual({
      kind: 'custom',
      from: '2026-01-01',
      to: '2026-04-28',
    });
  });

  it('setDateRangePreset switches kind to preset', () => {
    const custom = setCustomDateRange(DEFAULT_FILTER_STATE, asDate('2026-01-01'), asDate('2026-04-28'));
    const preset = setDateRangePreset(custom, '30d');
    expect(preset.dateRange).toEqual({ kind: 'preset', preset: '30d' });
  });
});

describe('FilterState type narrowing', () => {
  it('discriminates dateRange.kind', () => {
    const s: FilterState = setCustomDateRange(DEFAULT_FILTER_STATE, asDate('2026-01-01'), asDate('2026-04-28'));
    if (s.dateRange.kind === 'custom') {
      // TS narrowing test — both are accessible only inside this branch
      expect(s.dateRange.from).toBe('2026-01-01');
      expect(s.dateRange.to).toBe('2026-04-28');
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/domain/filters/filterState.test.ts
```

Expected: FAIL with "Cannot find module './filterState'".

- [ ] **Step 3: Write the implementation**

```ts
// src/domain/filters/filterState.ts
import type { YYYYMMDD } from '@domain/dates/isValidDateString';

export type DateRangePreset = '7d' | '30d' | '90d' | '1y' | 'all';
export type Side = 'all' | 'long' | 'short';
export type Status = 'all' | 'closed' | 'open';
export type Outcome = 'all' | 'winner' | 'loser';

export type DateRange =
  | { kind: 'preset'; preset: DateRangePreset }
  | { kind: 'custom'; from: YYYYMMDD; to: YYYYMMDD };

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

export function isDefault(state: FilterState): boolean {
  return (
    state.coin === null &&
    state.side === 'all' &&
    state.status === 'all' &&
    state.outcome === 'all' &&
    state.dateRange.kind === 'preset' &&
    state.dateRange.preset === 'all'
  );
}

export function countActive(state: FilterState): number {
  let n = 0;
  if (state.coin !== null) n++;
  if (state.side !== 'all') n++;
  if (state.status !== 'all') n++;
  if (state.outcome !== 'all') n++;
  const dr = state.dateRange;
  if (dr.kind === 'custom' || (dr.kind === 'preset' && dr.preset !== 'all')) n++;
  return n;
}

export function setCoin(state: FilterState, coin: string | null): FilterState {
  return { ...state, coin };
}

export function setSide(state: FilterState, side: Side): FilterState {
  return { ...state, side };
}

export function setStatus(state: FilterState, status: Status): FilterState {
  return { ...state, status };
}

export function setOutcome(state: FilterState, outcome: Outcome): FilterState {
  return { ...state, outcome };
}

export function setDateRangePreset(
  state: FilterState,
  preset: DateRangePreset,
): FilterState {
  return { ...state, dateRange: { kind: 'preset', preset } };
}

export function setCustomDateRange(
  state: FilterState,
  from: YYYYMMDD,
  to: YYYYMMDD,
): FilterState {
  return { ...state, dateRange: { kind: 'custom', from, to } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/domain/filters/filterState.test.ts
```

Expected: PASS — 8+ assertions across 4 describe blocks.

- [ ] **Step 5: Commit**

```bash
git add src/domain/filters/filterState.ts src/domain/filters/filterState.test.ts
git commit -m "$(cat <<'EOF'
feat(domain/filters): add FilterState + immutable updaters

Discriminated union for dateRange (preset | custom). Pure helpers
isDefault / countActive plus per-dimension setters. FilterState is
the typed in-memory shape; URL parse/serialize lands in T4/T5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `resolveDateRange` — preset → ms boundaries

**Files:**
- Create: `src/domain/filters/resolveDateRange.ts`
- Create: `src/domain/filters/resolveDateRange.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/filters/resolveDateRange.test.ts
import { describe, it, expect } from 'vitest';
import { resolveDateRange } from './resolveDateRange';
import type { YYYYMMDD } from '@domain/dates/isValidDateString';

const asDate = (s: string) => s as YYYYMMDD;
const NOW = Date.UTC(2026, 3, 28, 12, 0, 0); // 2026-04-28T12:00:00Z
const DAY_MS = 24 * 60 * 60 * 1000;

describe('resolveDateRange', () => {
  it('resolves preset "all" to (-Infinity, +Infinity)', () => {
    const r = resolveDateRange({ kind: 'preset', preset: 'all' }, NOW);
    expect(r.fromMs).toBe(-Infinity);
    expect(r.toMs).toBe(Infinity);
  });

  it('resolves preset "7d" to (now - 7 days, now)', () => {
    const r = resolveDateRange({ kind: 'preset', preset: '7d' }, NOW);
    expect(r.fromMs).toBe(NOW - 7 * DAY_MS);
    expect(r.toMs).toBe(NOW);
  });

  it('resolves preset "30d" to (now - 30 days, now)', () => {
    const r = resolveDateRange({ kind: 'preset', preset: '30d' }, NOW);
    expect(r.fromMs).toBe(NOW - 30 * DAY_MS);
    expect(r.toMs).toBe(NOW);
  });

  it('resolves preset "90d" to (now - 90 days, now)', () => {
    const r = resolveDateRange({ kind: 'preset', preset: '90d' }, NOW);
    expect(r.fromMs).toBe(NOW - 90 * DAY_MS);
    expect(r.toMs).toBe(NOW);
  });

  it('resolves preset "1y" to (now - 365 days, now)', () => {
    const r = resolveDateRange({ kind: 'preset', preset: '1y' }, NOW);
    expect(r.fromMs).toBe(NOW - 365 * DAY_MS);
    expect(r.toMs).toBe(NOW);
  });

  it('resolves custom range to UTC midnight from / end-of-day-exclusive to', () => {
    const r = resolveDateRange(
      { kind: 'custom', from: asDate('2026-01-01'), to: asDate('2026-04-28') },
      NOW,
    );
    expect(r.fromMs).toBe(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
    // to is exclusive end-of-day → next day's midnight
    expect(r.toMs).toBe(Date.UTC(2026, 3, 29, 0, 0, 0, 0));
  });

  it('handles same-day custom range (one full UTC day)', () => {
    const r = resolveDateRange(
      { kind: 'custom', from: asDate('2026-04-28'), to: asDate('2026-04-28') },
      NOW,
    );
    expect(r.toMs - r.fromMs).toBe(DAY_MS);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/domain/filters/resolveDateRange.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the implementation**

```ts
// src/domain/filters/resolveDateRange.ts
import type { DateRange } from './filterState';

const DAY_MS = 24 * 60 * 60 * 1000;

const PRESET_DAYS: Record<'7d' | '30d' | '90d' | '1y', number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
};

export function resolveDateRange(
  dateRange: DateRange,
  now: number,
): { fromMs: number; toMs: number } {
  if (dateRange.kind === 'preset') {
    if (dateRange.preset === 'all') {
      return { fromMs: -Infinity, toMs: Infinity };
    }
    const days = PRESET_DAYS[dateRange.preset];
    return { fromMs: now - days * DAY_MS, toMs: now };
  }
  // custom — parse YYYY-MM-DD as UTC midnight, end is exclusive next-day-midnight
  const fromMs = parseUtcMidnight(dateRange.from);
  const toMs = parseUtcMidnight(dateRange.to) + DAY_MS;
  return { fromMs, toMs };
}

function parseUtcMidnight(yyyymmdd: string): number {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!, 0, 0, 0, 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/domain/filters/resolveDateRange.test.ts
```

Expected: PASS — 7 assertions.

- [ ] **Step 5: Commit**

```bash
git add src/domain/filters/resolveDateRange.ts src/domain/filters/resolveDateRange.test.ts
git commit -m "$(cat <<'EOF'
feat(domain/filters): add resolveDateRange

Preset (7d / 30d / 90d / 1y / all) and custom (UTC-midnight, end-of-day
exclusive) → { fromMs, toMs } half-open interval. now is injectable.
Used by applyFilters in T3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `applyFilters` + per-dimension predicates

**Files:**
- Create: `src/domain/filters/applyFilters.ts`
- Create: `src/domain/filters/applyFilters.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/filters/applyFilters.test.ts
import { describe, it, expect } from 'vitest';
import { applyFilters } from './applyFilters';
import {
  DEFAULT_FILTER_STATE,
  setCoin,
  setSide,
  setStatus,
  setOutcome,
  setDateRangePreset,
  setCustomDateRange,
} from './filterState';
import type { ReconstructedTrade } from '@entities/trade';
import type { YYYYMMDD } from '@domain/dates/isValidDateString';

const asDate = (s: string) => s as YYYYMMDD;
const NOW = Date.UTC(2026, 3, 28, 12, 0, 0); // 2026-04-28T12:00:00Z
const DAY_MS = 24 * 60 * 60 * 1000;

function mkTrade(overrides: Partial<ReconstructedTrade> = {}): ReconstructedTrade {
  return {
    id: overrides.id ?? 'trade-1',
    wallet: null,
    coin: overrides.coin ?? 'BTC',
    side: overrides.side ?? 'long',
    status: overrides.status ?? 'closed',
    legs: [],
    openedAt: overrides.openedAt ?? NOW - 5 * DAY_MS,
    closedAt: overrides.closedAt ?? NOW - 5 * DAY_MS,
    holdTimeMs: 0,
    openedSize: 1,
    closedSize: 1,
    avgEntryPx: 100,
    avgExitPx: 110,
    realizedPnl: overrides.realizedPnl ?? 10,
    totalFees: 0,
    provenance: 'observed',
    ...overrides,
  } as ReconstructedTrade;
}

describe('applyFilters short-circuit', () => {
  it('returns the original array when state is default', () => {
    const trades = [mkTrade(), mkTrade({ id: 'trade-2' })];
    const result = applyFilters(trades, DEFAULT_FILTER_STATE);
    expect(result).toBe(trades); // identity equality
  });
});

describe('coin filter', () => {
  it('keeps trades matching the selected coin', () => {
    const trades = [
      mkTrade({ id: 'btc', coin: 'BTC' }),
      mkTrade({ id: 'eth', coin: 'ETH' }),
    ];
    const state = setCoin(DEFAULT_FILTER_STATE, 'BTC');
    const result = applyFilters(trades, state);
    expect(result.map((t) => t.id)).toEqual(['btc']);
  });
});

describe('side filter', () => {
  it('keeps only long trades when side=long', () => {
    const trades = [
      mkTrade({ id: 'l', side: 'long' }),
      mkTrade({ id: 's', side: 'short' }),
    ];
    expect(applyFilters(trades, setSide(DEFAULT_FILTER_STATE, 'long')).map((t) => t.id)).toEqual(['l']);
    expect(applyFilters(trades, setSide(DEFAULT_FILTER_STATE, 'short')).map((t) => t.id)).toEqual(['s']);
  });
});

describe('status filter', () => {
  it('keeps only closed/open as configured', () => {
    const trades = [
      mkTrade({ id: 'c', status: 'closed' }),
      mkTrade({ id: 'o', status: 'open', realizedPnl: 0 }),
    ];
    expect(applyFilters(trades, setStatus(DEFAULT_FILTER_STATE, 'closed')).map((t) => t.id)).toEqual(['c']);
    expect(applyFilters(trades, setStatus(DEFAULT_FILTER_STATE, 'open')).map((t) => t.id)).toEqual(['o']);
  });
});

describe('outcome filter', () => {
  it('winner: closed + realizedPnl > 0', () => {
    const trades = [
      mkTrade({ id: 'win', status: 'closed', realizedPnl: 50 }),
      mkTrade({ id: 'loss', status: 'closed', realizedPnl: -50 }),
      mkTrade({ id: 'be', status: 'closed', realizedPnl: 0 }),
      mkTrade({ id: 'open', status: 'open', realizedPnl: 0 }),
    ];
    expect(applyFilters(trades, setOutcome(DEFAULT_FILTER_STATE, 'winner')).map((t) => t.id)).toEqual(['win']);
    expect(applyFilters(trades, setOutcome(DEFAULT_FILTER_STATE, 'loser')).map((t) => t.id)).toEqual(['loss']);
  });
});

describe('date range filter', () => {
  it('preset "7d" excludes trades older than 7 days', () => {
    const trades = [
      mkTrade({ id: 'recent', openedAt: NOW - 3 * DAY_MS }),
      mkTrade({ id: 'old', openedAt: NOW - 10 * DAY_MS }),
    ];
    const state = setDateRangePreset(DEFAULT_FILTER_STATE, '7d');
    const result = applyFilters(trades, state, { now: NOW });
    expect(result.map((t) => t.id)).toEqual(['recent']);
  });

  it('custom range is end-of-day inclusive', () => {
    const trades = [
      mkTrade({ id: 'in', openedAt: Date.UTC(2026, 3, 28, 23, 59, 0, 0) }),
      mkTrade({ id: 'out', openedAt: Date.UTC(2026, 3, 29, 0, 0, 1, 0) }),
    ];
    const state = setCustomDateRange(DEFAULT_FILTER_STATE, asDate('2026-04-28'), asDate('2026-04-28'));
    const result = applyFilters(trades, state, { now: NOW });
    expect(result.map((t) => t.id)).toEqual(['in']);
  });
});

describe('composition (AND)', () => {
  it('combines multiple filters as logical AND', () => {
    const trades = [
      mkTrade({ id: 'btc-long-win', coin: 'BTC', side: 'long', realizedPnl: 50 }),
      mkTrade({ id: 'btc-short-win', coin: 'BTC', side: 'short', realizedPnl: 50 }),
      mkTrade({ id: 'eth-long-win', coin: 'ETH', side: 'long', realizedPnl: 50 }),
      mkTrade({ id: 'btc-long-loss', coin: 'BTC', side: 'long', realizedPnl: -50 }),
    ];
    let state = setCoin(DEFAULT_FILTER_STATE, 'BTC');
    state = setSide(state, 'long');
    state = setOutcome(state, 'winner');
    expect(applyFilters(trades, state, { now: NOW }).map((t) => t.id)).toEqual(['btc-long-win']);
  });
});

describe('edge cases', () => {
  it('returns empty array on empty input', () => {
    expect(applyFilters([], setCoin(DEFAULT_FILTER_STATE, 'BTC'))).toEqual([]);
  });

  it('returns empty array when no trades match', () => {
    const trades = [mkTrade({ coin: 'BTC' })];
    const state = setCoin(DEFAULT_FILTER_STATE, 'ETH');
    expect(applyFilters(trades, state)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/domain/filters/applyFilters.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```ts
// src/domain/filters/applyFilters.ts
import { isDefault, type FilterState, type Side, type Status, type Outcome } from './filterState';
import { resolveDateRange } from './resolveDateRange';
import type { ReconstructedTrade } from '@entities/trade';

type Options = { now?: number };

export function applyFilters(
  trades: ReadonlyArray<ReconstructedTrade>,
  state: FilterState,
  options: Options = {},
): ReadonlyArray<ReconstructedTrade> {
  if (isDefault(state)) return trades;
  const { fromMs, toMs } = resolveDateRange(state.dateRange, options.now ?? Date.now());
  return trades.filter(
    (t) =>
      matchesDate(t, fromMs, toMs) &&
      matchesCoin(t, state.coin) &&
      matchesSide(t, state.side) &&
      matchesStatus(t, state.status) &&
      matchesOutcome(t, state.outcome),
  );
}

export function matchesDate(
  trade: ReconstructedTrade,
  fromMs: number,
  toMs: number,
): boolean {
  return trade.openedAt >= fromMs && trade.openedAt < toMs;
}

export function matchesCoin(
  trade: ReconstructedTrade,
  coin: string | null,
): boolean {
  return coin === null || trade.coin === coin;
}

export function matchesSide(trade: ReconstructedTrade, side: Side): boolean {
  return side === 'all' || trade.side === side;
}

export function matchesStatus(
  trade: ReconstructedTrade,
  status: Status,
): boolean {
  return status === 'all' || trade.status === status;
}

export function matchesOutcome(
  trade: ReconstructedTrade,
  outcome: Outcome,
): boolean {
  if (outcome === 'all') return true;
  if (trade.status !== 'closed') return false;
  if (outcome === 'winner') return trade.realizedPnl > 0;
  return trade.realizedPnl < 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/domain/filters/applyFilters.test.ts
```

Expected: PASS — ~12 assertions.

- [ ] **Step 5: Verify domain coverage stays ≥ 90%**

```bash
pnpm test:coverage --run -- src/domain/filters/
```

Expected: every file in `src/domain/filters/**` ≥ 90% lines / branches / functions / statements.

- [ ] **Step 6: Commit**

```bash
git add src/domain/filters/applyFilters.ts src/domain/filters/applyFilters.test.ts
git commit -m "$(cat <<'EOF'
feat(domain/filters): add applyFilters

Composes per-dimension predicates (matchesDate / matchesCoin /
matchesSide / matchesStatus / matchesOutcome) as a logical AND. Pure
domain function, identity-returns the input when state is default
(short-circuit for the common no-filter case). All predicates exported
for direct testing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Checkpoint 1 — Phase 1 complete.** Pure domain layer is image-free, well-tested, and coverage holds.

---

# Phase 2 — URL validation (T4–T5)

---

### Task 4: `parseFilterStateFromSearchParams`

**Files:**
- Create: `src/lib/validation/filterState.ts`
- Create: `src/lib/validation/filterState.test.ts`

- [ ] **Step 1: Write the failing tests for parse**

```ts
// src/lib/validation/filterState.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseFilterStateFromSearchParams,
  serializeFilterStateToSearchParams,
} from './filterState';
import {
  DEFAULT_FILTER_STATE,
  setCoin,
  setSide,
  setStatus,
  setOutcome,
  setDateRangePreset,
  setCustomDateRange,
  type FilterState,
} from '@domain/filters/filterState';
import type { YYYYMMDD } from '@domain/dates/isValidDateString';

const asDate = (s: string) => s as YYYYMMDD;
const sp = (init: string) => new URLSearchParams(init);

describe('parseFilterStateFromSearchParams', () => {
  it('returns DEFAULT_FILTER_STATE for empty params', () => {
    expect(parseFilterStateFromSearchParams(sp(''))).toEqual(DEFAULT_FILTER_STATE);
  });

  it('parses coin', () => {
    expect(parseFilterStateFromSearchParams(sp('coin=BTC'))).toEqual(setCoin(DEFAULT_FILTER_STATE, 'BTC'));
  });

  it('parses side', () => {
    expect(parseFilterStateFromSearchParams(sp('side=long'))).toEqual(setSide(DEFAULT_FILTER_STATE, 'long'));
  });

  it('parses status', () => {
    expect(parseFilterStateFromSearchParams(sp('status=closed'))).toEqual(setStatus(DEFAULT_FILTER_STATE, 'closed'));
  });

  it('parses outcome', () => {
    expect(parseFilterStateFromSearchParams(sp('outcome=winner'))).toEqual(setOutcome(DEFAULT_FILTER_STATE, 'winner'));
  });

  it('parses preset', () => {
    expect(parseFilterStateFromSearchParams(sp('range=30d'))).toEqual(setDateRangePreset(DEFAULT_FILTER_STATE, '30d'));
  });

  it('parses custom range', () => {
    expect(parseFilterStateFromSearchParams(sp('from=2026-01-01&to=2026-04-28'))).toEqual(
      setCustomDateRange(DEFAULT_FILTER_STATE, asDate('2026-01-01'), asDate('2026-04-28')),
    );
  });

  it('custom wins over preset when both present', () => {
    const result = parseFilterStateFromSearchParams(sp('range=30d&from=2026-01-01&to=2026-04-28'));
    expect(result.dateRange).toEqual({ kind: 'custom', from: '2026-01-01', to: '2026-04-28' });
  });

  it('falls back to preset when custom is incomplete', () => {
    const result = parseFilterStateFromSearchParams(sp('range=30d&from=2026-01-01'));
    expect(result.dateRange).toEqual({ kind: 'preset', preset: '30d' });
  });

  it('garbage params silently default per-dimension', () => {
    const result = parseFilterStateFromSearchParams(sp('coin=&side=garbage&status=closed&outcome=&range=zzz'));
    // Empty/garbage dims default; valid (status=closed) survives
    expect(result.coin).toBeNull();
    expect(result.side).toBe('all');
    expect(result.status).toBe('closed');
    expect(result.outcome).toBe('all');
    expect(result.dateRange).toEqual({ kind: 'preset', preset: 'all' });
  });

  it('combines multiple valid params', () => {
    const result = parseFilterStateFromSearchParams(sp('coin=BTC&side=long&status=closed'));
    expect(result.coin).toBe('BTC');
    expect(result.side).toBe('long');
    expect(result.status).toBe('closed');
  });
});
```

- [ ] **Step 2: Write the failing tests for serialize**

Add to the same test file:

```ts
describe('serializeFilterStateToSearchParams', () => {
  it('default state produces empty params', () => {
    const params = serializeFilterStateToSearchParams(DEFAULT_FILTER_STATE);
    expect(params.toString()).toBe('');
  });

  it('non-default values appear', () => {
    let s: FilterState = setCoin(DEFAULT_FILTER_STATE, 'BTC');
    s = setSide(s, 'long');
    const params = serializeFilterStateToSearchParams(s);
    expect(params.get('coin')).toBe('BTC');
    expect(params.get('side')).toBe('long');
    expect(params.get('status')).toBeNull();
    expect(params.get('outcome')).toBeNull();
    expect(params.get('range')).toBeNull();
  });

  it('preset "all" is omitted', () => {
    const params = serializeFilterStateToSearchParams(setDateRangePreset(DEFAULT_FILTER_STATE, 'all'));
    expect(params.get('range')).toBeNull();
  });

  it('custom range emits from + to (no range)', () => {
    const s = setCustomDateRange(DEFAULT_FILTER_STATE, asDate('2026-01-01'), asDate('2026-04-28'));
    const params = serializeFilterStateToSearchParams(s);
    expect(params.get('from')).toBe('2026-01-01');
    expect(params.get('to')).toBe('2026-04-28');
    expect(params.get('range')).toBeNull();
  });
});

describe('round-trip identity', () => {
  it.each<FilterState>([
    DEFAULT_FILTER_STATE,
    setCoin(DEFAULT_FILTER_STATE, 'BTC'),
    setSide(DEFAULT_FILTER_STATE, 'long'),
    setStatus(DEFAULT_FILTER_STATE, 'closed'),
    setOutcome(DEFAULT_FILTER_STATE, 'winner'),
    setDateRangePreset(DEFAULT_FILTER_STATE, '30d'),
    setCustomDateRange(DEFAULT_FILTER_STATE, asDate('2026-01-01'), asDate('2026-04-28')),
  ])('parse(serialize(state)) === state', (state) => {
    const params = serializeFilterStateToSearchParams(state);
    const round = parseFilterStateFromSearchParams(params);
    expect(round).toEqual(state);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm vitest run src/lib/validation/filterState.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Write the implementation**

```ts
// src/lib/validation/filterState.ts
import { z } from 'zod';
import {
  DEFAULT_FILTER_STATE,
  type DateRangePreset,
  type FilterState,
  type Outcome,
  type Side,
  type Status,
} from '@domain/filters/filterState';
import { isValidDateString, type YYYYMMDD } from '@domain/dates/isValidDateString';

const PresetSchema = z.enum(['7d', '30d', '90d', '1y']);
const SideSchema = z.enum(['long', 'short']);
const StatusSchema = z.enum(['closed', 'open']);
const OutcomeSchema = z.enum(['winner', 'loser']);

export function parseFilterStateFromSearchParams(
  params: URLSearchParams,
): FilterState {
  const coin = parseCoin(params.get('coin'));
  const side = parseEnumOr(params.get('side'), SideSchema, 'all') as Side;
  const status = parseEnumOr(params.get('status'), StatusSchema, 'all') as Status;
  const outcome = parseEnumOr(params.get('outcome'), OutcomeSchema, 'all') as Outcome;
  const dateRange = parseDateRange(params);

  return { coin, side, status, outcome, dateRange };
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

function parseDateRange(params: URLSearchParams): FilterState['dateRange'] {
  // Custom wins over preset when both valid.
  const from = params.get('from');
  const to = params.get('to');
  if (from && to && isValidDateString(from) && isValidDateString(to)) {
    return { kind: 'custom', from: from as YYYYMMDD, to: to as YYYYMMDD };
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
  return params;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm vitest run src/lib/validation/filterState.test.ts
```

Expected: PASS — ~16 assertions across 3 describe blocks (parse, serialize, round-trip).

- [ ] **Step 6: Commit**

```bash
git add src/lib/validation/filterState.ts src/lib/validation/filterState.test.ts
git commit -m "$(cat <<'EOF'
feat(validation): add filter-state URL parse/serialize

Round-trip-stable URLSearchParams ↔ FilterState. Garbage params
silently default per-dimension; custom range wins over preset when
both present; default state produces zero params. All five filter
dimensions plus the preset-vs-custom date discriminator.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Checkpoint 2 — Phase 2 complete.** URL is now safely round-trippable to FilterState.

---

# Phase 3 — UI primitives (T6–T7)

---

### Task 6: ADR-0009 + add `@radix-ui/react-dialog` + `Sheet` primitive

**Files:**
- Modify: `docs/DECISIONS.md`
- Modify: `package.json` (via `pnpm add`)
- Create: `src/lib/ui/components/sheet.tsx`
- Create: `src/lib/ui/components/sheet.test.tsx`

- [ ] **Step 1: Write ADR-0009**

Append to `docs/DECISIONS.md` after the existing ADR-0008 section:

```markdown
## ADR-0009: Adopt `@radix-ui/react-dialog` for the Sheet/Drawer primitive

- **Date:** 2026-04-29
- **Status:** Accepted
- **Author:** Claude (phase-2 session 8a planning)

### Context

Session 8a needs a right-side drawer for the filter panel. The project's UI primitives so far (`button`, `input`, `label`, `metric-card`, `tag-input`, `tag-chip-list`) are hand-written in shadcn style but no Radix package is installed yet. CLAUDE.md §2 lists "shadcn/ui (Radix primitives)" as the approved stack — so a Radix dep is in-stack, but it is the first one and worth recording the choice for future readers (subsequent dialogs / popovers / dropdown menus / tooltips will reuse this pattern).

### Decision

Add `@radix-ui/react-dialog` and create a `Sheet` primitive at `src/lib/ui/components/sheet.tsx` — a thin shadcn-style wrapper exporting `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetClose` over `Dialog.Root` / `Dialog.Portal` / `Dialog.Overlay` / `Dialog.Content` / `Dialog.Close`. Position is right-side on desktop and bottom on small viewports; controlled via the `side` prop. No Framer Motion in 8a — Radix's CSS data-attributes drive the open/closed state and Tailwind `transition-transform` handles the slide animation.

### Alternatives considered

- **Hand-roll a custom drawer** — rejected: focus trap, scroll lock, escape-to-close, overlay click-out, portal mounting, and `aria-modal` semantics are 200+ LOC of fiddly accessibility work. Radix gives us all of it for free.
- **Headless UI** — rejected: would introduce a second component-primitive ecosystem alongside the shadcn convention CLAUDE.md §2 already pins.
- **Framer Motion `AnimatePresence` for the slide** — rejected for 8a: pure CSS transitions are sufficient and avoid coupling the primitive to Framer's animation lifecycle. Revisit if motion design wants spring physics.

### Consequences

- Easier: `Dialog`, `Popover`, `DropdownMenu`, `Tooltip` are now incremental adds (each is a new `@radix-ui/react-X` install + a thin wrapper file).
- Harder: Radix versions will need bumping over time; lockfile and peer-dep management are now part of the project's maintenance load.
- Invariant: the Sheet primitive stays presentation-only; it does not own filter state, drawer-open state, or any business logic. Consumers control `open` / `onOpenChange`.
```

- [ ] **Step 2: Add the Radix dialog dependency**

```bash
pnpm add @radix-ui/react-dialog
```

Expected: `package.json` gains `"@radix-ui/react-dialog": "^X.Y.Z"`; `pnpm-lock.yaml` updates.

- [ ] **Step 3: Write a smoke test for the Sheet primitive**

```tsx
// src/lib/ui/components/sheet.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from './sheet';

function Harness({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" aria-labelledby="title">
        <SheetHeader>
          <SheetTitle id="title">Filters</SheetTitle>
          <SheetClose>Close</SheetClose>
        </SheetHeader>
        <div>Body content</div>
      </SheetContent>
    </Sheet>
  );
}

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(<Harness initialOpen={false} />);
    expect(screen.queryByText('Body content')).toBeNull();
  });

  it('renders content when open', () => {
    render(<Harness initialOpen={true} />);
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('SheetTitle is the accessible name', () => {
    render(<Harness initialOpen={true} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Filters');
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
pnpm vitest run src/lib/ui/components/sheet.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 5: Write the Sheet primitive**

```tsx
// src/lib/ui/components/sheet.tsx
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@lib/ui/utils';

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetPortal = Dialog.Portal;
export const SheetClose = Dialog.Close;

const SheetOverlay = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Dialog.Overlay>
>(({ className, ...props }, ref) => (
  <Dialog.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-40 bg-bg-base/60 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=open]:fade-in-0',
      'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = 'SheetOverlay';

type SheetContentProps = ComponentPropsWithoutRef<typeof Dialog.Content> & {
  side?: 'right' | 'bottom';
};

export const SheetContent = forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, side = 'right', children, ...props }, ref) => (
    <SheetPortal>
      <SheetOverlay />
      <Dialog.Content
        ref={ref}
        className={cn(
          'fixed z-50 flex flex-col gap-4 border border-border bg-bg-raised p-6 shadow-lg',
          'transition-transform duration-200 ease-out',
          side === 'right' &&
            'inset-y-0 right-0 h-full w-full max-w-sm data-[state=closed]:translate-x-full data-[state=open]:translate-x-0',
          side === 'bottom' &&
            'inset-x-0 bottom-0 max-h-[90vh] w-full data-[state=closed]:translate-y-full data-[state=open]:translate-y-0',
          className,
        )}
        {...props}
      >
        {children}
      </Dialog.Content>
    </SheetPortal>
  ),
);
SheetContent.displayName = 'SheetContent';

export function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-between gap-2', className)}
      {...props}
    />
  );
}

export const SheetTitle = forwardRef<
  HTMLHeadingElement,
  ComponentPropsWithoutRef<typeof Dialog.Title>
>(({ className, ...props }, ref) => (
  <Dialog.Title
    ref={ref}
    className={cn('text-lg font-semibold text-fg-base', className)}
    {...props}
  />
));
SheetTitle.displayName = 'SheetTitle';

export const SheetDescription = forwardRef<
  HTMLParagraphElement,
  ComponentPropsWithoutRef<typeof Dialog.Description>
>(({ className, ...props }, ref) => (
  <Dialog.Description
    ref={ref}
    className={cn('text-sm text-fg-muted', className)}
    {...props}
  />
));
SheetDescription.displayName = 'SheetDescription';
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm vitest run src/lib/ui/components/sheet.test.tsx
```

Expected: PASS — 3 assertions.

- [ ] **Step 7: Commit**

```bash
git add docs/DECISIONS.md package.json pnpm-lock.yaml src/lib/ui/components/sheet.tsx src/lib/ui/components/sheet.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add Sheet primitive on @radix-ui/react-dialog

ADR-0009 records the choice — first Radix primitive in the project,
pinned by CLAUDE.md §2 stack. Sheet wraps Dialog with right-side and
bottom-edge variants, semantic Tailwind tokens, and Radix's built-in
focus trap, escape-to-close, overlay click-out, and aria-modal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `FilterChip` primitive

**Files:**
- Create: `src/lib/ui/components/filter-chip.tsx`
- Create: `src/lib/ui/components/filter-chip.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/lib/ui/components/filter-chip.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterChip } from './filter-chip';

describe('FilterChip', () => {
  it('renders the label', () => {
    render(<FilterChip label="BTC" onRemove={() => {}} ariaLabel="Remove coin filter" />);
    expect(screen.getByText('BTC')).toBeInTheDocument();
  });

  it('calls onRemove when the X is clicked', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<FilterChip label="BTC" onRemove={onRemove} ariaLabel="Remove coin filter" />);
    await user.click(screen.getByRole('button', { name: /remove coin filter/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('the X button has the supplied aria-label', () => {
    render(<FilterChip label="Long" onRemove={() => {}} ariaLabel="Remove side filter" />);
    expect(screen.getByRole('button', { name: 'Remove side filter' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/lib/ui/components/filter-chip.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```tsx
// src/lib/ui/components/filter-chip.tsx
import { cn } from '@lib/ui/utils';

type Props = {
  label: string;
  onRemove: () => void;
  ariaLabel: string;
  className?: string;
};

export function FilterChip({ label, onRemove, ariaLabel, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-bg-overlay px-2 py-0.5 text-xs text-fg-base',
        className,
      )}
    >
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={ariaLabel}
        className="rounded-full p-0.5 text-fg-muted ring-offset-bg-base hover:bg-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="h-3 w-3"
        >
          <path d="M18 6L6 18" />
          <path d="M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/lib/ui/components/filter-chip.test.tsx
```

Expected: PASS — 3 assertions.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/components/filter-chip.tsx src/lib/ui/components/filter-chip.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add FilterChip primitive

Clickable chip with an inline X button + aria-label; styled to match
the existing tag-chip-list visual language but with click affordance.
Used by ActiveFilterChips (T9) for one-chip-per-active-dimension.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Checkpoint 3 — Phase 3 complete.** UI primitives (Sheet, FilterChip) are ready.

---

# Phase 4 — Filter UI components (T8–T9)

---

### Task 8: `FiltersDrawer`

**Files:**
- Create: `src/features/wallets/components/FiltersDrawer.tsx`
- Create: `src/features/wallets/components/FiltersDrawer.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/wallets/components/FiltersDrawer.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FiltersDrawer } from './FiltersDrawer';
import {
  DEFAULT_FILTER_STATE,
  setCoin,
  setSide,
} from '@domain/filters/filterState';

const COINS = ['BTC', 'ETH', 'SOL'];

describe('FiltersDrawer', () => {
  it('renders the title and the 5 control sections when open', () => {
    render(
      <FiltersDrawer
        open={true}
        onOpenChange={() => {}}
        state={DEFAULT_FILTER_STATE}
        onChange={() => {}}
        availableCoins={COINS}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByText('Date range')).toBeInTheDocument();
    expect(screen.getByText('Coin')).toBeInTheDocument();
    expect(screen.getByText('Side')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Outcome')).toBeInTheDocument();
  });

  it('selecting a date preset updates state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FiltersDrawer
        open={true}
        onOpenChange={() => {}}
        state={DEFAULT_FILTER_STATE}
        onChange={onChange}
        availableCoins={COINS}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Last 30 days' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ dateRange: { kind: 'preset', preset: '30d' } }),
    );
  });

  it('selecting a coin updates state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FiltersDrawer
        open={true}
        onOpenChange={() => {}}
        state={DEFAULT_FILTER_STATE}
        onChange={onChange}
        availableCoins={COINS}
      />,
    );
    await user.selectOptions(screen.getByLabelText(/^coin$/i), 'BTC');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ coin: 'BTC' }),
    );
  });

  it('toggling Side: Long updates state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FiltersDrawer
        open={true}
        onOpenChange={() => {}}
        state={DEFAULT_FILTER_STATE}
        onChange={onChange}
        availableCoins={COINS}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Long' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ side: 'long' }),
    );
  });

  it('Clear all is disabled when state is default', () => {
    render(
      <FiltersDrawer
        open={true}
        onOpenChange={() => {}}
        state={DEFAULT_FILTER_STATE}
        onChange={() => {}}
        availableCoins={COINS}
      />,
    );
    expect(screen.getByRole('button', { name: /clear all/i })).toBeDisabled();
  });

  it('Clear all is enabled and resets to default when active', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const active = setSide(setCoin(DEFAULT_FILTER_STATE, 'BTC'), 'long');
    render(
      <FiltersDrawer
        open={true}
        onOpenChange={() => {}}
        state={active}
        onChange={onChange}
        availableCoins={COINS}
      />,
    );
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_FILTER_STATE);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/features/wallets/components/FiltersDrawer.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```tsx
// src/features/wallets/components/FiltersDrawer.tsx
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@lib/ui/components/sheet';
import { Button } from '@lib/ui/components/button';
import {
  DEFAULT_FILTER_STATE,
  isDefault,
  setCoin,
  setCustomDateRange,
  setDateRangePreset,
  setOutcome,
  setSide,
  setStatus,
  type DateRangePreset,
  type FilterState,
  type Outcome,
  type Side,
  type Status,
} from '@domain/filters/filterState';
import { isValidDateString, type YYYYMMDD } from '@domain/dates/isValidDateString';
import { cn } from '@lib/ui/utils';

type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  state: FilterState;
  onChange: (next: FilterState) => void;
  availableCoins: ReadonlyArray<string>;
};

const PRESET_LABELS: Record<DateRangePreset, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '1y': 'Last year',
  all: 'All time',
};

const PRESETS: ReadonlyArray<DateRangePreset> = ['7d', '30d', '90d', '1y', 'all'];

export function FiltersDrawer({
  open,
  onOpenChange,
  state,
  onChange,
  availableCoins,
}: Props) {
  const isCustom = state.dateRange.kind === 'custom';
  const customFrom = isCustom ? state.dateRange.from : '';
  const customTo = isCustom ? state.dateRange.to : '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isDefault(state)}
              onClick={() => onChange(DEFAULT_FILTER_STATE)}
            >
              Clear all
            </Button>
            <SheetClose
              className="rounded-md p-1 text-fg-muted ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              aria-label="Close filters"
            >
              ✕
            </SheetClose>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-4 overflow-y-auto">
          <Section heading="Date range">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <PresetButton
                  key={p}
                  active={
                    state.dateRange.kind === 'preset' &&
                    state.dateRange.preset === p
                  }
                  onClick={() => onChange(setDateRangePreset(state, p))}
                >
                  {PRESET_LABELS[p]}
                </PresetButton>
              ))}
              <PresetButton
                active={isCustom}
                onClick={() => {
                  // Default custom range: today as both from and to
                  const today = new Date().toISOString().slice(0, 10);
                  onChange(
                    setCustomDateRange(state, today as YYYYMMDD, today as YYYYMMDD),
                  );
                }}
              >
                Custom…
              </PresetButton>
            </div>
            {isCustom && (
              <div className="mt-3 flex items-center gap-3">
                <label className="flex flex-col gap-1 text-xs text-fg-muted">
                  From
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (isValidDateString(v)) {
                        onChange(
                          setCustomDateRange(state, v, customTo as YYYYMMDD),
                        );
                      }
                    }}
                    className="rounded-md border border-border bg-bg-overlay px-2 py-1 text-sm text-fg-base"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-fg-muted">
                  To
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (isValidDateString(v)) {
                        onChange(
                          setCustomDateRange(state, customFrom as YYYYMMDD, v),
                        );
                      }
                    }}
                    className="rounded-md border border-border bg-bg-overlay px-2 py-1 text-sm text-fg-base"
                  />
                </label>
              </div>
            )}
          </Section>

          <Section heading="Coin">
            <label htmlFor="filter-coin" className="sr-only">
              Coin
            </label>
            <select
              id="filter-coin"
              value={state.coin ?? ''}
              onChange={(e) =>
                onChange(setCoin(state, e.target.value === '' ? null : e.target.value))
              }
              className="w-full rounded-md border border-border bg-bg-overlay px-3 py-1.5 text-sm text-fg-base"
            >
              <option value="">All coins</option>
              {availableCoins.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Section>

          <Section heading="Side">
            <SegmentedControl<Side>
              ariaLabel="Filter by side"
              value={state.side}
              options={[
                { value: 'all', label: 'All' },
                { value: 'long', label: 'Long' },
                { value: 'short', label: 'Short' },
              ]}
              onChange={(v) => onChange(setSide(state, v))}
            />
          </Section>

          <Section heading="Status">
            <SegmentedControl<Status>
              ariaLabel="Filter by status"
              value={state.status}
              options={[
                { value: 'all', label: 'All' },
                { value: 'closed', label: 'Closed' },
                { value: 'open', label: 'Open' },
              ]}
              onChange={(v) => onChange(setStatus(state, v))}
            />
          </Section>

          <Section heading="Outcome">
            <SegmentedControl<Outcome>
              ariaLabel="Filter by outcome"
              value={state.outcome}
              options={[
                { value: 'all', label: 'All' },
                { value: 'winner', label: 'Winners' },
                { value: 'loser', label: 'Losers' },
              ]}
              onChange={(v) => onChange(setOutcome(state, v))}
            />
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-fg-base">{heading}</h3>
      {children}
    </section>
  );
}

function PresetButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        active
          ? 'border-accent bg-accent/20 text-fg-base'
          : 'border-border bg-bg-overlay text-fg-muted hover:text-fg-base',
      )}
    >
      {children}
    </button>
  );
}

type Option<T extends string> = { value: T; label: string };

function SegmentedControl<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: T;
  options: ReadonlyArray<Option<T>>;
  onChange: (next: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex rounded-md border border-border bg-bg-overlay p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex-1 rounded-md px-3 py-1 text-xs ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            value === opt.value
              ? 'bg-bg-raised text-fg-base shadow-sm'
              : 'text-fg-muted hover:text-fg-base',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/features/wallets/components/FiltersDrawer.test.tsx
```

Expected: PASS — 6 assertions.

- [ ] **Step 5: Commit**

```bash
git add src/features/wallets/components/FiltersDrawer.tsx src/features/wallets/components/FiltersDrawer.test.tsx
git commit -m "$(cat <<'EOF'
feat(wallets): add FiltersDrawer

Right-side Sheet with five stacked sections — date range presets +
custom range, coin select, side / status / outcome segmented controls.
Live-apply: every control update calls onChange(nextState). Clear all
disabled at default state. Inline subcomponents (Section, PresetButton,
SegmentedControl) keep the file focused.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `ActiveFilterChips`

**Files:**
- Create: `src/features/wallets/components/ActiveFilterChips.tsx`
- Create: `src/features/wallets/components/ActiveFilterChips.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/wallets/components/ActiveFilterChips.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActiveFilterChips } from './ActiveFilterChips';
import {
  DEFAULT_FILTER_STATE,
  setCoin,
  setSide,
  setDateRangePreset,
} from '@domain/filters/filterState';

describe('ActiveFilterChips', () => {
  it('renders nothing when state is default', () => {
    const { container } = render(
      <ActiveFilterChips state={DEFAULT_FILTER_STATE} onChange={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders one chip per active dimension', () => {
    let s = setCoin(DEFAULT_FILTER_STATE, 'BTC');
    s = setSide(s, 'long');
    s = setDateRangePreset(s, '30d');
    render(<ActiveFilterChips state={s} onChange={() => {}} />);
    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.getByText('Long')).toBeInTheDocument();
    expect(screen.getByText('Last 30 days')).toBeInTheDocument();
  });

  it('chip X removes only that dimension', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    let s = setCoin(DEFAULT_FILTER_STATE, 'BTC');
    s = setSide(s, 'long');
    render(<ActiveFilterChips state={s} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Remove coin filter' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ coin: null, side: 'long' }),
    );
  });

  it('Clear all resets to default', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const s = setCoin(DEFAULT_FILTER_STATE, 'BTC');
    render(<ActiveFilterChips state={s} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_FILTER_STATE);
  });

  it('custom date range chip shows from – to label', () => {
    const s = {
      ...DEFAULT_FILTER_STATE,
      dateRange: { kind: 'custom' as const, from: '2026-01-01' as YYYYMMDD, to: '2026-04-28' as YYYYMMDD },
    };
    render(<ActiveFilterChips state={s} onChange={() => {}} />);
    expect(screen.getByText('2026-01-01 – 2026-04-28')).toBeInTheDocument();
  });
});

import type { YYYYMMDD } from '@domain/dates/isValidDateString';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/features/wallets/components/ActiveFilterChips.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```tsx
// src/features/wallets/components/ActiveFilterChips.tsx
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

const SIDE_LABELS = { all: 'All', long: 'Long', short: 'Short' };
const STATUS_LABELS = { all: 'All', closed: 'Closed', open: 'Open' };
const OUTCOME_LABELS = { all: 'All', winner: 'Winners', loser: 'Losers' };

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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/features/wallets/components/ActiveFilterChips.test.tsx
```

Expected: PASS — 5 assertions.

- [ ] **Step 5: Commit**

```bash
git add src/features/wallets/components/ActiveFilterChips.tsx src/features/wallets/components/ActiveFilterChips.test.tsx
git commit -m "$(cat <<'EOF'
feat(wallets): add ActiveFilterChips

Renders one FilterChip per non-default filter dimension above the
metrics grid. Each chip's X resets that dimension; Clear all link
resets the whole state. Returns null when state is default. Custom
date range chip shows "from – to" label.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Checkpoint 4 — Phase 4 complete.** Filter UI is buildable in isolation. Phase 5 wires it.

---

# Phase 5 — Wallet integration (T10–T12)

---

### Task 10: `WalletHeader` extension — Filters button + count badge

**Files:**
- Modify: `src/features/wallets/components/WalletHeader.tsx`
- Modify: `src/features/wallets/components/WalletHeader.test.tsx`

- [ ] **Step 1: Add the new test cases**

Append to `WalletHeader.test.tsx`:

```tsx
describe('WalletHeader filter button', () => {
  it('renders Filters button without badge when filterCount is 0', () => {
    render(
      <MemoryRouter>
        <WalletHeader
          address={ADDR}
          isFetching={false}
          onRefresh={() => {}}
          onOpenFilters={() => {}}
          filterCount={0}
        />
      </MemoryRouter>,
    );
    const btn = screen.getByRole('button', { name: /filters/i });
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).not.toMatch(/\d/);
  });

  it('shows the count badge when filterCount > 0', () => {
    render(
      <MemoryRouter>
        <WalletHeader
          address={ADDR}
          isFetching={false}
          onRefresh={() => {}}
          onOpenFilters={() => {}}
          filterCount={3}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /filters/i })).toHaveTextContent('3');
  });

  it('clicking Filters calls onOpenFilters', async () => {
    const user = userEvent.setup();
    const onOpenFilters = vi.fn();
    render(
      <MemoryRouter>
        <WalletHeader
          address={ADDR}
          isFetching={false}
          onRefresh={() => {}}
          onOpenFilters={onOpenFilters}
          filterCount={0}
        />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /filters/i }));
    expect(onOpenFilters).toHaveBeenCalled();
  });
});
```

(Existing imports `import { vi } from 'vitest'` and `import userEvent from '@testing-library/user-event'` should already be present; add if missing.)

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
pnpm vitest run src/features/wallets/components/WalletHeader.test.tsx
```

Expected: FAIL — 3 new tests fail because props don't exist.

- [ ] **Step 3: Update `WalletHeader.tsx`**

```tsx
// src/features/wallets/components/WalletHeader.tsx
import { Link } from 'react-router-dom';
import type { WalletAddress } from '@entities/wallet';
import { Button } from '@lib/ui/components/button';
import { cn } from '@lib/ui/utils';

type Props = {
  address: WalletAddress;
  isFetching: boolean;
  onRefresh: () => void;
  onOpenFilters: () => void;
  filterCount: number;
};

export function WalletHeader({
  address,
  isFetching,
  onRefresh,
  onOpenFilters,
  filterCount,
}: Props) {
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
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenFilters}
          aria-label={
            filterCount > 0 ? `Filters (${filterCount} active)` : 'Filters'
          }
        >
          Filters
          {filterCount > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent/20 px-1.5 text-xs font-semibold text-fg-base">
              {filterCount}
            </span>
          )}
        </Button>
        <Link
          to="/settings"
          className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Settings
        </Link>
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

- [ ] **Step 4: Update existing `WalletHeader.test.tsx` calls**

Existing tests that don't pass `onOpenFilters`/`filterCount` will fail TypeScript. Pass them as no-ops in every existing render:

```tsx
// In every existing render(...) call, add:
onOpenFilters={() => {}}
filterCount={0}
```

- [ ] **Step 5: Run tests to verify all pass**

```bash
pnpm vitest run src/features/wallets/components/WalletHeader.test.tsx
```

Expected: PASS — 3 new + existing tests.

- [ ] **Step 6: Commit**

```bash
git add src/features/wallets/components/WalletHeader.tsx src/features/wallets/components/WalletHeader.test.tsx
git commit -m "$(cat <<'EOF'
feat(wallets): WalletHeader gets a Filters button + count badge

Two new required props (onOpenFilters, filterCount). Badge appears
when filterCount > 0. aria-label communicates the active count to
screen readers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: `TradeHistoryList` — filter-aware empty state

**Files:**
- Modify: `src/features/wallets/components/TradeHistoryList.tsx`
- Modify: `src/features/wallets/components/TradeHistoryList.test.tsx`

- [ ] **Step 1: Add the new test case**

Append to `TradeHistoryList.test.tsx`:

```tsx
describe('TradeHistoryList filter-aware empty state', () => {
  it('shows the no-trades-yet copy when no filters and no trades', () => {
    render(
      <MemoryRouter>
        <TradeHistoryList
          trades={[]}
          address={ADDR}
          hasActiveFilters={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('No trades yet.')).toBeInTheDocument();
  });

  it('shows the no-trades-match copy + Clear all when filters active and no trades', async () => {
    const user = userEvent.setup();
    const onClearFilters = vi.fn();
    render(
      <MemoryRouter>
        <TradeHistoryList
          trades={[]}
          address={ADDR}
          hasActiveFilters={true}
          onClearFilters={onClearFilters}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/no trades match these filters/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    expect(onClearFilters).toHaveBeenCalled();
  });
});
```

(`vi` and `userEvent` imports must be present.)

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
pnpm vitest run src/features/wallets/components/TradeHistoryList.test.tsx
```

Expected: FAIL — `hasActiveFilters` / `onClearFilters` props don't exist.

- [ ] **Step 3: Update the empty-state branch in `TradeHistoryList.tsx`**

Replace the empty-state block:

```tsx
// Old:
if (sorted.length === 0) {
  return (
    <div className="flex h-24 items-center justify-center rounded-lg border border-border bg-bg-raised text-sm text-fg-subtle">
      No trades yet.
    </div>
  );
}

// New:
if (sorted.length === 0) {
  if (hasActiveFilters) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-bg-raised text-sm text-fg-subtle">
        <p>No trades match these filters.</p>
        {onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="rounded-md border border-border bg-bg-overlay px-3 py-1 text-xs text-fg-base ring-offset-bg-base hover:bg-bg-overlay/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            Clear all
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex h-24 items-center justify-center rounded-lg border border-border bg-bg-raised text-sm text-fg-subtle">
      No trades yet.
    </div>
  );
}
```

Add the new optional props to the `Props` type and destructure them with defaults:

```tsx
type Props = {
  trades: ReadonlyArray<ReconstructedTrade>;
  address: WalletAddress;
  tradeIdsWithNotes?: ReadonlySet<string>;
  tradeTagsByTradeId?: ReadonlyMap<string, ReadonlyArray<string>>;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
};

export function TradeHistoryList({
  trades,
  address,
  tradeIdsWithNotes = EMPTY_IDS,
  tradeTagsByTradeId = EMPTY_TAGS_MAP,
  hasActiveFilters = false,
  onClearFilters,
}: Props) {
  // ... rest unchanged
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/features/wallets/components/TradeHistoryList.test.tsx
```

Expected: PASS — 2 new tests + existing.

- [ ] **Step 5: Commit**

```bash
git add src/features/wallets/components/TradeHistoryList.tsx src/features/wallets/components/TradeHistoryList.test.tsx
git commit -m "$(cat <<'EOF'
feat(wallets): TradeHistoryList filter-aware empty state

Two new optional props (hasActiveFilters, onClearFilters). When the
list is empty and filters are active, copy switches from "No trades
yet" to "No trades match these filters" with a Clear-all action.
Defaults preserve the existing behavior for any caller that doesn't
opt in.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: `WalletView` — wire URL ↔ FilterState ↔ pre-filter ↔ surfaces

**Files:**
- Modify: `src/app/WalletView.tsx`
- Modify: `src/app/WalletView.test.tsx`

- [ ] **Step 1: Add the new test cases**

Append to `WalletView.test.tsx`:

```tsx
describe('WalletView filtering', () => {
  it('mounts pre-selected when URL has ?coin=BTC', async () => {
    // The mock fixture returns trades for two coins; assert the metrics-grid
    // value reflects only BTC trades. (Stub useWalletMetrics or assert via
    // a prop spy on a stubbed surface — pattern depends on existing mocks.)
    // Exact assertion depends on existing test infrastructure.
  });

  it('chip strip is hidden when no filter params present', () => {
    // Visit /w/ADDR without query string; the ActiveFilterChips region is
    // not in the DOM.
  });
});
```

NOTE: this test surface depends on the existing `WalletView.test.tsx` mocking pattern. If the file mocks `@features/wallets`, extend that mock to capture the `trades` prop received by each surface, then assert the captured prop length / contents reflect filtering. Read the existing test file for the established pattern before fleshing out these tests.

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
pnpm vitest run src/app/WalletView.test.tsx
```

Expected: existing pass; new tests fail until step 4.

- [ ] **Step 3: Update `WalletView.tsx`**

```tsx
// src/app/WalletView.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, Navigate } from 'react-router-dom';
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
import { FiltersDrawer } from '@features/wallets/components/FiltersDrawer';
import { ActiveFilterChips } from '@features/wallets/components/ActiveFilterChips';
import { useJournalEntryIds, useJournalTagsByTradeId } from '@features/journal';
import { Button } from '@lib/ui/components/button';
import { applyFilters } from '@domain/filters/applyFilters';
import {
  DEFAULT_FILTER_STATE,
  countActive,
  isDefault,
  type FilterState,
} from '@domain/filters/filterState';
import {
  parseFilterStateFromSearchParams,
  serializeFilterStateToSearchParams,
} from '@lib/validation/filterState';
import { computeTradeStats } from '@domain/metrics/computeTradeStats';
import type { WalletAddress } from '@entities/wallet';

// errorCopyFor / toneClass unchanged — copy from the existing file.

export function WalletView() {
  const { address } = useParams<{ address: string }>();

  if (!address || !isValidWalletAddress(address)) {
    return <Navigate to="/" replace />;
  }

  return <WalletViewInner address={address} />;
}

function WalletViewInner({ address }: { address: WalletAddress }) {
  const metrics = useWalletMetrics(address);
  const { ids: tradeIdsWithNotes } = useJournalEntryIds();
  const { tagsByTradeId } = useJournalTagsByTradeId();
  const { save } = useSavedWallets();

  useEffect(() => {
    save.mutate({ address, label: null, addedAt: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // NEW: filter state in URL
  const [searchParams, setSearchParams] = useSearchParams();
  const filterState = useMemo(
    () => parseFilterStateFromSearchParams(searchParams),
    [searchParams],
  );
  const setFilterState = useCallback(
    (next: FilterState) => {
      setSearchParams(serializeFilterStateToSearchParams(next), { replace: true });
    },
    [setSearchParams],
  );

  // NEW: pre-filtered trades + recomputed stats
  const filteredTrades = useMemo(
    () => applyFilters(metrics.trades, filterState),
    [metrics.trades, filterState],
  );
  const filteredStats = useMemo(
    () =>
      isDefault(filterState) ? metrics.stats : computeTradeStats(filteredTrades),
    [filterState, metrics.stats, filteredTrades],
  );
  const availableCoins = useMemo(
    () => Array.from(new Set(metrics.trades.map((t) => t.coin))).sort(),
    [metrics.trades],
  );
  const hasActiveFilters = !isDefault(filterState);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const errorCopy = errorCopyFor(metrics.error);

  return (
    <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
      <WalletHeader
        address={address}
        isFetching={metrics.isFetching}
        onRefresh={() => {
          void metrics.refresh();
        }}
        onOpenFilters={() => setDrawerOpen(true)}
        filterCount={countActive(filterState)}
      />

      <FiltersDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        state={filterState}
        onChange={setFilterState}
        availableCoins={availableCoins}
      />

      {hasActiveFilters && (
        <ActiveFilterChips state={filterState} onChange={setFilterState} />
      )}

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
            className={`text-base font-medium ${toneClass[errorCopy.tone]}`}
          >
            {errorCopy.heading}
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
          {filteredStats && <WalletMetricsGrid stats={filteredStats} />}
          <EquityCurveChart trades={filteredTrades} />
          <PnlCalendarChart trades={filteredTrades} />
          <TradeHistoryList
            trades={filteredTrades}
            address={address}
            tradeIdsWithNotes={tradeIdsWithNotes}
            tradeTagsByTradeId={tagsByTradeId}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={() => setFilterState(DEFAULT_FILTER_STATE)}
          />
        </>
      )}
    </main>
  );
}

// errorCopyFor and toneClass — paste from the existing file unchanged.
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/app/WalletView.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run the full unit suite to catch any cascade**

```bash
pnpm test
```

Expected: every existing test still passes; new ones all green. Target ≈ 488 tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/WalletView.tsx src/app/WalletView.test.tsx
git commit -m "$(cat <<'EOF'
feat(wallet-view): wire 5-dimension filtering

URL search params parsed via parseFilterStateFromSearchParams; live
updates via setSearchParams(replace: true). applyFilters pre-filters
the trades array before MetricsGrid / EquityCurveChart /
PnlCalendarChart / TradeHistoryList all receive the filtered set.
WalletMetricsGrid recomputes stats from the filtered subset (skipped
when no filters active to preserve identity equality on the stats
prop). availableCoins derived from the unfiltered trades so the coin
selector always offers every coin the wallet has touched.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Checkpoint 5 — Phase 5 complete.** /w/:address now filters end-to-end. E2E follows.

---

# Phase 6 — E2E + final gauntlet (T13–T14)

---

### Task 13: Playwright E2E spec

**Files:**
- Create: `e2e/filters-roundtrip.spec.ts`

- [ ] **Step 1: Read the existing roundtrip spec for shape**

Read `e2e/journal-roundtrip.spec.ts` and `e2e/tags-roundtrip.spec.ts` for the wallet-paste navigation pattern + cross-context state-isolation pattern.

- [ ] **Step 2: Write the spec**

```ts
// e2e/filters-roundtrip.spec.ts
import { test, expect } from '@playwright/test';
import { mockHyperliquid } from './fixtures/hyperliquid-route';

const TEST_ADDR = '0x0000000000000000000000000000000000000001';

test.describe('filters round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await mockHyperliquid(page);
  });

  test('apply, propagate, share via URL', async ({ page, browser }) => {
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}$`));

    // Open the drawer; pick Long + Closed.
    await page.getByRole('button', { name: /^filters$/i }).click();
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
    await page.getByRole('radio', { name: 'Long' }).click();
    await page.getByRole('radio', { name: 'Closed' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Filters' })).not.toBeVisible();

    // URL reflects state.
    await expect(page).toHaveURL(/side=long/);
    await expect(page).toHaveURL(/status=closed/);

    // Chip strip visible.
    await expect(page.getByText('Long', { exact: true })).toBeVisible();
    await expect(page.getByText('Closed', { exact: true })).toBeVisible();

    // Open the URL in a fresh context — filter restored.
    const url = page.url();
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await mockHyperliquid(freshPage);
    await freshPage.goto(url);
    await expect(freshPage.getByText('Long', { exact: true })).toBeVisible();
    await expect(freshPage.getByText('Closed', { exact: true })).toBeVisible();
    await freshContext.close();
  });

  test('empty result + clear all', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();

    // Apply a coin filter that no fixture trade matches.
    await page.goto(`/w/${TEST_ADDR}?coin=NONEXISTENTCOIN`);
    await expect(page.getByText(/no trades match these filters/i)).toBeVisible();

    // Clear all from the empty-state action.
    await page
      .getByRole('region', { name: /trade history/i })
      .getByRole('button', { name: /clear all/i })
      .click()
      .catch(async () => {
        // Fallback: top-level Clear all on the chip strip.
        await page.getByRole('button', { name: /^clear all$/i }).first().click();
      });
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}$`));
  });

  test('custom date range persists across reload', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();

    // Navigate directly via URL (faster than driving the date inputs).
    await page.goto(`/w/${TEST_ADDR}?from=2026-01-01&to=2026-04-28`);
    await expect(page.getByText('2026-01-01 – 2026-04-28')).toBeVisible();

    await page.reload();
    await expect(page.getByText('2026-01-01 – 2026-04-28')).toBeVisible();
  });
});
```

- [ ] **Step 3: Run the spec**

```bash
pnpm test:e2e e2e/filters-roundtrip.spec.ts
```

Expected: 3 passes.

- [ ] **Step 4: Commit**

```bash
git add e2e/filters-roundtrip.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): filters-roundtrip spec

Apply-and-share-via-URL, empty-result-with-clear-all, and custom-date
reload-persistence. Three scenarios bringing the E2E suite from 17 to
20.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Final gauntlet

- [ ] **Step 1: Run the full gauntlet**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build
```

Expected: every command exits 0. Unit-test count ≈ 490 (up from 428); E2E count 20 (up from 17). Domain coverage ≥ 90%. No new lint errors.

- [ ] **Step 2: If anything fails, fix the root cause**

Resolve any test, lint, or typecheck issue without bypassing (`--no-verify`, `// @ts-ignore`, etc.). If a real assumption from the design proves wrong, capture it in the SESSION_LOG gotcha section in T15.

- [ ] **Step 3: No commit yet — Phase 7 follows**

Save the docs commit until the SESSION_LOG / BACKLOG / CONVENTIONS update is ready.

**Checkpoint 6 — Phase 6 complete.** All code green; documentation last.

---

# Phase 7 — Documentation (T15)

---

### Task 15: SESSION_LOG, BACKLOG, CONVENTIONS — single docs commit

**Files:**
- Modify: `docs/SESSION_LOG.md`
- Modify: `docs/BACKLOG.md`
- Modify: `docs/CONVENTIONS.md` (only if novel pattern emerged)

- [ ] **Step 1: Append the SESSION_LOG entry**

Follow the format of the most recent entry (Session 7f). Cover:

- **Done** — bullet list of every task: pure helpers, URL parse/serialize, ADR-0009, Sheet primitive, FilterChip primitive, FiltersDrawer, ActiveFilterChips, WalletHeader extension, TradeHistoryList extension, WalletView wiring, E2E.
- **Decisions made** — ADR-0009 (Radix Dialog adoption + Sheet primitive).
- **Deferred / not done** — every BACKLOG candidate from spec §8.
- **Gotchas for next session** — likely candidates: the `useMemo`-on-`stats` skip-when-default optimization (preserves identity for chart memoization), `availableCoins` from unfiltered trades, custom wins over preset on conflict, end-of-day-exclusive custom range semantics.
- **Invariants assumed** — URL is the source of truth; garbage params self-heal; `applyFilters` is identity on default state; coin selector options come from unfiltered trades only.

- [ ] **Step 2: Update `docs/BACKLOG.md`**

Add a new section "Session 8a deferrals" containing each `[next]` / `[soon]` / `[maybe]` item from spec §8.

Then locate the existing entry in "Session 4a deferrals" reading `[soon] Filter panel on /w/:address` and remove it (it's now done).

- [ ] **Step 3: Optional — append to `docs/CONVENTIONS.md`**

Add a §17 "URL-as-filter-state" if the pattern feels likely to be reused (e.g., if Phase 2's pattern detection or trade-detail views will also encode UI state in URL params). Suggested wording:

```markdown
## 17. URL-driven UI state

- **URL search params are the source of truth for shareable, refresh-stable
  UI state.** Per ADR-0004, addressable UI state (filters, expanded-view
  selectors, comparison-mode selections) lives in the URL via
  `useSearchParams`; non-addressable state (drawer open/closed, hover state)
  lives in Zustand or component-local `useState`.
- **Live-apply via `replace: true`.** Calls to `setSearchParams(next, { replace: true })`
  on every control change avoid polluting browser history with one entry per
  chip-X-click. Push-mode (filter-undo via back-button) is opt-in and not
  the default.
- **Garbage params self-heal.** URL parsers are written via Zod `safeParse`
  per-dimension and silently fall back to defaults — never throw, never show
  an error UI. URLs are typed by humans, copied/pasted, and survive across
  app versions; resilience is the right default.
- **Serialize only non-defaults.** Default state produces an empty
  URLSearchParams. This keeps clean URLs for the common case and means
  "no filter" and "default filter" are observably the same thing.
- **Custom wins on conflict.** When two encodings of the same dimension are
  present (e.g., both `range` and `from`/`to`), the more specific encoding
  wins. Documented per consumer.
```

If Session 8b would clearly benefit from these notes (it will — adds 7 more dimensions on the same architecture), include them.

- [ ] **Step 4: Final gauntlet (one more pass)**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build
```

Expected: green.

- [ ] **Step 5: Commit everything**

```bash
git add docs/SESSION_LOG.md docs/BACKLOG.md docs/CONVENTIONS.md
git commit -m "$(cat <<'EOF'
docs: record Session 8a session log, backlog, ADR-0009

ADR-0009 was committed with T6 (Sheet primitive); this commit adds
the SESSION_LOG entry covering pure-domain filters, URL parse/serialize,
Sheet + FilterChip primitives, FiltersDrawer, ActiveFilterChips,
WalletView wiring, and the filters-roundtrip E2E. BACKLOG flips the
[soon] filter-panel item to done and adds the 8a deferrals (Session 8b
remaining 7 dimensions, calendar-cell click, multi-coin select, saved
presets, push-mode undo, etc.). CONVENTIONS §17 captures the
URL-driven UI state pattern.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

**Session 8a complete.** Final state expected:

- 15 tasks, ~16 commits.
- Unit tests ≈ 490; E2E ≈ 20.
- ADR-0009 accepted.
- BACKLOG updated.

---

## Self-Review Notes

The plan was self-reviewed against the spec. Coverage check:

| Spec section | Covered by |
|---|---|
| §2 Architecture | T1–T3 (domain), T4–T5 (URL), T6–T7 (UI primitives), T8–T9 (filter UI), T12 (route wiring) |
| §3 Data model | T1 (FilterState type), T4–T5 (URL encoding) |
| §4 applyFilters | T3 |
| §5.1 Filters button | T10 |
| §5.2 FiltersDrawer | T8 |
| §5.3 ActiveFilterChips | T9 |
| §5.4 Empty-result UX | T11 |
| §5.5 availableCoins from unfiltered | T12 |
| §6 Route integration | T12 |
| §7 Testing | every task is TDD |
| §8 BACKLOG | T15 |
| §9 Acceptance | each clause maps to a task above |

Type consistency check: `FilterState` shape is single-sourced in `@domain/filters/filterState`. Setter signatures (`setCoin`, `setSide`, etc.) match across consumers. `availableCoins` is `ReadonlyArray<string>` everywhere. `onChange: (next: FilterState) => void` is uniform across `FiltersDrawer` and `ActiveFilterChips`.

Placeholder scan: no "TBD" / "implement later" / "similar to Task N" / "add appropriate error handling" patterns. Every code-touching step contains code. Every command step contains exact commands and expected outcomes. WalletView.test.tsx step 1 deliberately defers detail to "depends on existing mocking pattern" — the existing test file is the authoritative reference and re-printing its mocks here would invite drift; the implementer reads it and follows.
