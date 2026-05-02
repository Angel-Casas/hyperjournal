# Session 8b — Filter panel implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/w/:address` filtering with the four trade-intrinsic dimensions from plan §11.5: hold-duration bucket, time-of-day band, day-of-week, and trade-size bucket. All multi-select. Local timezone for the two clock-aware dimensions; UTC unchanged for date filters.

**Architecture:** Pure-domain `applyFilters(trades, FilterState, { now, timeZone })` extends 8a's pipeline with four new predicates that compose by logical AND. Bucket boundaries live as named constants in `domain/filters/buckets.ts`; bucket id literal types and ORDER constants live in `entities/filter-state.ts` (boundary fix forced by `lib → domain` rule, mirroring 8a). New `MultiBucketControl` primitive in `lib/ui/components/` powers all four new drawer sections. Drawer reorganized into three semantic groups (`When` / `What` / `Outcome / shape`) with no collapsing. URL grammar adds comma-delimited per-key arrays with canonical ordering on serialize.

**Tech Stack:** TypeScript strict, React, react-router v6 (`useSearchParams`), Zod, Tailwind, `@radix-ui/react-dialog` (already in stack from 8a), Vitest + RTL, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-02-session-8b-filters-design.md`.

---

## Phases & Checkpoints

8 phases. Each phase ends with a natural checkpoint to run the gauntlet (`pnpm typecheck && pnpm lint && pnpm test`) and reset context.

- **Phase 1** — Entities + bucket constants (T1–T2)
- **Phase 2** — Pure domain helpers (T3–T6)
- **Phase 3** — URL validation (T7)
- **Phase 4** — UI primitive (T8)
- **Phase 5** — Filter UI components (T9–T10)
- **Phase 6** — WalletView integration (T11)
- **Phase 7** — E2E + full gauntlet (T12–T13)
- **Phase 8** — Documentation (T14)

**Test counts (running totals):**
- Start: 496 unit / 20 E2E (after Session 8a).
- Target end: ~576 unit / 22 E2E.

---

# Phase 1 — Entities + bucket constants (T1–T2)

---

### Task 1: Extend `entities/filter-state.ts` with new types and ORDER constants

**Files:**
- Modify: `src/entities/filter-state.ts`

- [ ] **Step 1: Replace the file content with the extended types**

```ts
// src/entities/filter-state.ts

/**
 * Filter state on /w/:address. 8a shipped 5 dimensions; 8b adds 4 more
 * (hold-duration, time-of-day, day-of-week, trade-size). Lives in entities/
 * so both lib/validation (URL parse/serialize) and domain/filters (pure
 * helpers + applyFilters) can depend on it without violating the lib →
 * domain boundary rule.
 *
 * @see docs/superpowers/specs/2026-05-02-session-8b-filters-design.md
 */

export type DateRangePreset = '7d' | '30d' | '90d' | '1y' | 'all';
export type Side = 'all' | 'long' | 'short';
export type Status = 'all' | 'closed' | 'open';
export type Outcome = 'all' | 'winner' | 'loser';

// — 8b multi-select bucket id literal types —
export type HoldDurationBucket = 'scalp' | 'intraday' | 'swing' | 'position';
export type TimeOfDayBand = 'overnight' | 'morning' | 'afternoon' | 'evening';
export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type TradeSizeBucket = 'micro' | 'small' | 'medium' | 'large' | 'whale';

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
  // — 8b —
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

/**
 * Canonical declaration order for each multi-select dimension. Used in two
 * places that must agree: drawer render order and URL serialization. Lives
 * in entities/ (not domain/filters/buckets.ts) because lib/validation needs
 * to import them, and lib → domain is forbidden.
 */
export const HOLD_DURATION_ORDER: ReadonlyArray<HoldDurationBucket> =
  ['scalp', 'intraday', 'swing', 'position'];
export const TIME_OF_DAY_ORDER: ReadonlyArray<TimeOfDayBand> =
  ['overnight', 'morning', 'afternoon', 'evening'];
export const DAY_OF_WEEK_ORDER: ReadonlyArray<DayOfWeek> =
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const TRADE_SIZE_ORDER: ReadonlyArray<TradeSizeBucket> =
  ['micro', 'small', 'medium', 'large', 'whale'];
```

- [ ] **Step 2: Run typecheck — expected to fail across many files**

Run: `pnpm typecheck`
Expected: failures in `src/domain/filters/filterState.ts`, `src/lib/validation/filterState.ts`, `src/features/wallets/components/{FiltersDrawer,ActiveFilterChips}.tsx` because `DEFAULT_FILTER_STATE` is now wider but consumers haven't been updated. This is expected — we'll fix each in turn.

- [ ] **Step 3: Commit**

```bash
git add src/entities/filter-state.ts
git commit -m "$(cat <<'EOF'
feat(filters): widen FilterState with 8b dimensions

Adds HoldDurationBucket / TimeOfDayBand / DayOfWeek / TradeSizeBucket
literal types, ReadonlyArray-of-bucket fields on FilterState, ORDER
constants for canonical serialization. Consumers will be updated in
the following tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create `domain/filters/buckets.ts` with labels and numeric ranges

**Files:**
- Create: `src/domain/filters/buckets.ts`
- Create: `src/domain/filters/buckets.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/filters/buckets.test.ts
import { describe, it, expect } from 'vitest';
import {
  HOLD_DURATION_BUCKETS,
  TIME_OF_DAY_BANDS,
  DAY_OF_WEEK_LABELS,
  TRADE_SIZE_BUCKETS,
} from './buckets';
import {
  HOLD_DURATION_ORDER,
  TIME_OF_DAY_ORDER,
  DAY_OF_WEEK_ORDER,
  TRADE_SIZE_ORDER,
} from '@entities/filter-state';

describe('HOLD_DURATION_BUCKETS', () => {
  it('is contiguous (each maxMs equals the next minMs)', () => {
    for (let i = 0; i < HOLD_DURATION_BUCKETS.length - 1; i++) {
      expect(HOLD_DURATION_BUCKETS[i].maxMs).toBe(HOLD_DURATION_BUCKETS[i + 1].minMs);
    }
  });

  it('starts at 0 and ends at +Infinity', () => {
    expect(HOLD_DURATION_BUCKETS[0].minMs).toBe(0);
    expect(HOLD_DURATION_BUCKETS.at(-1)!.maxMs).toBe(Number.POSITIVE_INFINITY);
  });

  it('id sequence matches HOLD_DURATION_ORDER', () => {
    expect(HOLD_DURATION_BUCKETS.map((b) => b.id)).toEqual(HOLD_DURATION_ORDER);
  });
});

describe('TIME_OF_DAY_BANDS', () => {
  it('is contiguous and covers 0..24', () => {
    expect(TIME_OF_DAY_BANDS[0].startHour).toBe(0);
    expect(TIME_OF_DAY_BANDS.at(-1)!.endHour).toBe(24);
    for (let i = 0; i < TIME_OF_DAY_BANDS.length - 1; i++) {
      expect(TIME_OF_DAY_BANDS[i].endHour).toBe(TIME_OF_DAY_BANDS[i + 1].startHour);
    }
  });

  it('id sequence matches TIME_OF_DAY_ORDER', () => {
    expect(TIME_OF_DAY_BANDS.map((b) => b.id)).toEqual(TIME_OF_DAY_ORDER);
  });
});

describe('DAY_OF_WEEK_LABELS', () => {
  it('has a label for every DAY_OF_WEEK_ORDER id', () => {
    for (const day of DAY_OF_WEEK_ORDER) {
      expect(DAY_OF_WEEK_LABELS[day]).toBeTypeOf('string');
      expect(DAY_OF_WEEK_LABELS[day].length).toBeGreaterThan(0);
    }
  });
});

describe('TRADE_SIZE_BUCKETS', () => {
  it('is contiguous and ends at +Infinity', () => {
    expect(TRADE_SIZE_BUCKETS[0].minNotional).toBe(0);
    expect(TRADE_SIZE_BUCKETS.at(-1)!.maxNotional).toBe(Number.POSITIVE_INFINITY);
    for (let i = 0; i < TRADE_SIZE_BUCKETS.length - 1; i++) {
      expect(TRADE_SIZE_BUCKETS[i].maxNotional).toBe(
        TRADE_SIZE_BUCKETS[i + 1].minNotional,
      );
    }
  });

  it('id sequence matches TRADE_SIZE_ORDER', () => {
    expect(TRADE_SIZE_BUCKETS.map((b) => b.id)).toEqual(TRADE_SIZE_ORDER);
  });
});
```

- [ ] **Step 2: Run tests — expect failure (file does not exist)**

Run: `pnpm vitest run src/domain/filters/buckets.test.ts`
Expected: FAIL with "Failed to resolve import './buckets'".

- [ ] **Step 3: Implement `buckets.ts`**

```ts
// src/domain/filters/buckets.ts
import type {
  HoldDurationBucket,
  TimeOfDayBand,
  DayOfWeek,
  TradeSizeBucket,
} from '@entities/filter-state';

/**
 * Hold-duration bucket boundaries. Range convention is [lo, hi) — lo
 * inclusive, hi exclusive — matching the 8a custom-date-range
 * end-of-day-exclusive convention. Last bucket extends to +Infinity so
 * predicate code is uniform: no special-case for the final bucket.
 */
export const HOLD_DURATION_BUCKETS = [
  { id: 'scalp',    label: 'Scalp',    minMs: 0,                maxMs: 5 * 60_000 },
  { id: 'intraday', label: 'Intraday', minMs: 5 * 60_000,       maxMs: 8 * 3_600_000 },
  { id: 'swing',    label: 'Swing',    minMs: 8 * 3_600_000,    maxMs: 7 * 86_400_000 },
  { id: 'position', label: 'Position', minMs: 7 * 86_400_000,   maxMs: Number.POSITIVE_INFINITY },
] as const;

/** Daily bands in the user's local timezone. Hours are 0..24 (h23 cycle). */
export const TIME_OF_DAY_BANDS = [
  { id: 'overnight', label: 'Overnight', startHour: 0,  endHour: 6 },
  { id: 'morning',   label: 'Morning',   startHour: 6,  endHour: 12 },
  { id: 'afternoon', label: 'Afternoon', startHour: 12, endHour: 18 },
  { id: 'evening',   label: 'Evening',   startHour: 18, endHour: 24 },
] as const;

/** Day-of-week labels. Order is set by DAY_OF_WEEK_ORDER in entities/. */
export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

/** Trade-size buckets in absolute USD notional. */
export const TRADE_SIZE_BUCKETS = [
  { id: 'micro',  label: 'Micro',  minNotional: 0,        maxNotional: 100 },
  { id: 'small',  label: 'Small',  minNotional: 100,      maxNotional: 1_000 },
  { id: 'medium', label: 'Medium', minNotional: 1_000,    maxNotional: 10_000 },
  { id: 'large',  label: 'Large',  minNotional: 10_000,   maxNotional: 100_000 },
  { id: 'whale',  label: 'Whale',  minNotional: 100_000,  maxNotional: Number.POSITIVE_INFINITY },
] as const;

// Compile-time guards: bucket id literal types must match entities/.
const _holdCheck: ReadonlyArray<{ id: HoldDurationBucket }> = HOLD_DURATION_BUCKETS;
const _todCheck:  ReadonlyArray<{ id: TimeOfDayBand }>      = TIME_OF_DAY_BANDS;
const _sizeCheck: ReadonlyArray<{ id: TradeSizeBucket }>    = TRADE_SIZE_BUCKETS;
void _holdCheck;
void _todCheck;
void _sizeCheck;
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm vitest run src/domain/filters/buckets.test.ts`
Expected: PASS, ~6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/filters/buckets.ts src/domain/filters/buckets.test.ts
git commit -m "$(cat <<'EOF'
feat(filters): bucket constants for 8b dimensions

Hold-duration / time-of-day / trade-size numeric ranges and labels.
Day-of-week labels as a record (order from entities/). All ranges are
[lo, hi); last bucket uses +Infinity so the matching predicate stays
branch-free.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 2 — Pure domain helpers (T3–T6)

---

### Task 3: Create `domain/dates/timezone.ts` for hour and weekday extraction

**Files:**
- Create: `src/domain/dates/timezone.ts`
- Create: `src/domain/dates/timezone.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/dates/timezone.test.ts
import { describe, it, expect } from 'vitest';
import { hourInTimeZone, weekdayIndexInTimeZone } from './timezone';

// 2026-04-29T03:00:00Z = Wed 23:00 NY (EDT, UTC-4) = Wed 12:00 Tokyo (JST, UTC+9)
const T = Date.UTC(2026, 3, 29, 3, 0, 0);

describe('hourInTimeZone', () => {
  it('returns UTC hour for UTC zone', () => {
    expect(hourInTimeZone(T, 'UTC')).toBe(3);
  });

  it('returns local hour for America/New_York', () => {
    // NY EDT is UTC-4 in late April; 03:00 UTC = 23:00 prior day
    expect(hourInTimeZone(T, 'America/New_York')).toBe(23);
  });

  it('returns local hour for Asia/Tokyo', () => {
    // JST is UTC+9; 03:00 UTC = 12:00 same day
    expect(hourInTimeZone(T, 'Asia/Tokyo')).toBe(12);
  });
});

describe('weekdayIndexInTimeZone', () => {
  it('returns Wed=2 in UTC', () => {
    // 2026-04-29 is a Wednesday → DAY_OF_WEEK_ORDER index 2
    expect(weekdayIndexInTimeZone(T, 'UTC')).toBe(2);
  });

  it('returns Tue=1 in America/New_York (03:00Z Wed = 23:00 Tue NY)', () => {
    // NY EDT is UTC-4; 03:00Z Wed → 23:00 prior-day NY = Tue → index 1
    expect(weekdayIndexInTimeZone(T, 'America/New_York')).toBe(1);
  });

  it('returns Wed=2 in Asia/Tokyo (03:00Z Wed = 12:00 Wed Tokyo)', () => {
    // JST is UTC+9; same wall-day in Tokyo
    expect(weekdayIndexInTimeZone(T, 'Asia/Tokyo')).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm vitest run src/domain/dates/timezone.test.ts`
Expected: FAIL — "Failed to resolve import './timezone'".

- [ ] **Step 3: Implement `timezone.ts`**

```ts
// src/domain/dates/timezone.ts

/**
 * Returns 0..23, the hour-of-day in the given IANA timezone.
 * Pure: takes an absolute timestamp and a tz string, returns a number.
 *
 * Implementation uses Intl.DateTimeFormat with hourCycle: 'h23' to
 * normalize "24" (which some locales emit for midnight) to "00".
 */
export function hourInTimeZone(timestampMs: number, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(timestampMs);
  const hourPart = parts.find((p) => p.type === 'hour');
  if (!hourPart) return 0;
  const hour = Number.parseInt(hourPart.value, 10);
  return Number.isFinite(hour) ? hour % 24 : 0;
}

/**
 * Returns 0..6 — Mon=0, Tue=1, ..., Sun=6 — matching DAY_OF_WEEK_ORDER
 * in entities/filter-state.ts. Pure.
 */
export function weekdayIndexInTimeZone(timestampMs: number, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(timestampMs);
  const weekdayPart = parts.find((p) => p.type === 'weekday');
  const code = weekdayPart?.value ?? 'Mon';
  // en-US 'short' emits 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
  const map: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  return map[code] ?? 0;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm vitest run src/domain/dates/timezone.test.ts`
Expected: PASS, ~5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/dates/timezone.ts src/domain/dates/timezone.test.ts
git commit -m "$(cat <<'EOF'
feat(dates): hour and weekday extractors in arbitrary IANA timezone

Pure helpers built on Intl.DateTimeFormat. Used by 8b's time-of-day
and day-of-week filter predicates. Mon=0..Sun=6 indexing matches
DAY_OF_WEEK_ORDER in entities/.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Create `domain/filters/bucketize.ts` for bucket-id assignment

**Files:**
- Create: `src/domain/filters/bucketize.ts`
- Create: `src/domain/filters/bucketize.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/filters/bucketize.test.ts
import { describe, it, expect } from 'vitest';
import {
  holdDurationBucketOf,
  timeOfDayBandOf,
  dayOfWeekOf,
  tradeSizeBucketOf,
} from './bucketize';

describe('holdDurationBucketOf', () => {
  it('classifies 0ms as scalp', () => {
    expect(holdDurationBucketOf(0)).toBe('scalp');
  });

  it('classifies just-below-5m as scalp', () => {
    expect(holdDurationBucketOf(5 * 60_000 - 1)).toBe('scalp');
  });

  it('classifies exactly 5m as intraday (boundary is inclusive-low)', () => {
    expect(holdDurationBucketOf(5 * 60_000)).toBe('intraday');
  });

  it('classifies 4 hours as intraday', () => {
    expect(holdDurationBucketOf(4 * 3_600_000)).toBe('intraday');
  });

  it('classifies exactly 8 hours as swing', () => {
    expect(holdDurationBucketOf(8 * 3_600_000)).toBe('swing');
  });

  it('classifies exactly 7 days as position', () => {
    expect(holdDurationBucketOf(7 * 86_400_000)).toBe('position');
  });

  it('classifies very large hold as position', () => {
    expect(holdDurationBucketOf(365 * 86_400_000)).toBe('position');
  });
});

describe('timeOfDayBandOf', () => {
  // 2026-04-29T03:00:00Z
  const T = Date.UTC(2026, 3, 29, 3, 0, 0);

  it('returns overnight in UTC (03:00)', () => {
    expect(timeOfDayBandOf(T, 'UTC')).toBe('overnight');
  });

  it('returns evening in NY (23:00)', () => {
    expect(timeOfDayBandOf(T, 'America/New_York')).toBe('evening');
  });

  it('returns afternoon in Tokyo (12:00)', () => {
    expect(timeOfDayBandOf(T, 'Asia/Tokyo')).toBe('afternoon');
  });

  it('puts 06:00 in morning (boundary is inclusive-low)', () => {
    const six = Date.UTC(2026, 3, 29, 6, 0, 0);
    expect(timeOfDayBandOf(six, 'UTC')).toBe('morning');
  });
});

describe('dayOfWeekOf', () => {
  const T = Date.UTC(2026, 3, 29, 3, 0, 0); // Wed UTC, Tue NY

  it('returns wed in UTC', () => {
    expect(dayOfWeekOf(T, 'UTC')).toBe('wed');
  });

  it('returns tue in NY (cross-midnight)', () => {
    expect(dayOfWeekOf(T, 'America/New_York')).toBe('tue');
  });
});

describe('tradeSizeBucketOf', () => {
  it('classifies $50 as micro', () => {
    expect(tradeSizeBucketOf(50)).toBe('micro');
  });

  it('classifies exactly $100 as small (boundary)', () => {
    expect(tradeSizeBucketOf(100)).toBe('small');
  });

  it('classifies $5000 as medium', () => {
    expect(tradeSizeBucketOf(5000)).toBe('medium');
  });

  it('classifies $1M as whale', () => {
    expect(tradeSizeBucketOf(1_000_000)).toBe('whale');
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm vitest run src/domain/filters/bucketize.test.ts`
Expected: FAIL — "Failed to resolve import './bucketize'".

- [ ] **Step 3: Implement `bucketize.ts`**

```ts
// src/domain/filters/bucketize.ts

import {
  HOLD_DURATION_BUCKETS,
  TIME_OF_DAY_BANDS,
  TRADE_SIZE_BUCKETS,
} from './buckets';
import { DAY_OF_WEEK_ORDER } from '@entities/filter-state';
import { hourInTimeZone, weekdayIndexInTimeZone } from '@domain/dates/timezone';
import type {
  HoldDurationBucket,
  TimeOfDayBand,
  DayOfWeek,
  TradeSizeBucket,
} from '@entities/filter-state';

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
  const idx = weekdayIndexInTimeZone(timestampMs, timeZone);
  return DAY_OF_WEEK_ORDER[idx] ?? 'mon';
}

export function tradeSizeBucketOf(notionalUsd: number): TradeSizeBucket {
  for (const b of TRADE_SIZE_BUCKETS) {
    if (notionalUsd >= b.minNotional && notionalUsd < b.maxNotional) return b.id;
  }
  return 'whale';
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm vitest run src/domain/filters/bucketize.test.ts`
Expected: PASS, ~13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/filters/bucketize.ts src/domain/filters/bucketize.test.ts
git commit -m "$(cat <<'EOF'
feat(filters): bucket-id assignment helpers

Pure, deterministic mappings from raw values (holdMs / timestamp /
notional) to bucket id literal types. Used by both the applyFilters
predicates and any future surface (e.g. per-bucket analytics).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Extend `domain/filters/filterState.ts` with toggle setters, clear setters, and updated `isDefault` / `countActive`

**Files:**
- Modify: `src/domain/filters/filterState.ts`
- Modify: `src/domain/filters/filterState.test.ts`

- [ ] **Step 1: Append the new test cases**

Append to `src/domain/filters/filterState.test.ts`:

```ts
// Existing tests above; append below:

import {
  toggleHoldDuration,
  toggleTimeOfDay,
  toggleDayOfWeek,
  toggleTradeSize,
  clearHoldDuration,
  clearTimeOfDay,
  clearDayOfWeek,
  clearTradeSize,
} from './filterState';

describe('toggle setters (multi-select)', () => {
  it('toggleHoldDuration adds when absent', () => {
    const next = toggleHoldDuration(DEFAULT_FILTER_STATE, 'scalp');
    expect(next.holdDuration).toEqual(['scalp']);
  });

  it('toggleHoldDuration removes when present', () => {
    const after1 = toggleHoldDuration(DEFAULT_FILTER_STATE, 'scalp');
    const after2 = toggleHoldDuration(after1, 'scalp');
    expect(after2.holdDuration).toEqual([]);
  });

  it('toggleHoldDuration preserves other dimensions', () => {
    const seeded = setCoin(DEFAULT_FILTER_STATE, 'BTC');
    const next = toggleHoldDuration(seeded, 'intraday');
    expect(next.coin).toBe('BTC');
    expect(next.holdDuration).toEqual(['intraday']);
  });

  it('toggleDayOfWeek can hold multiple days', () => {
    let s: FilterState = DEFAULT_FILTER_STATE;
    s = toggleDayOfWeek(s, 'mon');
    s = toggleDayOfWeek(s, 'wed');
    s = toggleDayOfWeek(s, 'fri');
    expect(new Set(s.dayOfWeek)).toEqual(new Set(['mon', 'wed', 'fri']));
  });

  it('toggleTimeOfDay returns a new object (immutability)', () => {
    const next = toggleTimeOfDay(DEFAULT_FILTER_STATE, 'morning');
    expect(next).not.toBe(DEFAULT_FILTER_STATE);
  });

  it('toggleTradeSize matches the same shape', () => {
    const next = toggleTradeSize(DEFAULT_FILTER_STATE, 'large');
    expect(next.tradeSize).toEqual(['large']);
  });
});

describe('clear setters', () => {
  it('clearHoldDuration empties only that dimension', () => {
    const seeded = toggleHoldDuration(
      toggleHoldDuration(setCoin(DEFAULT_FILTER_STATE, 'BTC'), 'scalp'),
      'intraday',
    );
    const cleared = clearHoldDuration(seeded);
    expect(cleared.holdDuration).toEqual([]);
    expect(cleared.coin).toBe('BTC');
  });

  it('clearTimeOfDay / clearDayOfWeek / clearTradeSize empty their own dimensions', () => {
    let s: FilterState = DEFAULT_FILTER_STATE;
    s = toggleTimeOfDay(s, 'morning');
    s = toggleDayOfWeek(s, 'mon');
    s = toggleTradeSize(s, 'large');
    expect(clearTimeOfDay(s).timeOfDay).toEqual([]);
    expect(clearDayOfWeek(s).dayOfWeek).toEqual([]);
    expect(clearTradeSize(s).tradeSize).toEqual([]);
  });
});

describe('isDefault with 8b fields', () => {
  it('returns false when holdDuration is non-empty', () => {
    expect(isDefault(toggleHoldDuration(DEFAULT_FILTER_STATE, 'scalp'))).toBe(false);
  });

  it('returns false when timeOfDay is non-empty', () => {
    expect(isDefault(toggleTimeOfDay(DEFAULT_FILTER_STATE, 'morning'))).toBe(false);
  });

  it('returns false when dayOfWeek is non-empty', () => {
    expect(isDefault(toggleDayOfWeek(DEFAULT_FILTER_STATE, 'mon'))).toBe(false);
  });

  it('returns false when tradeSize is non-empty', () => {
    expect(isDefault(toggleTradeSize(DEFAULT_FILTER_STATE, 'micro'))).toBe(false);
  });
});

describe('countActive with 8b fields', () => {
  it('counts each non-empty 8b array as 1', () => {
    let s: FilterState = DEFAULT_FILTER_STATE;
    s = toggleHoldDuration(s, 'scalp');
    s = toggleTimeOfDay(s, 'morning');
    expect(countActive(s)).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm vitest run src/domain/filters/filterState.test.ts`
Expected: FAIL — "toggleHoldDuration is not a function" plus residual `isDefault` failures from the unwidened predicate.

- [ ] **Step 3: Update `filterState.ts`**

Replace the file content:

```ts
// src/domain/filters/filterState.ts
import type { YYYYMMDD } from '@domain/dates/isValidDateString';
import type {
  DateRangePreset,
  FilterState,
  HoldDurationBucket,
  TimeOfDayBand,
  DayOfWeek,
  TradeSizeBucket,
  Outcome,
  Side,
  Status,
} from '@entities/filter-state';

// Re-export so callers that already import from this module keep working.
export type {
  DateRange,
  DateRangePreset,
  FilterState,
  HoldDurationBucket,
  TimeOfDayBand,
  DayOfWeek,
  TradeSizeBucket,
  Outcome,
  Side,
  Status,
} from '@entities/filter-state';
export { DEFAULT_FILTER_STATE } from '@entities/filter-state';

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

export function countActive(state: FilterState): number {
  let n = 0;
  if (state.coin !== null) n++;
  if (state.side !== 'all') n++;
  if (state.status !== 'all') n++;
  if (state.outcome !== 'all') n++;
  const dr = state.dateRange;
  if (dr.kind === 'custom' || (dr.kind === 'preset' && dr.preset !== 'all')) n++;
  if (state.holdDuration.length > 0) n++;
  if (state.timeOfDay.length > 0) n++;
  if (state.dayOfWeek.length > 0) n++;
  if (state.tradeSize.length > 0) n++;
  return n;
}

// — 8a setters (unchanged) —

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

// — 8b multi-select toggle setters —

function toggleIn<T extends string>(
  arr: ReadonlyArray<T>,
  value: T,
): ReadonlyArray<T> {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export function toggleHoldDuration(
  state: FilterState,
  bucket: HoldDurationBucket,
): FilterState {
  return { ...state, holdDuration: toggleIn(state.holdDuration, bucket) };
}
export function toggleTimeOfDay(
  state: FilterState,
  band: TimeOfDayBand,
): FilterState {
  return { ...state, timeOfDay: toggleIn(state.timeOfDay, band) };
}
export function toggleDayOfWeek(
  state: FilterState,
  day: DayOfWeek,
): FilterState {
  return { ...state, dayOfWeek: toggleIn(state.dayOfWeek, day) };
}
export function toggleTradeSize(
  state: FilterState,
  bucket: TradeSizeBucket,
): FilterState {
  return { ...state, tradeSize: toggleIn(state.tradeSize, bucket) };
}

// — 8b per-dimension clear setters —

export function clearHoldDuration(state: FilterState): FilterState {
  return { ...state, holdDuration: [] };
}
export function clearTimeOfDay(state: FilterState): FilterState {
  return { ...state, timeOfDay: [] };
}
export function clearDayOfWeek(state: FilterState): FilterState {
  return { ...state, dayOfWeek: [] };
}
export function clearTradeSize(state: FilterState): FilterState {
  return { ...state, tradeSize: [] };
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm vitest run src/domain/filters/filterState.test.ts`
Expected: PASS — both pre-existing 8a tests and the new 8b tests (~10 new).

- [ ] **Step 5: Commit**

```bash
git add src/domain/filters/filterState.ts src/domain/filters/filterState.test.ts
git commit -m "$(cat <<'EOF'
feat(filters): toggle and clear setters for 8b dimensions

Adds toggleHoldDuration / toggleTimeOfDay / toggleDayOfWeek /
toggleTradeSize with add-or-remove semantics, and clearX setters used
by the active-filter chips' X-button. isDefault and countActive
extended to include the new array fields.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Extend `domain/filters/applyFilters.ts` with four new predicates and `timeZone` option

**Files:**
- Modify: `src/domain/filters/applyFilters.ts`
- Modify: `src/domain/filters/applyFilters.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `src/domain/filters/applyFilters.test.ts`:

```ts
// Existing tests above; append below:

import {
  matchesHoldDuration,
  matchesTimeOfDay,
  matchesDayOfWeek,
  matchesTradeSize,
} from './applyFilters';
import {
  toggleHoldDuration,
  toggleTimeOfDay,
  toggleDayOfWeek,
  toggleTradeSize,
} from './filterState';

const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;

describe('matchesHoldDuration', () => {
  it('returns true for empty bucket array (default)', () => {
    expect(
      matchesHoldDuration(mkTrade({ holdTimeMs: 10_000 }), [], NOW),
    ).toBe(true);
  });

  it('matches a closed trade by stored holdTimeMs', () => {
    const trade = mkTrade({ status: 'closed', holdTimeMs: 30 * MIN_MS });
    expect(matchesHoldDuration(trade, ['intraday'], NOW)).toBe(true);
    expect(matchesHoldDuration(trade, ['scalp'], NOW)).toBe(false);
  });

  it('matches multi-bucket OR', () => {
    const trade = mkTrade({ status: 'closed', holdTimeMs: 30 * MIN_MS });
    expect(matchesHoldDuration(trade, ['scalp', 'intraday'], NOW)).toBe(true);
  });

  it('uses live now-openedAt for open trades', () => {
    const trade = mkTrade({
      status: 'open',
      openedAt: NOW - 30 * MIN_MS,
      holdTimeMs: 0, // stored 0, but live = 30m → intraday
    });
    expect(matchesHoldDuration(trade, ['intraday'], NOW)).toBe(true);
    expect(matchesHoldDuration(trade, ['scalp'], NOW)).toBe(false);
  });

  it('clamps negative live holds to 0 (defensive)', () => {
    const trade = mkTrade({ status: 'open', openedAt: NOW + 1000 });
    expect(matchesHoldDuration(trade, ['scalp'], NOW)).toBe(true);
  });
});

describe('matchesTimeOfDay', () => {
  // 2026-04-29T08:30:00Z → 08:30 UTC = morning
  const T = Date.UTC(2026, 3, 29, 8, 30, 0);

  it('returns true for empty bands', () => {
    expect(matchesTimeOfDay(mkTrade({ openedAt: T }), [], 'UTC')).toBe(true);
  });

  it('matches morning in UTC', () => {
    expect(matchesTimeOfDay(mkTrade({ openedAt: T }), ['morning'], 'UTC')).toBe(true);
  });

  it('shifts band based on timezone (NY = 04:30 = overnight)', () => {
    expect(
      matchesTimeOfDay(mkTrade({ openedAt: T }), ['overnight'], 'America/New_York'),
    ).toBe(true);
    expect(
      matchesTimeOfDay(mkTrade({ openedAt: T }), ['morning'], 'America/New_York'),
    ).toBe(false);
  });
});

describe('matchesDayOfWeek', () => {
  const T = Date.UTC(2026, 3, 29, 3, 0, 0); // Wed UTC, Tue NY

  it('returns true for empty days', () => {
    expect(matchesDayOfWeek(mkTrade({ openedAt: T }), [], 'UTC')).toBe(true);
  });

  it('matches wed in UTC', () => {
    expect(matchesDayOfWeek(mkTrade({ openedAt: T }), ['wed'], 'UTC')).toBe(true);
    expect(matchesDayOfWeek(mkTrade({ openedAt: T }), ['mon'], 'UTC')).toBe(false);
  });

  it('matches tue in NY (cross-midnight)', () => {
    expect(
      matchesDayOfWeek(mkTrade({ openedAt: T }), ['tue'], 'America/New_York'),
    ).toBe(true);
  });
});

describe('matchesTradeSize', () => {
  it('returns true for empty buckets', () => {
    expect(matchesTradeSize(mkTrade(), [])).toBe(true);
  });

  it('classifies notional via openedSize × avgEntryPx', () => {
    const trade = mkTrade({ openedSize: 0.5, avgEntryPx: 50_000 }); // 25k → large
    expect(matchesTradeSize(trade, ['large'])).toBe(true);
    expect(matchesTradeSize(trade, ['medium'])).toBe(false);
  });

  it('excludes truncated trades when filter is active', () => {
    const trade = mkTrade({ avgEntryPx: null, openedSize: 0 });
    expect(matchesTradeSize(trade, ['micro'])).toBe(false);
  });

  it('still includes truncated trades when filter is empty', () => {
    const trade = mkTrade({ avgEntryPx: null, openedSize: 0 });
    expect(matchesTradeSize(trade, [])).toBe(true);
  });
});

describe('applyFilters with 8b dimensions', () => {
  it('AND-composes multiple 8b dimensions', () => {
    const trades = [
      mkTrade({
        id: 'btc-scalp',
        coin: 'BTC',
        holdTimeMs: 60_000, // 1m → scalp
        openedSize: 0.001,
        avgEntryPx: 50_000, // 50 → micro
      }),
      mkTrade({
        id: 'btc-swing',
        coin: 'BTC',
        holdTimeMs: 24 * HOUR_MS, // 24h → swing
        openedSize: 0.001,
        avgEntryPx: 50_000,
      }),
    ];
    let state = toggleHoldDuration(DEFAULT_FILTER_STATE, 'scalp');
    state = toggleTradeSize(state, 'micro');
    expect(applyFilters(trades, state).map((t) => t.id)).toEqual(['btc-scalp']);
  });

  it('default state still short-circuits to identity (8a invariant preserved)', () => {
    const trades = [mkTrade()];
    expect(applyFilters(trades, DEFAULT_FILTER_STATE)).toBe(trades);
  });

  it('passes timeZone from options through to time-of-day predicate', () => {
    const T = Date.UTC(2026, 3, 29, 8, 30, 0); // 08:30Z = morning UTC, overnight NY
    const trades = [mkTrade({ openedAt: T })];
    const stateUtcMorning = toggleTimeOfDay(DEFAULT_FILTER_STATE, 'morning');
    expect(
      applyFilters(trades, stateUtcMorning, { timeZone: 'UTC' }).length,
    ).toBe(1);
    expect(
      applyFilters(trades, stateUtcMorning, { timeZone: 'America/New_York' }).length,
    ).toBe(0);
  });
});
```

**Note on the test file layout:** the existing `mkTrade` factory at the top of `applyFilters.test.ts` is reused unchanged. The new tests piggyback on it.

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm vitest run src/domain/filters/applyFilters.test.ts`
Expected: FAIL — `matchesHoldDuration` is not exported yet.

- [ ] **Step 3: Update `applyFilters.ts`**

Replace the file content:

```ts
// src/domain/filters/applyFilters.ts
import {
  isDefault,
  type FilterState,
  type Side,
  type Status,
  type Outcome,
  type HoldDurationBucket,
  type TimeOfDayBand,
  type DayOfWeek,
  type TradeSizeBucket,
} from './filterState';
import { resolveDateRange } from './resolveDateRange';
import {
  holdDurationBucketOf,
  timeOfDayBandOf,
  dayOfWeekOf,
  tradeSizeBucketOf,
} from './bucketize';
import type { ReconstructedTrade } from '@entities/trade';

type Options = { now?: number; timeZone?: string };

export function applyFilters(
  trades: ReadonlyArray<ReconstructedTrade>,
  state: FilterState,
  options: Options = {},
): ReadonlyArray<ReconstructedTrade> {
  if (isDefault(state)) return trades;
  const now = options.now ?? Date.now();
  const timeZone =
    options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
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

export function matchesHoldDuration(
  trade: ReconstructedTrade,
  buckets: ReadonlyArray<HoldDurationBucket>,
  now: number,
): boolean {
  if (buckets.length === 0) return true;
  const holdMs =
    trade.status === 'open'
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
  if (trade.avgEntryPx === null) return false;
  const notional = trade.openedSize * trade.avgEntryPx;
  return buckets.includes(tradeSizeBucketOf(notional));
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm vitest run src/domain/filters/applyFilters.test.ts`
Expected: PASS — pre-existing 8a tests plus the new ~16 8b tests.

- [ ] **Step 5: Run domain-wide tests — expect pass**

Run: `pnpm vitest run src/domain/`
Expected: PASS — full domain layer green.

- [ ] **Step 6: Commit**

```bash
git add src/domain/filters/applyFilters.ts src/domain/filters/applyFilters.test.ts
git commit -m "$(cat <<'EOF'
feat(filters): four 8b predicates and timeZone option

matchesHoldDuration / matchesTimeOfDay / matchesDayOfWeek /
matchesTradeSize compose by AND in applyFilters. Open trades use
live now-openedAt; truncated trades (avgEntryPx === null) are
excluded from any active size filter. timeZone resolves at the call
site once via Intl.DateTimeFormat unless the caller provides one.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Phase 2 Checkpoint

Run the gauntlet (no E2E yet):

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: typecheck still has WalletView / FiltersDrawer / ActiveFilterChips errors (consumers not yet updated). Domain + entities are green. If domain tests fail, fix before proceeding — Phase 3+ depends on them being correct.

---

# Phase 3 — URL validation (T7)

---

### Task 7: Extend `lib/validation/filterState.ts` with array parse / serialize

**Files:**
- Modify: `src/lib/validation/filterState.ts`
- Modify: `src/lib/validation/filterState.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `src/lib/validation/filterState.test.ts`:

```ts
// Existing tests above; append below:

import {
  toggleHoldDuration,
  toggleTimeOfDay,
  toggleDayOfWeek,
  toggleTradeSize,
} from '@domain/filters/filterState';

describe('parseFilterStateFromSearchParams — 8b array fields', () => {
  it('parses hold-duration list', () => {
    const result = parseFilterStateFromSearchParams(sp('hold=scalp,intraday'));
    expect(result.holdDuration).toEqual(['scalp', 'intraday']);
  });

  it('parses tod (time-of-day) list', () => {
    const result = parseFilterStateFromSearchParams(sp('tod=morning,evening'));
    expect(result.timeOfDay).toEqual(['morning', 'evening']);
  });

  it('parses dow (day-of-week) list', () => {
    const result = parseFilterStateFromSearchParams(sp('dow=mon,tue,wed'));
    expect(result.dayOfWeek).toEqual(['mon', 'tue', 'wed']);
  });

  it('parses size (trade-size) list', () => {
    const result = parseFilterStateFromSearchParams(sp('size=large,whale'));
    expect(result.tradeSize).toEqual(['large', 'whale']);
  });

  it('drops unknown tokens silently', () => {
    expect(
      parseFilterStateFromSearchParams(sp('hold=scalp,bogus,intraday'))
        .holdDuration,
    ).toEqual(['scalp', 'intraday']);
  });

  it('dedups within a list', () => {
    expect(
      parseFilterStateFromSearchParams(sp('hold=scalp,scalp,scalp')).holdDuration,
    ).toEqual(['scalp']);
  });

  it('treats empty value as default empty array', () => {
    expect(
      parseFilterStateFromSearchParams(sp('hold=')).holdDuration,
    ).toEqual([]);
  });

  it('parses 8a-only URL with default 8b fields', () => {
    const result = parseFilterStateFromSearchParams(sp('coin=BTC&status=closed'));
    expect(result.holdDuration).toEqual([]);
    expect(result.timeOfDay).toEqual([]);
    expect(result.dayOfWeek).toEqual([]);
    expect(result.tradeSize).toEqual([]);
    expect(result.coin).toBe('BTC');
    expect(result.status).toBe('closed');
  });
});

describe('serializeFilterStateToSearchParams — 8b array fields', () => {
  it('omits keys when arrays are empty', () => {
    const params = serializeFilterStateToSearchParams(DEFAULT_FILTER_STATE);
    expect(params.has('hold')).toBe(false);
    expect(params.has('tod')).toBe(false);
    expect(params.has('dow')).toBe(false);
    expect(params.has('size')).toBe(false);
  });

  it('writes hold list comma-joined in canonical order', () => {
    const state = toggleHoldDuration(
      toggleHoldDuration(DEFAULT_FILTER_STATE, 'position'),
      'scalp',
    );
    const params = serializeFilterStateToSearchParams(state);
    expect(params.get('hold')).toBe('scalp,position');
  });

  it('canonicalizes regardless of selection order', () => {
    const a = toggleHoldDuration(
      toggleHoldDuration(DEFAULT_FILTER_STATE, 'scalp'),
      'intraday',
    );
    const b = toggleHoldDuration(
      toggleHoldDuration(DEFAULT_FILTER_STATE, 'intraday'),
      'scalp',
    );
    expect(serializeFilterStateToSearchParams(a).get('hold')).toBe(
      serializeFilterStateToSearchParams(b).get('hold'),
    );
  });

  it('writes dow in Mon→Sun order', () => {
    let s = DEFAULT_FILTER_STATE;
    s = toggleDayOfWeek(s, 'fri');
    s = toggleDayOfWeek(s, 'mon');
    s = toggleDayOfWeek(s, 'wed');
    expect(serializeFilterStateToSearchParams(s).get('dow')).toBe('mon,wed,fri');
  });
});

describe('round-trip identity — 8b states', () => {
  const cases: Array<[string, FilterState]> = [
    [
      'hold + size',
      (() => {
        let s = DEFAULT_FILTER_STATE;
        s = toggleHoldDuration(s, 'scalp');
        s = toggleHoldDuration(s, 'intraday');
        s = toggleTradeSize(s, 'large');
        return s;
      })(),
    ],
    [
      'tod + dow',
      (() => {
        let s = DEFAULT_FILTER_STATE;
        s = toggleTimeOfDay(s, 'morning');
        s = toggleTimeOfDay(s, 'evening');
        s = toggleDayOfWeek(s, 'mon');
        s = toggleDayOfWeek(s, 'fri');
        return s;
      })(),
    ],
    [
      '8a + 8b combined',
      (() => {
        let s = setCoin(DEFAULT_FILTER_STATE, 'BTC');
        s = setSide(s, 'long');
        s = toggleHoldDuration(s, 'intraday');
        s = toggleTimeOfDay(s, 'morning');
        return s;
      })(),
    ],
  ];

  it.each(cases)('%s round-trips', (_label, state) => {
    const params = serializeFilterStateToSearchParams(state);
    const parsed = parseFilterStateFromSearchParams(params);
    // Compare via re-serialization to allow non-canonical input order.
    expect(
      serializeFilterStateToSearchParams(parsed).toString(),
    ).toBe(params.toString());
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm vitest run src/lib/validation/filterState.test.ts`
Expected: FAIL — new fields are missing on parsed state and unknown keys aren't serialized.

- [ ] **Step 3: Update `lib/validation/filterState.ts`**

Replace the file content:

```ts
// src/lib/validation/filterState.ts
import { z } from 'zod';
import {
  DEFAULT_FILTER_STATE,
  HOLD_DURATION_ORDER,
  TIME_OF_DAY_ORDER,
  DAY_OF_WEEK_ORDER,
  TRADE_SIZE_ORDER,
  type DateRangePreset,
  type DayOfWeek,
  type FilterState,
  type HoldDurationBucket,
  type Outcome,
  type Side,
  type Status,
  type TimeOfDayBand,
  type TradeSizeBucket,
} from '@entities/filter-state';

const PresetSchema = z.enum(['7d', '30d', '90d', '1y']);
const SideSchema = z.enum(['long', 'short']);
const StatusSchema = z.enum(['closed', 'open']);
const OutcomeSchema = z.enum(['winner', 'loser']);

const HoldDurationSchema = z.enum(['scalp', 'intraday', 'swing', 'position']);
const TimeOfDayBandSchema = z.enum(['overnight', 'morning', 'afternoon', 'evening']);
const DayOfWeekSchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const TradeSizeBucketSchema = z.enum(['micro', 'small', 'medium', 'large', 'whale']);

// YYYY-MM-DD with valid month/day. Mirrors @domain/dates/isValidDateString
// without crossing the lib → domain boundary.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

export function parseFilterStateFromSearchParams(
  params: URLSearchParams,
): FilterState {
  const coin = parseCoin(params.get('coin'));
  const side = parseEnumOr(params.get('side'), SideSchema, 'all') as Side;
  const status = parseEnumOr(params.get('status'), StatusSchema, 'all') as Status;
  const outcome = parseEnumOr(params.get('outcome'), OutcomeSchema, 'all') as Outcome;
  const dateRange = parseDateRange(params);
  const holdDuration = parseEnumArrayOr<HoldDurationBucket>(
    params.get('hold'),
    HoldDurationSchema,
  );
  const timeOfDay = parseEnumArrayOr<TimeOfDayBand>(
    params.get('tod'),
    TimeOfDayBandSchema,
  );
  const dayOfWeek = parseEnumArrayOr<DayOfWeek>(
    params.get('dow'),
    DayOfWeekSchema,
  );
  const tradeSize = parseEnumArrayOr<TradeSizeBucket>(
    params.get('size'),
    TradeSizeBucketSchema,
  );
  return {
    coin,
    side,
    status,
    outcome,
    dateRange,
    holdDuration,
    timeOfDay,
    dayOfWeek,
    tradeSize,
  };
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

function parseEnumArrayOr<T extends string>(
  raw: string | null,
  schema: z.ZodEnum<[string, ...string[]]>,
): ReadonlyArray<T> {
  if (raw === null || raw === '') return [];
  const out: Array<T> = [];
  const seen = new Set<string>();
  for (const tok of raw.split(',')) {
    const r = schema.safeParse(tok);
    if (r.success && !seen.has(r.data)) {
      seen.add(r.data);
      out.push(r.data as T);
    }
  }
  return out;
}

function parseDateRange(params: URLSearchParams): FilterState['dateRange'] {
  // Custom wins over preset when both valid.
  const from = params.get('from');
  const to = params.get('to');
  if (from && to && isValidDate(from) && isValidDate(to)) {
    return { kind: 'custom', from, to };
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

function sortByCanonical<T extends string>(
  arr: ReadonlyArray<T>,
  order: ReadonlyArray<T>,
): ReadonlyArray<T> {
  const idx = new Map(order.map((id, i) => [id, i] as const));
  return [...arr].sort((a, b) => (idx.get(a) ?? 0) - (idx.get(b) ?? 0));
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
  if (state.holdDuration.length > 0) {
    params.set(
      'hold',
      sortByCanonical(state.holdDuration, HOLD_DURATION_ORDER).join(','),
    );
  }
  if (state.timeOfDay.length > 0) {
    params.set(
      'tod',
      sortByCanonical(state.timeOfDay, TIME_OF_DAY_ORDER).join(','),
    );
  }
  if (state.dayOfWeek.length > 0) {
    params.set(
      'dow',
      sortByCanonical(state.dayOfWeek, DAY_OF_WEEK_ORDER).join(','),
    );
  }
  if (state.tradeSize.length > 0) {
    params.set(
      'size',
      sortByCanonical(state.tradeSize, TRADE_SIZE_ORDER).join(','),
    );
  }
  return params;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm vitest run src/lib/validation/filterState.test.ts`
Expected: PASS — both pre-existing 8a tests and the new ~14 8b tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/filterState.ts src/lib/validation/filterState.test.ts
git commit -m "$(cat <<'EOF'
feat(validation): comma-delimited array parse/serialize for 8b filters

URL grammar: ?hold=scalp,intraday&tod=morning,evening&dow=mon,tue&size=medium,large.
Garbage tokens drop silently per-token. Parse preserves source order;
serialize canonicalizes via per-dimension ORDER constants in entities/.
Round-trip identity holds for 8a + 8b combined states.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Phase 3 Checkpoint

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: typecheck still flags `FiltersDrawer.tsx` and `ActiveFilterChips.tsx` (consumers not yet updated). All domain + validation unit tests green.

---

# Phase 4 — UI primitive (T8)

---

### Task 8: Create `MultiBucketControl` primitive in `lib/ui/components/`

**Files:**
- Create: `src/lib/ui/components/multi-bucket-control.tsx`
- Create: `src/lib/ui/components/multi-bucket-control.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/lib/ui/components/multi-bucket-control.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MultiBucketControl } from './multi-bucket-control';

const BUCKETS = [
  { id: 'a' as const, label: 'Alpha' },
  { id: 'b' as const, label: 'Beta' },
  { id: 'c' as const, label: 'Gamma' },
];

describe('MultiBucketControl', () => {
  it('renders every bucket label', () => {
    render(
      <MultiBucketControl
        label="Test"
        buckets={BUCKETS}
        selected={[]}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('aria-pressed reflects selection', () => {
    render(
      <MultiBucketControl
        label="Test"
        buckets={BUCKETS}
        selected={['b']}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText('Alpha').closest('button')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByText('Beta').closest('button')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('fires onToggle with the bucket id when clicked', () => {
    const onToggle = vi.fn();
    render(
      <MultiBucketControl
        label="Test"
        buckets={BUCKETS}
        selected={[]}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByText('Beta'));
    expect(onToggle).toHaveBeenCalledWith('b');
  });

  it('renders the section label as a heading', () => {
    render(
      <MultiBucketControl
        label="Hold duration"
        buckets={BUCKETS}
        selected={[]}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText('Hold duration')).toBeInTheDocument();
  });

  it('exposes ariaDescription on the group when provided', () => {
    render(
      <MultiBucketControl
        label="Hold"
        buckets={BUCKETS}
        selected={[]}
        onToggle={() => {}}
        ariaDescription="< 5m, 5m–8h, 8h–7d, ≥ 7d"
      />,
    );
    const group = screen.getByRole('group', { name: /hold/i });
    expect(group).toHaveAttribute('aria-description', '< 5m, 5m–8h, 8h–7d, ≥ 7d');
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm vitest run src/lib/ui/components/multi-bucket-control.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `multi-bucket-control.tsx`**

```tsx
// src/lib/ui/components/multi-bucket-control.tsx
import { cn } from '@lib/ui/utils';

type Props<T extends string> = {
  /** Section heading; rendered as the group label (visible h3). */
  label: string;
  /** Bucket id + display label pairs, in render order. */
  buckets: ReadonlyArray<{ id: T; label: string }>;
  /** Currently-selected ids. */
  selected: ReadonlyArray<T>;
  /** Click handler — toggles the bucket in the parent's state. */
  onToggle: (id: T) => void;
  /** Optional aria-description on the group element. */
  ariaDescription?: string;
};

export function MultiBucketControl<T extends string>({
  label,
  buckets,
  selected,
  onToggle,
  ariaDescription,
}: Props<T>) {
  const selectedSet = new Set(selected);
  return (
    <section
      role="group"
      aria-label={label}
      {...(ariaDescription ? { 'aria-description': ariaDescription } : {})}
      className="flex flex-col gap-2"
    >
      <h3 className="text-sm font-semibold text-fg-base">{label}</h3>
      <div className="flex flex-wrap gap-1.5">
        {buckets.map((b) => {
          const pressed = selectedSet.has(b.id);
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={pressed}
              onClick={() => onToggle(b.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                pressed
                  ? 'border-accent bg-accent/20 text-fg-base'
                  : 'border-border bg-bg-overlay text-fg-muted hover:text-fg-base',
              )}
            >
              {b.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm vitest run src/lib/ui/components/multi-bucket-control.test.tsx`
Expected: PASS, ~5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/components/multi-bucket-control.tsx src/lib/ui/components/multi-bucket-control.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): MultiBucketControl primitive for multi-select bucket grids

Section heading + flex-wrap row of toggle buttons. WAI-ARIA
multi-select pattern via aria-pressed. Used by the four 8b filter
sections; lives in lib/ui from the start because three is the
trigger for extracting per the 8a gotcha.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 5 — Filter UI components (T9–T10)

---

### Task 9: Reorganize `FiltersDrawer.tsx` into three semantic groups and wire the four new sections

**Files:**
- Modify: `src/features/wallets/components/FiltersDrawer.tsx`
- Modify: `src/features/wallets/components/FiltersDrawer.test.tsx`

- [ ] **Step 1: Append failing tests**

Append to `src/features/wallets/components/FiltersDrawer.test.tsx` (after the 8a tests):

```tsx
import {
  toggleHoldDuration,
  toggleDayOfWeek,
} from '@domain/filters/filterState';

describe('FiltersDrawer — 8b sections', () => {
  function renderOpen(state = DEFAULT_FILTER_STATE, onChange = vi.fn()) {
    return render(
      <FiltersDrawer
        open={true}
        onOpenChange={() => {}}
        state={state}
        onChange={onChange}
        availableCoins={['BTC', 'ETH']}
      />,
    );
  }

  it('renders the three group headers', () => {
    renderOpen();
    expect(screen.getByText(/^when$/i)).toBeInTheDocument();
    expect(screen.getByText(/^what$/i)).toBeInTheDocument();
    expect(screen.getByText(/outcome.*shape/i)).toBeInTheDocument();
  });

  it('renders the four 8b MultiBucketControl sections', () => {
    renderOpen();
    expect(
      screen.getByRole('group', { name: /hold duration/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: /time of day/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: /day of week/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: /trade size/i }),
    ).toBeInTheDocument();
  });

  it('clicking a hold-duration bucket fires onChange with toggleHoldDuration applied', () => {
    const onChange = vi.fn();
    renderOpen(DEFAULT_FILTER_STATE, onChange);
    fireEvent.click(screen.getByText(/^scalp$/i));
    expect(onChange).toHaveBeenCalledWith(
      toggleHoldDuration(DEFAULT_FILTER_STATE, 'scalp'),
    );
  });

  it('clicking a day chip toggles in dayOfWeek', () => {
    const onChange = vi.fn();
    renderOpen(DEFAULT_FILTER_STATE, onChange);
    fireEvent.click(screen.getByText(/^mon$/i));
    expect(onChange).toHaveBeenCalledWith(
      toggleDayOfWeek(DEFAULT_FILTER_STATE, 'mon'),
    );
  });

  it('shows aria-pressed=true on already-selected buckets', () => {
    const seeded = toggleHoldDuration(DEFAULT_FILTER_STATE, 'intraday');
    renderOpen(seeded);
    const intradayBtn = screen.getByText(/^intraday$/i).closest('button');
    expect(intradayBtn).toHaveAttribute('aria-pressed', 'true');
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm vitest run src/features/wallets/components/FiltersDrawer.test.tsx`
Expected: FAIL — drawer doesn't have group headers or the new sections.

- [ ] **Step 3: Replace `FiltersDrawer.tsx` content**

```tsx
// src/features/wallets/components/FiltersDrawer.tsx
import type { ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@lib/ui/components/sheet';
import { Button } from '@lib/ui/components/button';
import { MultiBucketControl } from '@lib/ui/components/multi-bucket-control';
import {
  DEFAULT_FILTER_STATE,
  isDefault,
  setCoin,
  setCustomDateRange,
  setDateRangePreset,
  setOutcome,
  setSide,
  setStatus,
  toggleHoldDuration,
  toggleTimeOfDay,
  toggleDayOfWeek,
  toggleTradeSize,
  type DateRangePreset,
  type FilterState,
  type Outcome,
  type Side,
  type Status,
} from '@domain/filters/filterState';
import { DAY_OF_WEEK_ORDER } from '@entities/filter-state';
import {
  HOLD_DURATION_BUCKETS,
  TIME_OF_DAY_BANDS,
  DAY_OF_WEEK_LABELS,
  TRADE_SIZE_BUCKETS,
} from '@domain/filters/buckets';
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

const DAY_BUCKETS = DAY_OF_WEEK_ORDER.map((id) => ({
  id,
  label: DAY_OF_WEEK_LABELS[id],
}));

const HOLD_BUCKETS_DISPLAY = HOLD_DURATION_BUCKETS.map((b) => ({
  id: b.id,
  label: b.label,
}));
const TOD_BANDS_DISPLAY = TIME_OF_DAY_BANDS.map((b) => ({
  id: b.id,
  label: b.label,
}));
const SIZE_BUCKETS_DISPLAY = TRADE_SIZE_BUCKETS.map((b) => ({
  id: b.id,
  label: b.label,
}));

export function FiltersDrawer({
  open,
  onOpenChange,
  state,
  onChange,
  availableCoins,
}: Props) {
  const dr = state.dateRange;
  const isCustom = dr.kind === 'custom';
  const customFrom = dr.kind === 'custom' ? dr.from : '';
  const customTo = dr.kind === 'custom' ? dr.to : '';

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

        <div className="flex flex-col gap-6 overflow-y-auto">
          <Group title="When">
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
                    const today = new Date().toISOString().slice(0, 10);
                    onChange(
                      setCustomDateRange(
                        state,
                        today as YYYYMMDD,
                        today as YYYYMMDD,
                      ),
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

            <MultiBucketControl
              label="Time of day"
              buckets={TOD_BANDS_DISPLAY}
              selected={state.timeOfDay}
              onToggle={(b) => onChange(toggleTimeOfDay(state, b))}
            />

            <MultiBucketControl
              label="Day of week"
              buckets={DAY_BUCKETS}
              selected={state.dayOfWeek}
              onToggle={(d) => onChange(toggleDayOfWeek(state, d))}
            />
          </Group>

          <Group title="What">
            <Section heading="Coin">
              <label htmlFor="filter-coin" className="sr-only">
                Coin
              </label>
              <select
                id="filter-coin"
                value={state.coin ?? ''}
                onChange={(e) =>
                  onChange(
                    setCoin(state, e.target.value === '' ? null : e.target.value),
                  )
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
          </Group>

          <Group title="Outcome / shape">
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

            <MultiBucketControl
              label="Hold duration"
              buckets={HOLD_BUCKETS_DISPLAY}
              selected={state.holdDuration}
              onToggle={(b) => onChange(toggleHoldDuration(state, b))}
            />

            <MultiBucketControl
              label="Trade size"
              buckets={SIZE_BUCKETS_DISPLAY}
              selected={state.tradeSize}
              onToggle={(b) => onChange(toggleTradeSize(state, b))}
            />
          </Group>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
        {title}
      </h2>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
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
  children: ReactNode;
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
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex rounded-md border border-border bg-bg-overlay p-0.5"
    >
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

**Note:** the drawer reads the bucket render order from the `_BUCKETS` constants directly (each constant is `as const`-ordered). Only `DAY_OF_WEEK_ORDER` is imported from entities/ because `DAY_OF_WEEK_LABELS` is a record keyed by id and `DAY_BUCKETS` needs to iterate keys in display order.

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm vitest run src/features/wallets/components/FiltersDrawer.test.tsx`
Expected: PASS — pre-existing 8a tests + ~5 new 8b tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/wallets/components/FiltersDrawer.tsx src/features/wallets/components/FiltersDrawer.test.tsx
git commit -m "$(cat <<'EOF'
feat(wallets): drawer reorganization and four 8b filter sections

Three semantic group headers (When / What / Outcome / shape) replace
the flat stack from 8a. Hold duration, time of day, day of week, and
trade size sections wired via MultiBucketControl. Live-apply onChange
preserved.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Update `ActiveFilterChips.tsx` for multi-select rendering

**Files:**
- Modify: `src/features/wallets/components/ActiveFilterChips.tsx`
- Modify: `src/features/wallets/components/ActiveFilterChips.test.tsx`

- [ ] **Step 1: Append failing tests**

Append to `src/features/wallets/components/ActiveFilterChips.test.tsx`:

```tsx
import {
  toggleHoldDuration,
  toggleDayOfWeek,
  toggleTradeSize,
} from '@domain/filters/filterState';

describe('ActiveFilterChips — 8b multi-select rendering', () => {
  it('renders no chip for empty arrays', () => {
    render(
      <ActiveFilterChips state={DEFAULT_FILTER_STATE} onChange={() => {}} />,
    );
    expect(screen.queryByText(/hold/i)).toBeNull();
  });

  it('renders inline list for 1–3 buckets', () => {
    let state = toggleHoldDuration(DEFAULT_FILTER_STATE, 'scalp');
    state = toggleHoldDuration(state, 'intraday');
    render(<ActiveFilterChips state={state} onChange={() => {}} />);
    expect(
      screen.getByText(/hold:\s*scalp,\s*intraday/i),
    ).toBeInTheDocument();
  });

  it('renders count summary for 4+ buckets', () => {
    let state = DEFAULT_FILTER_STATE;
    state = toggleDayOfWeek(state, 'mon');
    state = toggleDayOfWeek(state, 'tue');
    state = toggleDayOfWeek(state, 'wed');
    state = toggleDayOfWeek(state, 'thu');
    state = toggleDayOfWeek(state, 'fri');
    render(<ActiveFilterChips state={state} onChange={() => {}} />);
    expect(screen.getByText(/day:\s*5 selected/i)).toBeInTheDocument();
  });

  it('chip X clears the entire dimension', () => {
    let state = toggleHoldDuration(DEFAULT_FILTER_STATE, 'scalp');
    state = toggleHoldDuration(state, 'intraday');
    const onChange = vi.fn();
    render(<ActiveFilterChips state={state} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/remove hold/i));
    expect(onChange).toHaveBeenCalledWith({
      ...state,
      holdDuration: [],
    });
  });

  it('renders inline list in canonical order regardless of selection order', () => {
    let state = toggleTradeSize(DEFAULT_FILTER_STATE, 'whale');
    state = toggleTradeSize(state, 'small');
    state = toggleTradeSize(state, 'medium');
    render(<ActiveFilterChips state={state} onChange={() => {}} />);
    expect(
      screen.getByText(/size:\s*small,\s*medium,\s*whale/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `pnpm vitest run src/features/wallets/components/ActiveFilterChips.test.tsx`
Expected: FAIL — multi-select chips not rendered.

- [ ] **Step 3: Replace `ActiveFilterChips.tsx` content**

```tsx
// src/features/wallets/components/ActiveFilterChips.tsx
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
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm vitest run src/features/wallets/components/ActiveFilterChips.test.tsx`
Expected: PASS — pre-existing 8a tests + ~5 new 8b tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/wallets/components/ActiveFilterChips.tsx src/features/wallets/components/ActiveFilterChips.test.tsx
git commit -m "$(cat <<'EOF'
feat(wallets): multi-select chip rendering for 8b dimensions

Per-dimension chip with inline list when ≤ 3 selected, count summary
when ≥ 4. Inline order is canonical (matches URL serialization).
X-button clears the entire dimension; per-bucket removal is BACKLOG.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Phase 5 Checkpoint

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: typecheck and unit tests fully green; only WalletView's `applyFilters` call needs the `timeZone` option (still passes — `timeZone` is optional). Run is clean. If anything fails, fix before proceeding.

---

# Phase 6 — WalletView integration (T11)

---

### Task 11: Pass `timeZone` to `applyFilters` from WalletView

**Files:**
- Modify: `src/app/WalletView.tsx`

- [ ] **Step 1: Replace the `filteredTrades` useMemo**

Find the existing block (around line 111):

```tsx
  const filteredTrades = useMemo(
    () => applyFilters(metrics.trades, filterState),
    [metrics.trades, filterState],
  );
```

Replace with:

```tsx
  const filteredTrades = useMemo(
    () =>
      applyFilters(metrics.trades, filterState, {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    [metrics.trades, filterState],
  );
```

**Note:** `now` is intentionally not threaded — `applyFilters` defaults it to `Date.now()` per call. The component re-mounting / re-rendering on data change picks up a fresh `now` naturally; no need for a ticking timer in 8b.

- [ ] **Step 2: Run unit tests + the existing WalletView test**

Run: `pnpm vitest run src/app/WalletView.test.tsx`
Expected: PASS — `WalletView` still composes correctly.

- [ ] **Step 3: Run the full unit suite**

Run: `pnpm test`
Expected: PASS, ~574 tests across ~78 files.

- [ ] **Step 4: Commit**

```bash
git add src/app/WalletView.tsx
git commit -m "$(cat <<'EOF'
feat(wallets): pass user timezone into applyFilters

Resolves IANA timezone once at the call site via
Intl.DateTimeFormat().resolvedOptions().timeZone. Threaded into
applyFilters so time-of-day and day-of-week predicates use the
user's local clock, not UTC. Date filters remain UTC.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 7 — E2E + full gauntlet (T12–T13)

---

### Task 12: Add `filters-multiselect-roundtrip.spec.ts` E2E

**Files:**
- Create: `e2e/filters-multiselect-roundtrip.spec.ts`

- [ ] **Step 1: Read the existing 8a E2E for reference**

Run: `cat e2e/filters-roundtrip.spec.ts`
Expected: see existing patterns for opening the drawer, selecting a coin, observing URL search params, and using fresh-context navigation.

- [ ] **Step 2: Write the new spec**

```ts
// e2e/filters-multiselect-roundtrip.spec.ts
import { test, expect } from '@playwright/test';

const TEST_WALLET = process.env.TEST_WALLET ?? '0x0000000000000000000000000000000000000000';

test.describe('8b multi-select filters', () => {
  test('apply hold + day-of-week, share URL, fresh-context reload preserves selection', async ({
    page,
    context,
  }) => {
    await page.goto(`/w/${TEST_WALLET}`);

    await page.getByRole('button', { name: /filters/i }).click();

    // Toggle hold-duration: scalp + intraday
    const holdGroup = page.getByRole('group', { name: /hold duration/i });
    await holdGroup.getByRole('button', { name: /scalp/i }).click();
    await holdGroup.getByRole('button', { name: /intraday/i }).click();

    // Toggle day-of-week: Mon + Tue
    const dowGroup = page.getByRole('group', { name: /day of week/i });
    await dowGroup.getByRole('button', { name: /^mon$/i }).click();
    await dowGroup.getByRole('button', { name: /^tue$/i }).click();

    // URL reflects canonical-order serialization
    await expect(page).toHaveURL(/[?&]hold=scalp,intraday/);
    await expect(page).toHaveURL(/[?&]dow=mon,tue/);

    const sharedUrl = page.url();

    // Fresh context — open the same URL, drawer should reflect the selection
    const fresh = await context.newPage();
    await fresh.goto(sharedUrl);
    await fresh.getByRole('button', { name: /filters/i }).click();

    const freshHoldGroup = fresh.getByRole('group', { name: /hold duration/i });
    await expect(
      freshHoldGroup.getByRole('button', { name: /scalp/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      freshHoldGroup.getByRole('button', { name: /intraday/i }),
    ).toHaveAttribute('aria-pressed', 'true');

    const freshDowGroup = fresh.getByRole('group', { name: /day of week/i });
    await expect(
      freshDowGroup.getByRole('button', { name: /^mon$/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      freshDowGroup.getByRole('button', { name: /^tue$/i }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('impossible combo + clear-all empties URL filter params', async ({
    page,
  }) => {
    await page.goto(`/w/${TEST_WALLET}`);

    await page.getByRole('button', { name: /filters/i }).click();

    // Pick whale + scalp — likely empty for any reasonable wallet
    const sizeGroup = page.getByRole('group', { name: /trade size/i });
    await sizeGroup.getByRole('button', { name: /whale/i }).click();
    const holdGroup = page.getByRole('group', { name: /hold duration/i });
    await holdGroup.getByRole('button', { name: /scalp/i }).click();

    // URL has both filter params
    await expect(page).toHaveURL(/[?&]size=whale/);
    await expect(page).toHaveURL(/[?&]hold=scalp/);

    // Click "Clear all" — either inside the drawer or on the chip strip
    await page.getByRole('button', { name: /clear all/i }).first().click();

    // URL no longer has any filter params
    await expect(page).not.toHaveURL(/[?&](size|hold|tod|dow)=/);
  });
});
```

**Note on test fixture:** the spec assumes `process.env.TEST_WALLET` is set in the Playwright config (mirrors 8a). If it isn't, fall through to a placeholder address; the URL-roundtrip assertions still work even when the trade list is empty.

- [ ] **Step 3: Run the new spec**

Run: `pnpm test:e2e e2e/filters-multiselect-roundtrip.spec.ts`
Expected: PASS, 2 tests.

If failures cite `aria-pressed` not yet matching, recheck Task 8's primitive (the button's `aria-pressed` is the lever that makes this assertion work).

- [ ] **Step 4: Run all E2E**

Run: `pnpm test:e2e`
Expected: PASS, 22 tests total (was 20 from 8a; +2 from this spec).

- [ ] **Step 5: Commit**

```bash
git add e2e/filters-multiselect-roundtrip.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): 8b multi-select roundtrip + clear-all

Two specs: (1) toggle hold + day-of-week, observe canonical URL,
fresh-context navigate and confirm the selection persists. (2)
Whale + scalp impossible combo, clear-all empties filter params.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Run the full gauntlet

**Files:** none modified.

- [ ] **Step 1: Run the full gauntlet**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build`
Expected: all five green. Test totals: ~576 unit / 22 E2E.

- [ ] **Step 2: If anything fails, debug and fix in a follow-up commit**

Common pitfalls to check first:
- `unused import` — ESLint flags the `HOLD_DURATION_ORDER` etc. imports if I left them in `FiltersDrawer.tsx`. Remove.
- `aria-description` not allowed by RTL `toHaveAttribute` — check the React version's prop spelling (`aria-description` vs `aria-description=…` literal).
- Day-of-week label collision in tests — `screen.getByText(/^mon$/i)` may match both the chip and the URL string in jsdom; tighten to `getByRole('button', { name: /^mon$/i })`.

- [ ] **Step 3: No commit unless a fix was applied**

If a fix was needed, commit it with an appropriate message.

---

# Phase 8 — Documentation (T14)

---

### Task 14: Update SESSION_LOG, BACKLOG, and CONVENTIONS

**Files:**
- Modify: `docs/SESSION_LOG.md`
- Modify: `docs/BACKLOG.md`
- Modify: `docs/CONVENTIONS.md` (only if a new convention emerged worth recording)

- [ ] **Step 1: Append a Session 8b entry to `docs/SESSION_LOG.md`**

Append a section in the same format as 8a (date 2026-05-02 unless implementation extends past midnight UTC; in that case use the actual completion date).

```markdown
## 2026-05-02 — Phase 2 Session 8b: Filter panel (4 trade-intrinsic dimensions)

**Session goal:** Extend 8a's filter pipeline with the four trade-intrinsic
dimensions from plan §11.5: hold-duration bucket, time of day, day of week,
and trade-size range. All multi-select. Local timezone for time-of-day and
day-of-week; UTC unchanged for date filters.

**Done:**

- `src/entities/filter-state.ts`: 4 new bucket literal types + 4 ORDER constants + extended `FilterState` and `DEFAULT_FILTER_STATE`.
- `src/domain/filters/buckets.ts` (new): label + numeric-range constants for hold-duration, time-of-day bands, day-of-week labels, trade-size buckets. Compile-time guard against type-vs-id drift.
- `src/domain/dates/timezone.ts` (new): `hourInTimeZone` / `weekdayIndexInTimeZone` via `Intl.DateTimeFormat`. Pure; tests pass arbitrary IANA `timeZone` strings for determinism.
- `src/domain/filters/bucketize.ts` (new): pure id-assignment helpers (`holdDurationBucketOf` / `timeOfDayBandOf` / `dayOfWeekOf` / `tradeSizeBucketOf`).
- `src/domain/filters/applyFilters.ts`: 4 new predicates (`matchesHoldDuration` / `matchesTimeOfDay` / `matchesDayOfWeek` / `matchesTradeSize`); `Options` extended with optional `timeZone`. Open trades use `now - openedAt`; truncated trades (`avgEntryPx === null`) excluded from any active size filter.
- `src/domain/filters/filterState.ts`: 4 toggle setters + 4 per-dimension clear setters; `isDefault` and `countActive` extended for the new arrays.
- `src/lib/validation/filterState.ts`: `parseEnumArrayOr` helper, `sortByCanonical` for serialize, four new param keys (`hold` / `tod` / `dow` / `size`), comma-delimited grammar with canonical-order serialization.
- `src/lib/ui/components/multi-bucket-control.tsx` (new): toggle-button-row primitive with `aria-pressed`. Used by all four 8b sections.
- `src/features/wallets/components/FiltersDrawer.tsx`: reorganized into three semantic groups (`When` / `What` / `Outcome / shape`) with no collapsing; inline `Group` subcomponent; the four new sections wired via `MultiBucketControl`.
- `src/features/wallets/components/ActiveFilterChips.tsx`: per-dimension chip with inline list when ≤ 3 buckets selected, "N selected" when ≥ 4. Chip X clears the entire dimension. Inline order matches canonical URL order.
- `src/app/WalletView.tsx`: passes `timeZone` to `applyFilters` resolved once via `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- E2E: `e2e/filters-multiselect-roundtrip.spec.ts` — apply + URL-share + fresh-context-navigate test, plus impossible-combo + clear-all test. [+2 E2E]
- End state: ~576 unit tests across ~78 files (was 496 / 76 after 8a; +80 this session), 22 E2E (was 20; +2). `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build` all green.

**Decisions made:** none requiring an ADR. Boundary handling for ORDER constants follows ADR-0006 + 8a precedent (entities/ owns types crossing the lib/domain split).

**Deferred / not done:**

- Stop-loss usage + tagged strategy/setup — Session 8c (next). Both require joining `TradeJournalEntry` with trades, breaking the pure `applyFilters(trades, state)` signature.
- Leverage bucket — BACKLOG `[later]`, blocked on data-source decision.
- Per-bucket chip removal (`Day: Mon` X removes only Mon) — BACKLOG `[maybe]`.
- Hour-level time-of-day filtering — BACKLOG `[maybe]`.
- Wallet-relative trade-size quartiles — BACKLOG `[maybe]`.
- "All selected = no filter" UX hint — BACKLOG `[maybe]`.
- Bulk-select buttons inside `MultiBucketControl` (e.g., "Weekdays") — BACKLOG `[maybe]`.

**Gotchas for next session:**

- ORDER constants live in `entities/filter-state.ts`, NOT `domain/filters/buckets.ts`, because `lib/validation` cannot import from `domain/`. New dimensions in 8c must follow the same split: bucket id literal + ORDER → entities; labels + ranges → domain.
- `applyFilters`'s `Options` now carries `timeZone`. Defaulting via `Intl.DateTimeFormat().resolvedOptions().timeZone` makes most tests pass without explicitly passing it, but **any test that touches time-of-day or day-of-week MUST pass `timeZone: 'UTC'` explicitly** to avoid environment-dependent flake.
- Open-trade hold-duration is computed live (`now - openedAt`). The bucket can drift across boundaries as time passes. Tests pass explicit `now` to assert deterministic bucketing.
- Truncated trades (`avgEntryPx === null`) are excluded from any active size filter and included when default. Mirrors the outcome filter excluding open trades.
- Canonical-order serialization is enforced on URL writes only. URL → state → URL is canonical even if the state was assembled in non-canonical order (reads preserve source order; rewrites canonicalize).
- `MultiBucketControl` is generic over the bucket id type. The four call sites in `FiltersDrawer.tsx` parameterize it explicitly via the type of `buckets`. If you reuse the primitive in 8c, mirror this pattern.
- Drawer Group subcomponent is inline to `FiltersDrawer.tsx` (mirrors 8a's `Section` / `PresetButton`). If 8c needs grouped UI elsewhere, extract to `lib/ui/`.
- The `ActiveFilterChips` `renderArrayChip` helper is local to that file; if 8c's chips need the same multi-select rendering, move the helper to a shared location or copy the pattern.

**Invariants assumed:**

- URL is the source of truth for filter state.
- `applyFilters(trades, DEFAULT_FILTER_STATE)` returns the input array by reference (identity equality).
- Bucket arrays are canonical-ordered on URL serialize (round-trip identity).
- Bucket boundaries are inclusive-low / exclusive-high; last bucket extends to `+Infinity`.
- Open-trade hold-duration is live-recalculated against `now`; closed-trade uses stored `holdTimeMs`.
- Truncated trades (`avgEntryPx === null`) are excluded from any active size-filter; included when default.
- `availableCoins` reflects the wallet's distinct coins from unfiltered trades (8a invariant preserved).
```

- [ ] **Step 2: Append a "Session 8b deferrals" section to `docs/BACKLOG.md`**

Append at the bottom of the file (immediately after the Session 8a section):

```markdown
## Session 8b deferrals

- `[next]` Session 8c — stop-loss usage + tagged strategy/setup. Both require joining `TradeJournalEntry` with trades, breaking the current pure-trade-array signature of `applyFilters`. Own session because the join architecture is the substantive new design.
- `[later]` Leverage bucket. Plan §11.5 hedges with *"if derivable"*. Neither `ReconstructedTrade` nor `RawFill` carries leverage data today; blocked on a data-source decision (compute notional × side as a proxy? add a leverage-tracking pass to reconstruction? require Hyperliquid `clearinghouseState` join?). Revisit once the data path is decided.
- `[maybe]` Per-bucket chip removal — clicking X on `Day: Mon` removes only Mon. 8b ships dimension-level chip clearing; per-bucket is additive.
- `[maybe]` Hour-level time-of-day filtering — bypasses 4-band buckets for 24-hour-grid multi-select. Power-user feature; URL grammar (`?hour=7,8,9,14,15,16,21`) and chip rendering would need bespoke handling.
- `[maybe]` Wallet-relative trade-size quartiles (Q1/Q2/Q3/Q4) as an alternative to absolute USD bins. Useful when comparing wallets of very different sizes on the same UI; thresholds computed from the unfiltered closed-trade set.
- `[maybe]` "All selected = no filter" UX hint in the drawer when the user has manually selected every bucket of a dimension. Today the chip honestly shows "N selected"; a subtle hint that this is functionally identical to default could reduce confusion.
- `[maybe]` Bulk-select / clear-all controls inside `MultiBucketControl` (e.g., a "Weekdays" button on day-of-week). Convenience.
- `[maybe]` Per-dimension provenance markers in chips. 8b chips read like "Hold: scalp" without `derived` badging — same as 8a. Reconsider when journal-derived dimensions land in 8c (stop-loss may carry `inferred` provenance when not journaled).
```

- [ ] **Step 3: Update `docs/CONVENTIONS.md` if a reusable pattern emerged**

Skim the current CONVENTIONS.md. The two patterns worth recording:
- Multi-select bucket types: literal id + ORDER constant in `entities/`, labels + numeric ranges in `domain/filters/buckets.ts`. (May already be covered by ADR-0006 and the 8a session-log gotcha; only record if it's not.)
- The `aria-pressed` toggle-button pattern in `MultiBucketControl` (vs. the `aria-checked` segmented-control radio pattern from 8a). Record if other multi-select UIs are likely.

If neither feels load-bearing for future sessions, **skip this step**. Don't pad CONVENTIONS.md.

- [ ] **Step 4: Commit the docs**

```bash
git add docs/SESSION_LOG.md docs/BACKLOG.md
# add docs/CONVENTIONS.md too if step 3 produced an edit
git commit -m "$(cat <<'EOF'
docs: record Session 8b session log + backlog

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Final phase checkpoint

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build
git log --oneline -20
```

Expected: gauntlet green; recent commits show the 8b commit chain in clean order. Push when ready.

---

# Self-review summary

**Spec coverage:** every section of `2026-05-02-session-8b-filters-design.md` maps to one or more tasks above —
- §3 architecture → T1, T2, T6, T7, T9, T10, T11
- §4 type shapes → T1, T2
- §5 domain layer → T3, T4, T5, T6
- §6 URL parse/serialize → T7
- §7 UI components → T8, T9, T10
- §8 testing → tests embedded in T2–T10, T12
- §9 backward compat & invariants → tested in T6 (default short-circuit), T7 (8a-only URLs round-trip), T11 (existing WalletView test)
- §10 BACKLOG additions → T14

**Placeholder scan:** no TBDs, TODOs, or "implement later" left. Every code step has runnable code; every test step has runnable tests.

**Type consistency:** `toggleHoldDuration`, `clearHoldDuration`, `matchesHoldDuration`, `holdDurationBucketOf`, `HoldDurationBucket`, `HOLD_DURATION_BUCKETS`, `HOLD_DURATION_ORDER` — names are consistent across all tasks. Same for the other three dimensions.

**Bucket boundary discipline:** `[lo, hi)` convention is documented in `buckets.ts` and asserted by `buckets.test.ts` boundary cases.
