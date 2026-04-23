# Phase 1 Session 7d — Trade/Strategy Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a single-strategy reference (`strategyId: string | null`) to `TradeJournalEntry`, surfaced as a native `<select>` picker on `TradeJournalForm` and as a clickable chip on `TradeDetail`. Trade and strategy remain separate entities; sessions unchanged.

**Architecture:** Additive field on the trade variant of the `JournalEntry` union. No Dexie schema bump (row value only; no new index). Zod extends `TradeJournalEntrySchema` with `.nullable().default(null)` for backwards-compat with pre-7d export files. UI mirrors the existing `mood` select pattern (change-marks-draft, blur-commits).

**Tech Stack:** No new dependencies. React, TanStack Query, Dexie, Zod, Playwright. Mocking via `vi.mock` for the unit-test chip-rendering cases.

---

## File structure (at end of session)

```
HyperJournal/
├── src/
│   ├── entities/
│   │   └── journal-entry.ts                              MODIFY (+strategyId on TradeJournalEntry)
│   ├── lib/
│   │   └── validation/
│   │       ├── export.ts                                 MODIFY (+strategyId on schema)
│   │       └── export.test.ts                            MODIFY (+3 cases)
│   ├── features/
│   │   └── journal/
│   │       └── components/
│   │           ├── TradeJournalForm.tsx                  MODIFY (+picker + draft field)
│   │           └── TradeJournalForm.test.tsx             MODIFY (+5 cases)
│   └── app/
│       ├── TradeDetail.tsx                               MODIFY (+chip)
│       └── TradeDetail.test.tsx                          MODIFY (+4 cases)
├── e2e/
│   └── trade-strategy-link.spec.ts                       NEW
└── docs/
    ├── SESSION_LOG.md                                    MODIFY (+Session 7d entry)
    ├── BACKLOG.md                                        MODIFY (+promoted items)
    └── CONVENTIONS.md                                    MODIFY (§15 note)
```

---

## Conventions (for every task)

- Commands from `/Users/angel/Documents/HyperJournal`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- TDD for schema + form + detail changes. Final E2E via Playwright.
- Gauntlet after every code task: `pnpm typecheck && pnpm lint && pnpm test`. Final full gauntlet + E2E at Task 6.

---

## Task 1: Entity — add `strategyId` to `TradeJournalEntry`

**Files:**
- Modify: `src/entities/journal-entry.ts`

- [ ] **Step 1.1: Add the field**

In `src/entities/journal-entry.ts`, find the `TradeJournalEntry` type. Insert `strategyId: string | null` between `stopLossUsed` and `provenance`:

```ts
export type TradeJournalEntry = {
  readonly id: string;
  readonly scope: 'trade';
  readonly tradeId: string;
  readonly createdAt: number;
  readonly updatedAt: number;

  readonly preTradeThesis: string;
  readonly postTradeReview: string;
  readonly lessonLearned: string;

  readonly mood: Mood | null;
  readonly planFollowed: boolean | null;
  readonly stopLossUsed: boolean | null;

  /**
   * UUID of a StrategyJournalEntry this trade is linked to, or null.
   * Introduced in Session 7d. Pre-7d rows may carry `undefined` in
   * storage; consumers treat `undefined` as `null` (see the form and
   * TradeDetail chip). Next upsert writes `null` explicitly.
   */
  readonly strategyId: string | null;

  readonly provenance: Provenance;
};
```

- [ ] **Step 1.2: Typecheck — expect cascading errors in the form**

```bash
pnpm typecheck 2>&1 | head -30
```

Expected: errors surface in `TradeJournalForm.tsx` (the `entry` object literal in `commit` is missing the `strategyId` field). These get fixed in Task 3. Don't commit yet.

---

## Task 2: Zod schema — extend `TradeJournalEntrySchema`

Add `strategyId` with backwards-compat default. TDD: new validation tests first.

**Files:**
- Modify: `src/lib/validation/export.ts`
- Modify: `src/lib/validation/export.test.ts`

- [ ] **Step 2.1: Write failing tests (RED)**

Open `src/lib/validation/export.test.ts`. Find the `describe('ExportFileSchema', ...)` block. Before the closing `});` of that describe, append three new cases:

```ts
  it('parses a trade entry with strategyId set to a string', () => {
    const out = ExportFileSchema.parse({
      ...validFile,
      data: {
        ...validFile.data,
        journalEntries: [
          {
            id: 'e1',
            scope: 'trade',
            tradeId: 'BTC-1',
            createdAt: 1,
            updatedAt: 1,
            preTradeThesis: '',
            postTradeReview: '',
            lessonLearned: '',
            mood: null,
            planFollowed: null,
            stopLossUsed: null,
            strategyId: 'strat-uuid-abc',
            provenance: 'observed',
          },
        ],
      },
    });
    const first = out.data.journalEntries![0]!;
    if (first.scope !== 'trade') throw new Error('expected trade');
    expect(first.strategyId).toBe('strat-uuid-abc');
  });

  it('parses a trade entry with strategyId explicitly null', () => {
    const out = ExportFileSchema.parse({
      ...validFile,
      data: {
        ...validFile.data,
        journalEntries: [
          {
            id: 'e1',
            scope: 'trade',
            tradeId: 'BTC-1',
            createdAt: 1,
            updatedAt: 1,
            preTradeThesis: '',
            postTradeReview: '',
            lessonLearned: '',
            mood: null,
            planFollowed: null,
            stopLossUsed: null,
            strategyId: null,
            provenance: 'observed',
          },
        ],
      },
    });
    const first = out.data.journalEntries![0]!;
    if (first.scope !== 'trade') throw new Error('expected trade');
    expect(first.strategyId).toBeNull();
  });

  it('defaults strategyId to null when the field is missing (pre-7d export)', () => {
    const out = ExportFileSchema.parse({
      ...validFile,
      data: {
        ...validFile.data,
        journalEntries: [
          {
            id: 'e1',
            scope: 'trade',
            tradeId: 'BTC-1',
            createdAt: 1,
            updatedAt: 1,
            preTradeThesis: '',
            postTradeReview: '',
            lessonLearned: '',
            mood: null,
            planFollowed: null,
            stopLossUsed: null,
            // no strategyId — pre-7d export shape
            provenance: 'observed',
          },
        ],
      },
    });
    const first = out.data.journalEntries![0]!;
    if (first.scope !== 'trade') throw new Error('expected trade');
    expect(first.strategyId).toBeNull();
  });
```

- [ ] **Step 2.2: Run — confirm RED**

```bash
pnpm test src/lib/validation/export.test.ts 2>&1 | tail -20
```

Expected: 3 new failures. The first two fail with "Unrecognized key(s): 'strategyId'" (schema doesn't know about the field). The third may pass on a stricter reading but will fail the `.toBeNull()` assertion because `strategyId` is not present on the output type.

- [ ] **Step 2.3: Extend the schema (GREEN)**

In `src/lib/validation/export.ts`, find `TradeJournalEntrySchema`:

```ts
const TradeJournalEntrySchema = z.object({
  id: z.string().min(1),
  scope: z.literal('trade'),
  tradeId: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  preTradeThesis: z.string(),
  postTradeReview: z.string(),
  lessonLearned: z.string(),
  mood: MoodSchema,
  planFollowed: z.boolean().nullable(),
  stopLossUsed: z.boolean().nullable(),
  provenance: z.enum(['observed', 'derived', 'inferred', 'unknown']),
});
```

Replace with:

```ts
const TradeJournalEntrySchema = z.object({
  id: z.string().min(1),
  scope: z.literal('trade'),
  tradeId: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  preTradeThesis: z.string(),
  postTradeReview: z.string(),
  lessonLearned: z.string(),
  mood: MoodSchema,
  planFollowed: z.boolean().nullable(),
  stopLossUsed: z.boolean().nullable(),
  strategyId: z.string().min(1).nullable().default(null),
  provenance: z.enum(['observed', 'derived', 'inferred', 'unknown']),
});
```

- [ ] **Step 2.4: Run — confirm GREEN + gauntlet**

```bash
pnpm test src/lib/validation/export.test.ts && pnpm typecheck 2>&1 | tail -30
```

Expected: validation tests all green. Typecheck now shows the single cascading error in `TradeJournalForm.tsx` (fixed in Task 3).

- [ ] **Step 2.5: Commit Task 1 + Task 2 together**

```bash
git add src/entities/journal-entry.ts \
        src/lib/validation/export.ts \
        src/lib/validation/export.test.ts
git commit -m "$(cat <<'EOF'
feat(journal): add strategyId to TradeJournalEntry + schema

TradeJournalEntry gains strategyId: string | null — UUID reference to
a StrategyJournalEntry, or null when the trade isn't linked. Session
and Strategy variants unchanged in 7d.

Zod schema adds strategyId with .nullable().default(null) so pre-7d
export files (missing the field entirely) still parse cleanly. No
formatVersion bump — additive union-branch change per CONVENTIONS §13.
No Dexie schema bump — row value only, no new index needed.

Pre-7d in-storage rows may carry `undefined` for this field until the
next upsert; consumers treat undefined as null.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: TradeJournalForm — strategy picker

Add the picker field to the form, hydrate from the entry, write on blur.

**Files:**
- Modify: `src/features/journal/components/TradeJournalForm.tsx`
- Modify: `src/features/journal/components/TradeJournalForm.test.tsx`

- [ ] **Step 3.1: Write failing tests (RED)**

Open `src/features/journal/components/TradeJournalForm.test.tsx`. Add a new helper and five new test cases.

After the imports, add a helper that seeds strategies:

```ts
import type { StrategyJournalEntry, TradeJournalEntry } from '@entities/journal-entry';

async function seedStrategy(
  db: HyperJournalDb,
  overrides: Partial<StrategyJournalEntry> & { id: string; name: string },
) {
  const full: StrategyJournalEntry = {
    scope: 'strategy',
    createdAt: 0,
    updatedAt: 0,
    conditions: '',
    invalidation: '',
    idealRR: '',
    examples: '',
    recurringMistakes: '',
    notes: '',
    provenance: 'observed',
    ...overrides,
  };
  await db.journalEntries.put(full);
}
```

Note: the existing file already imports `TradeJournalEntry`. Replace that import line with the combined form above (adds `StrategyJournalEntry`).

Before the closing `});` of `describe('TradeJournalForm', ...)`, append:

```ts
  it('renders the strategy picker with "— no strategy" option', async () => {
    renderForm();
    await waitFor(() =>
      expect(screen.getByLabelText(/^strategy$/i)).toBeInTheDocument(),
    );
    const select = screen.getByLabelText(/^strategy$/i) as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(
      Array.from(select.options).some((o) => /no strategy/i.test(o.textContent ?? '')),
    ).toBe(true);
  });

  it('renders strategies by name; blank names render as "Untitled"', async () => {
    await seedStrategy(db, { id: 's-a', name: 'Breakout' });
    await seedStrategy(db, { id: 's-b', name: '' });
    renderForm();
    await waitFor(() =>
      expect(screen.getByLabelText(/^strategy$/i)).toBeInTheDocument(),
    );
    const select = screen.getByLabelText(/^strategy$/i) as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent ?? '');
    expect(labels).toEqual(
      expect.arrayContaining([expect.stringMatching(/Breakout/), 'Untitled']),
    );
  });

  it('selecting a strategy + blur saves strategyId', async () => {
    await seedStrategy(db, { id: 's-a', name: 'Breakout' });
    renderForm();
    await waitFor(() =>
      expect(screen.getByLabelText(/^strategy$/i)).toBeInTheDocument(),
    );
    const select = screen.getByLabelText(/^strategy$/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 's-a' } });
    fireEvent.blur(select);
    await waitFor(async () => {
      const rows = await db.journalEntries.toArray();
      const trade = rows.find((r) => r.scope === 'trade');
      if (!trade || trade.scope !== 'trade') throw new Error('expected trade');
      expect(trade.strategyId).toBe('s-a');
    });
  });

  it('selecting "— no strategy" after a prior link saves strategyId=null', async () => {
    // Seed a trade entry already linked to a strategy.
    const existing: TradeJournalEntry = {
      id: 'e1',
      scope: 'trade',
      tradeId: 'BTC-1',
      createdAt: 100,
      updatedAt: 100,
      preTradeThesis: '',
      postTradeReview: '',
      lessonLearned: '',
      mood: null,
      planFollowed: null,
      stopLossUsed: null,
      strategyId: 's-a',
      provenance: 'observed',
    };
    await db.journalEntries.put(existing);
    await seedStrategy(db, { id: 's-a', name: 'Breakout' });
    renderForm();
    await waitFor(() =>
      expect((screen.getByLabelText(/^strategy$/i) as HTMLSelectElement).value).toBe('s-a'),
    );
    const select = screen.getByLabelText(/^strategy$/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '' } });
    fireEvent.blur(select);
    await waitFor(async () => {
      const row = await db.journalEntries.get('e1');
      if (!row || row.scope !== 'trade') throw new Error('expected trade');
      expect(row.strategyId).toBeNull();
    });
  });

  it('renders "— deleted strategy" when strategyId has no matching row', async () => {
    const existing: TradeJournalEntry = {
      id: 'e1',
      scope: 'trade',
      tradeId: 'BTC-1',
      createdAt: 100,
      updatedAt: 100,
      preTradeThesis: '',
      postTradeReview: '',
      lessonLearned: '',
      mood: null,
      planFollowed: null,
      stopLossUsed: null,
      strategyId: 'gone',
      provenance: 'observed',
    };
    await db.journalEntries.put(existing);
    renderForm();
    await waitFor(() =>
      expect((screen.getByLabelText(/^strategy$/i) as HTMLSelectElement).value).toBe('gone'),
    );
    const select = screen.getByLabelText(/^strategy$/i) as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent ?? '');
    expect(labels).toEqual(
      expect.arrayContaining([expect.stringMatching(/deleted strategy/i)]),
    );
  });
```

- [ ] **Step 3.2: Run — confirm RED**

```bash
pnpm test src/features/journal/components/TradeJournalForm.test.tsx 2>&1 | tail -20
```

Expected: 5 new failures. All hit "Unable to find a label with text 'strategy'" or similar (the field doesn't exist yet).

- [ ] **Step 3.3: Add `strategyId` to the form draft + commit logic (GREEN)**

Open `src/features/journal/components/TradeJournalForm.tsx`. Apply the following edits.

**Edit A — imports.** Replace the first three imports:

```ts
import { useEffect, useRef, useState } from 'react';
import { useTradeJournalEntry } from '../hooks/useTradeJournalEntry';
import { TriStateRadio } from './TriStateRadio';
import { Label } from '@lib/ui/components/label';
import { cn } from '@lib/ui/utils';
import type { Mood, TradeJournalEntry } from '@entities/journal-entry';
import type { HyperJournalDb } from '@lib/storage/db';
```

with:

```ts
import { useEffect, useRef, useState } from 'react';
import { useTradeJournalEntry } from '../hooks/useTradeJournalEntry';
import { useStrategies } from '../hooks/useStrategies';
import { TriStateRadio } from './TriStateRadio';
import { Label } from '@lib/ui/components/label';
import { cn } from '@lib/ui/utils';
import type { Mood, TradeJournalEntry } from '@entities/journal-entry';
import type { HyperJournalDb } from '@lib/storage/db';
```

**Edit B — DraftState.** Replace the existing `DraftState` type:

```ts
type DraftState = {
  preTradeThesis: string;
  postTradeReview: string;
  lessonLearned: string;
  mood: Mood | null;
  planFollowed: boolean | null;
  stopLossUsed: boolean | null;
};
```

with:

```ts
type DraftState = {
  preTradeThesis: string;
  postTradeReview: string;
  lessonLearned: string;
  mood: Mood | null;
  planFollowed: boolean | null;
  stopLossUsed: boolean | null;
  strategyId: string | null;
};
```

**Edit C — EMPTY_DRAFT.** Replace:

```ts
const EMPTY_DRAFT: DraftState = {
  preTradeThesis: '',
  postTradeReview: '',
  lessonLearned: '',
  mood: null,
  planFollowed: null,
  stopLossUsed: null,
};
```

with:

```ts
const EMPTY_DRAFT: DraftState = {
  preTradeThesis: '',
  postTradeReview: '',
  lessonLearned: '',
  mood: null,
  planFollowed: null,
  stopLossUsed: null,
  strategyId: null,
};
```

**Edit D — isDraftEmpty.** Replace the function body:

```ts
function isDraftEmpty(draft: DraftState): boolean {
  return (
    draft.preTradeThesis.trim() === '' &&
    draft.postTradeReview.trim() === '' &&
    draft.lessonLearned.trim() === '' &&
    draft.mood === null &&
    draft.planFollowed === null &&
    draft.stopLossUsed === null
  );
}
```

with:

```ts
function isDraftEmpty(draft: DraftState): boolean {
  return (
    draft.preTradeThesis.trim() === '' &&
    draft.postTradeReview.trim() === '' &&
    draft.lessonLearned.trim() === '' &&
    draft.mood === null &&
    draft.planFollowed === null &&
    draft.stopLossUsed === null &&
    draft.strategyId === null
  );
}
```

**Edit E — entryToDraft.** Replace:

```ts
function entryToDraft(entry: TradeJournalEntry | null): DraftState {
  if (!entry) return { ...EMPTY_DRAFT };
  return {
    preTradeThesis: entry.preTradeThesis,
    postTradeReview: entry.postTradeReview,
    lessonLearned: entry.lessonLearned,
    mood: entry.mood,
    planFollowed: entry.planFollowed,
    stopLossUsed: entry.stopLossUsed,
  };
}
```

with:

```ts
function entryToDraft(entry: TradeJournalEntry | null): DraftState {
  if (!entry) return { ...EMPTY_DRAFT };
  return {
    preTradeThesis: entry.preTradeThesis,
    postTradeReview: entry.postTradeReview,
    lessonLearned: entry.lessonLearned,
    mood: entry.mood,
    planFollowed: entry.planFollowed,
    stopLossUsed: entry.stopLossUsed,
    // Pre-7d rows carry undefined here; treat as null.
    strategyId: entry.strategyId ?? null,
  };
}
```

**Edit F — commit entry construction.** Find the `const entry: TradeJournalEntry = { ... }` literal inside `commit`. Add `strategyId: next.strategyId,` between `stopLossUsed` and `provenance`:

```ts
    const entry: TradeJournalEntry = {
      id: hook.entry?.id ?? crypto.randomUUID(),
      scope: 'trade',
      tradeId,
      createdAt: hook.entry?.createdAt ?? now,
      updatedAt: now,
      preTradeThesis: next.preTradeThesis,
      postTradeReview: next.postTradeReview,
      lessonLearned: next.lessonLearned,
      mood: next.mood,
      planFollowed: next.planFollowed,
      stopLossUsed: next.stopLossUsed,
      strategyId: next.strategyId,
      provenance: 'observed',
    };
```

**Edit G — pull the strategies list and render the picker.** Add a new hook call and JSX block.

Right after the existing `const hook = useTradeJournalEntry(tradeId, db ? { db } : {});` line (line 79 in the current file), add:

```ts
  const strategies = useStrategies(db ? { db } : {});
```

Then, in the JSX, after the `mood` field's closing `</div>` (the `<div>` that ends just before the `<TriStateRadio legend="Plan followed?" ...>`), insert the new picker block:

```tsx
      <div className="flex flex-col gap-2">
        <Label htmlFor="strategy">Strategy</Label>
        <select
          id="strategy"
          value={draft.strategyId ?? ''}
          onChange={(e) =>
            change('strategyId', e.target.value === '' ? null : e.target.value)
          }
          onBlur={onBlurCommit}
          className={cn(
            'h-10 rounded-md border border-border bg-bg-overlay px-3 text-sm text-fg-base',
            'ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          )}
        >
          <option value="">— no strategy</option>
          {draft.strategyId &&
            !strategies.entries.some((s) => s.id === draft.strategyId) && (
              <option value={draft.strategyId}>— deleted strategy</option>
            )}
          {strategies.entries.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name.trim() === '' ? 'Untitled' : s.name}
            </option>
          ))}
        </select>
        {!strategies.isLoading && strategies.entries.length === 0 && (
          <p className="text-xs text-fg-muted">
            Create strategies in{' '}
            <a
              href="/strategies"
              className="underline ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              /strategies
            </a>
            .
          </p>
        )}
      </div>
```

- [ ] **Step 3.4: Run — confirm GREEN + gauntlet**

```bash
pnpm test src/features/journal/components/TradeJournalForm.test.tsx && pnpm typecheck && pnpm lint 2>&1 | tail -15
```

Expected: 11 tests pass (6 existing + 5 new). Typecheck and lint both clean.

If the "empty-form blur does NOT create a row" legacy test now fails because an orphaned strategyId could be interpreted as non-empty: it shouldn't — `isDraftEmpty` includes the new `strategyId === null` clause, and a fresh form has `strategyId: null`. If it does fail, re-verify Edit D.

- [ ] **Step 3.5: Commit**

```bash
git add src/features/journal/components/TradeJournalForm.tsx \
        src/features/journal/components/TradeJournalForm.test.tsx
git commit -m "$(cat <<'EOF'
feat(journal): add strategy picker to TradeJournalForm

Inline native <select> driven by useStrategies. "— no strategy" at
top (value="") commits strategyId=null; each real strategy renders by
name (blank → "Untitled"). Matches the mindset-select pattern: change
marks draft dirty, blur commits.

Orphaned-id handling: when the stored strategyId has no matching row
(strategy deleted offline or imported with a dangling ref), an extra
"— deleted strategy" option is rendered with the orphan id as its
value so <select>.value stays synced without a controlled-input
warning. The option disappears on the next render once the user picks
anything else.

Zero-strategy state shows a helper line linking to /strategies so
first-time users know where to create setups.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: TradeDetail — header chip

Show a clickable "Strategy: <name> →" chip in the header when the linked strategy resolves.

**Files:**
- Modify: `src/app/TradeDetail.tsx`
- Modify: `src/app/TradeDetail.test.tsx`

- [ ] **Step 4.1: Rewrite the test file with vi.mock (RED)**

The existing `TradeDetail.test.tsx` uses real fetch (stubbed to empty) — fine for the two redirect cases but not for chip tests that need actual trade data. Rather than build fixture parsing, mock `@features/wallets` so we can inject a synthetic `ReconstructedTrade`.

Replace the entire contents of `src/app/TradeDetail.test.tsx` with:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TradeDetail } from './TradeDetail';
import { HyperJournalDb } from '@lib/storage/db';
import { useWalletMetrics } from '@features/wallets';
import type { ReconstructedTrade } from '@entities/trade';
import type {
  StrategyJournalEntry,
  TradeJournalEntry,
} from '@entities/journal-entry';

vi.mock('@features/wallets', async () => {
  const actual = await vi.importActual<typeof import('@features/wallets')>(
    '@features/wallets',
  );
  return {
    ...actual,
    useWalletMetrics: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`hj-trade-detail-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

const TEST_ADDR = '0x0000000000000000000000000000000000000001';

function makeTrade(overrides: Partial<ReconstructedTrade> = {}): ReconstructedTrade {
  return {
    id: 'BTC-1',
    wallet: null,
    coin: 'BTC',
    side: 'long',
    status: 'closed',
    legs: [],
    openedAt: 1_700_000_000_000,
    closedAt: 1_700_000_500_000,
    holdTimeMs: 500_000,
    openedSize: 1,
    closedSize: 1,
    avgEntryPx: 50_000,
    avgExitPx: 51_000,
    realizedPnl: 1000,
    totalFees: 10,
    provenance: 'observed',
    ...overrides,
  };
}

function mockMetrics(trades: ReadonlyArray<ReconstructedTrade>) {
  (useWalletMetrics as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    stats: null,
    trades,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refresh: vi.fn().mockResolvedValue(undefined),
  });
}

async function seedTradeJournal(
  overrides: Partial<TradeJournalEntry> & { tradeId: string },
) {
  const full: TradeJournalEntry = {
    id: 'te-1',
    scope: 'trade',
    createdAt: 100,
    updatedAt: 100,
    preTradeThesis: '',
    postTradeReview: '',
    lessonLearned: '',
    mood: null,
    planFollowed: null,
    stopLossUsed: null,
    strategyId: null,
    provenance: 'observed',
    ...overrides,
  };
  await db.journalEntries.put(full);
}

async function seedStrategy(overrides: Partial<StrategyJournalEntry> & { id: string; name: string }) {
  const full: StrategyJournalEntry = {
    scope: 'strategy',
    createdAt: 0,
    updatedAt: 0,
    conditions: '',
    invalidation: '',
    idealRR: '',
    examples: '',
    recurringMistakes: '',
    notes: '',
    provenance: 'observed',
    ...overrides,
  };
  await db.journalEntries.put(full);
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<div data-testid="home">home</div>} />
          <Route path="/w/:address" element={<div data-testid="wallet-view">wallet view</div>} />
          <Route path="/s/:id" element={<div data-testid="strategy-detail">strategy detail</div>} />
          <Route path="/w/:address/t/:tradeId" element={<TradeDetail db={db} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TradeDetail routing', () => {
  it('redirects when the address is invalid', () => {
    mockMetrics([]);
    renderAt('/w/not-a-hex/t/BTC-1');
    expect(screen.getByTestId('home')).toBeInTheDocument();
  });

  it('redirects to /w/:address when the tradeId does not match any trade', () => {
    mockMetrics([]);
    renderAt(`/w/${TEST_ADDR}/t/NONEXISTENT`);
    expect(screen.getByTestId('wallet-view')).toBeInTheDocument();
  });
});

describe('TradeDetail strategy chip', () => {
  it('chip is not rendered when the trade has no linked strategy', async () => {
    mockMetrics([makeTrade({ id: 'BTC-1' })]);
    await seedTradeJournal({ tradeId: 'BTC-1', strategyId: null });
    renderAt(`/w/${TEST_ADDR}/t/BTC-1`);
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/^Strategy:/i)).toBeNull();
  });

  it('chip renders with strategy name and links to /s/:id', async () => {
    mockMetrics([makeTrade({ id: 'BTC-1' })]);
    await seedStrategy({ id: 's-a', name: 'Breakout' });
    await seedTradeJournal({ tradeId: 'BTC-1', strategyId: 's-a' });
    renderAt(`/w/${TEST_ADDR}/t/BTC-1`);
    await waitFor(() => expect(screen.getByText(/Strategy:\s*Breakout/i)).toBeInTheDocument());
    const chip = screen.getByRole('link', { name: /Strategy:\s*Breakout/i });
    expect(chip).toHaveAttribute('href', '/s/s-a');
  });

  it('chip shows "Strategy: Untitled" when the linked strategy has a blank name', async () => {
    mockMetrics([makeTrade({ id: 'BTC-1' })]);
    await seedStrategy({ id: 's-a', name: '' });
    await seedTradeJournal({ tradeId: 'BTC-1', strategyId: 's-a' });
    renderAt(`/w/${TEST_ADDR}/t/BTC-1`);
    await waitFor(() => expect(screen.getByText(/Strategy:\s*Untitled/i)).toBeInTheDocument());
  });

  it('chip is not rendered when the strategyId points at a nonexistent strategy', async () => {
    mockMetrics([makeTrade({ id: 'BTC-1' })]);
    await seedTradeJournal({ tradeId: 'BTC-1', strategyId: 'gone' });
    renderAt(`/w/${TEST_ADDR}/t/BTC-1`);
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/^Strategy:/i)).toBeNull();
  });
});
```

- [ ] **Step 4.2: Run — confirm RED**

```bash
pnpm test src/app/TradeDetail.test.tsx 2>&1 | tail -30
```

Expected: routing tests pass (they work with the mocked metrics). The chip tests fail because (a) `TradeDetail` doesn't currently accept a `db` prop, and (b) the chip isn't rendered.

- [ ] **Step 4.3: Implement chip + db prop (GREEN)**

Open `src/app/TradeDetail.tsx`. Apply the following.

**Edit A — imports.** Replace the import block at the top with:

```tsx
import { useParams, Navigate, Link } from 'react-router-dom';
import { isValidWalletAddress } from '@domain/wallets/isValidWalletAddress';
import { useWalletMetrics } from '@features/wallets';
import {
  TradeJournalForm,
  useStrategies,
  useTradeJournalEntry,
} from '@features/journal';
import { formatCurrency, formatHoldTime } from '@lib/ui/format';
import type { WalletAddress } from '@entities/wallet';
import type { ReconstructedTrade } from '@entities/trade';
import type { HyperJournalDb } from '@lib/storage/db';
```

**Edit B — `TradeDetail` component signature.** Replace the existing function:

```tsx
export function TradeDetail() {
  const { address, tradeId } = useParams<{ address: string; tradeId: string }>();

  if (!address || !isValidWalletAddress(address)) {
    return <Navigate to="/" replace />;
  }
  if (!tradeId) {
    return <Navigate to={`/w/${address}`} replace />;
  }

  return <TradeDetailInner address={address} tradeId={tradeId} />;
}
```

with:

```tsx
type Props = { db?: HyperJournalDb };

export function TradeDetail({ db }: Props = {}) {
  const { address, tradeId } = useParams<{ address: string; tradeId: string }>();

  if (!address || !isValidWalletAddress(address)) {
    return <Navigate to="/" replace />;
  }
  if (!tradeId) {
    return <Navigate to={`/w/${address}`} replace />;
  }

  return (
    <TradeDetailInner
      address={address}
      tradeId={tradeId}
      {...(db ? { db } : {})}
    />
  );
}
```

**Edit C — `TradeDetailInner`.** Replace:

```tsx
function TradeDetailInner({
  address,
  tradeId,
}: {
  address: WalletAddress;
  tradeId: string;
}) {
  const metrics = useWalletMetrics(address);

  if (metrics.isLoading) {
    return (
      <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
        <p className="text-fg-muted">Loading trade…</p>
      </main>
    );
  }

  const trade = metrics.trades.find((t) => t.id === tradeId);
  if (!trade) {
    return <Navigate to={`/w/${address}`} replace />;
  }

  return (
    <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="text-xl font-semibold text-fg-base">{trade.coin}</h1>
          <SideBadge side={trade.side} />
          <StatusBadge status={trade.status} />
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/settings"
            className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            Settings
          </Link>
          <Link
            to={`/w/${address}`}
            className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            ← Back
          </Link>
        </div>
      </header>

      <TradeSummary trade={trade} />
      <TradeJournalForm tradeId={trade.id} />
    </main>
  );
}
```

with:

```tsx
function TradeDetailInner({
  address,
  tradeId,
  db,
}: {
  address: WalletAddress;
  tradeId: string;
  db?: HyperJournalDb;
}) {
  const metrics = useWalletMetrics(address);
  const journal = useTradeJournalEntry(tradeId, db ? { db } : {});
  const strategies = useStrategies(db ? { db } : {});

  if (metrics.isLoading) {
    return (
      <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
        <p className="text-fg-muted">Loading trade…</p>
      </main>
    );
  }

  const trade = metrics.trades.find((t) => t.id === tradeId);
  if (!trade) {
    return <Navigate to={`/w/${address}`} replace />;
  }

  const strategyId = journal.entry?.strategyId ?? null;
  const linkedStrategy = strategyId
    ? strategies.entries.find((s) => s.id === strategyId) ?? null
    : null;

  return (
    <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="text-xl font-semibold text-fg-base">{trade.coin}</h1>
          <SideBadge side={trade.side} />
          <StatusBadge status={trade.status} />
          {linkedStrategy && (
            <Link
              to={`/s/${linkedStrategy.id}`}
              className="rounded-md border border-border bg-bg-overlay px-2 py-0.5 text-xs text-fg-base underline ring-offset-bg-base hover:bg-bg-overlay/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              Strategy: {linkedStrategy.name.trim() === '' ? 'Untitled' : linkedStrategy.name} →
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/settings"
            className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            Settings
          </Link>
          <Link
            to={`/w/${address}`}
            className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            ← Back
          </Link>
        </div>
      </header>

      <TradeSummary trade={trade} />
      <TradeJournalForm tradeId={trade.id} {...(db ? { db } : {})} />
    </main>
  );
}
```

The rest of the file (`SideBadge`, `StatusBadge`, `TradeSummary`, `SummaryCell`) stays unchanged.

- [ ] **Step 4.4: Run — confirm GREEN + gauntlet**

```bash
pnpm test src/app/TradeDetail.test.tsx && pnpm typecheck && pnpm lint 2>&1 | tail -10
```

Expected: 6 tests pass (2 routing + 4 chip). Typecheck and lint clean.

If the "chip renders with strategy name and links" test fails with a getByRole ambiguity error (multiple links matching `/Strategy:/`), the chip's text may be wrapping in a way that the accessible name is different from visible text; in that case replace `getByRole('link', ...)` with `getByText(/Strategy:\s*Breakout/i).closest('a')` in the test and assert the `href` on that element.

- [ ] **Step 4.5: Commit**

```bash
git add src/app/TradeDetail.tsx src/app/TradeDetail.test.tsx
git commit -m "$(cat <<'EOF'
feat(app): TradeDetail header chip for linked strategy

Small "Strategy: <name> →" chip renders next to the side/status
badges when the trade's journal entry has a strategyId that resolves
to an existing strategy. Click navigates to /s/:id. Blank-name
strategies render as "Strategy: Untitled" (matching the /strategies
list + /s/:id detail conventions).

Orphaned strategyId (points at a missing row): chip is hidden. The
TradeJournalForm picker still shows "— deleted strategy" so the state
is visible inside the editing surface.

TradeDetail gains an optional db prop so tests can inject an isolated
Dexie instance, matching the pattern used by Strategies.tsx and
StrategyDetail.tsx.

TradeDetail.test.tsx rewritten to use vi.mock('@features/wallets') so
the chip tests can inject a synthetic ReconstructedTrade without
parsing the Hyperliquid fixture. Routing tests updated to the same
pattern for consistency.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Playwright E2E — trade/strategy link round-trip

**Files:**
- Create: `e2e/trade-strategy-link.spec.ts`

- [ ] **Step 5.1: Write the spec**

Create `e2e/trade-strategy-link.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { mockHyperliquid } from './fixtures/hyperliquid-route';

const TEST_ADDR = '0x0000000000000000000000000000000000000001';

test.describe('trade ↔ strategy link round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await mockHyperliquid(page);
  });

  test('create strategy → link from TradeJournalForm → chip appears → reload → persists', async ({
    page,
  }) => {
    // 1. Create a strategy via /strategies.
    await page.goto('/');
    await page.getByRole('link', { name: /strategies/i }).click();
    await expect(page).toHaveURL(/\/strategies$/);
    await page.getByLabel(/new strategy name/i).fill('E2E Setup');
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page).toHaveURL(/\/s\/[0-9a-f-]{36}$/);

    // 2. Navigate to the wallet and into a trade via the history table.
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}$`));
    const table = page.getByRole('table', { name: /trade history/i });
    await expect(table).toBeVisible();
    await table.getByRole('row').nth(1).click();
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}/t/`));

    // 3. Pick the strategy from the picker.
    const picker = page.getByLabel(/^strategy$/i);
    await picker.selectOption({ label: 'E2E Setup' });
    // Leaving the control commits the change.
    await page.getByRole('heading', { level: 1 }).click();
    await expect(page.getByText(/saved at/i)).toBeVisible();

    // 4. Chip appears in the header with the strategy name.
    const chip = page.getByRole('link', { name: /Strategy:\s*E2E Setup/i });
    await expect(chip).toBeVisible();

    // 5. Reload — selection + chip persist.
    await page.reload();
    await expect(page.getByLabel(/^strategy$/i)).toHaveValue(/[0-9a-f-]{36}/);
    await expect(
      page.getByRole('link', { name: /Strategy:\s*E2E Setup/i }),
    ).toBeVisible();

    // 6. Chip click navigates to /s/:id.
    await page.getByRole('link', { name: /Strategy:\s*E2E Setup/i }).click();
    await expect(page).toHaveURL(/\/s\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('E2E Setup');
  });

  test('unlinking via "— no strategy" removes the chip', async ({ page }) => {
    // Seed: create a strategy, link a trade.
    await page.goto('/');
    await page.getByRole('link', { name: /strategies/i }).click();
    await page.getByLabel(/new strategy name/i).fill('To Unlink');
    await page.getByRole('button', { name: /create/i }).click();

    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    const table = page.getByRole('table', { name: /trade history/i });
    await table.getByRole('row').nth(1).click();

    const picker = page.getByLabel(/^strategy$/i);
    await picker.selectOption({ label: 'To Unlink' });
    await page.getByRole('heading', { level: 1 }).click();
    await expect(page.getByText(/saved at/i)).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Strategy:\s*To Unlink/i }),
    ).toBeVisible();

    // Unlink.
    await picker.selectOption({ label: '— no strategy' });
    await page.getByRole('heading', { level: 1 }).click();
    await expect(
      page.getByRole('link', { name: /Strategy:\s*To Unlink/i }),
    ).toBeHidden();

    // Reload — still unlinked.
    await page.reload();
    await expect(page.getByLabel(/^strategy$/i)).toHaveValue('');
    await expect(
      page.getByRole('link', { name: /Strategy:\s*To Unlink/i }),
    ).toBeHidden();
  });
});
```

- [ ] **Step 5.2: Run the E2E**

```bash
pnpm test:e2e e2e/trade-strategy-link.spec.ts 2>&1 | tail -15
```

Expected: 2 tests pass.

If the picker `selectOption({ label: '— no strategy' })` fails with "not found", fall back to `selectOption('')` — it matches by value.

- [ ] **Step 5.3: Commit**

```bash
git add e2e/trade-strategy-link.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): add trade ↔ strategy link round-trip

Two tests. (1) Create a strategy via /strategies → open a trade
detail via the history table → select the strategy in the picker →
verify the header chip appears → reload → verify picker value +
chip persist → click the chip → lands on /s/:id.

(2) Seeded-linked variant: unlink via "— no strategy" → chip hides
→ reload → still unlinked.

Exercises the full create → link → persist → navigate loop between
Strategies / TradeDetail / StrategyDetail.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Close-out docs + full gauntlet

**Files:**
- Modify: `docs/SESSION_LOG.md`
- Modify: `docs/BACKLOG.md`
- Modify: `docs/CONVENTIONS.md`

- [ ] **Step 6.1: Run the full gauntlet first — need final test counts**

```bash
pnpm typecheck && pnpm lint && pnpm test:coverage 2>&1 | tail -40
```

Expected: all green; domain coverage ≥ 90%. Note the final unit test count (expected ~329, 317 + 12).

```bash
pnpm build 2>&1 | tail -5
pnpm test:e2e 2>&1 | tail -10
```

Expected: build clean; 11 E2E tests pass (9 + 2).

- [ ] **Step 6.2: Append Session 7d entry to SESSION_LOG.md**

Open `docs/SESSION_LOG.md`, append at the very end (after the Session 7c entry):

```markdown

## 2026-04-23 — Phase 1 Session 7d: Trade ↔ strategy link

**Session goal:** Let the user link a trade journal entry to one of their strategies. First concrete payoff from Session 7c's strategy scope. Split from the original combined "7d — Tags + linking" scope; tags now live in Session 7e, screenshots in 7f.

**Done:**

- `TradeJournalEntry` gains `strategyId: string | null`. No Dexie schema bump — row value only; pre-7d rows load with `undefined` and self-heal on next upsert.
- Zod `TradeJournalEntrySchema` extended with `strategyId: z.string().min(1).nullable().default(null)` for backwards-compat with pre-7d export files. `formatVersion` unchanged at 1. [+3 validation cases]
- `TradeJournalForm` gains an inline native `<select>` picker driven by `useStrategies`. Matches the `mood`-select pattern: `onChange` marks draft dirty, `onBlur` commits. Blank-name strategies render as "Untitled". Zero-strategy state shows a helper line linking to `/strategies`. Orphaned stored ids render as a `"— deleted strategy"` option that vanishes once any real value is chosen. [+5 form tests]
- `TradeDetail` gains an optional `db` prop (matches Strategies/StrategyDetail) and composes `useTradeJournalEntry` + `useStrategies` to resolve the current strategy. When the id resolves to an existing row, a small `"Strategy: <name> →"` chip renders in the header next to the side/status badges, linking to `/s/:id`. Orphaned ids — no chip. [+4 detail tests]
- `TradeDetail.test.tsx` rewritten to use `vi.mock('@features/wallets')` so the chip tests can inject a synthetic `ReconstructedTrade` without going through fetch + reconstruction; the two existing routing tests migrated to the same pattern for consistency.
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

**Invariants assumed:**

- `strategyId` values are UUIDs produced by `useCreateStrategy` (`crypto.randomUUID()`). The schema doesn't validate UUID format; the `.min(1)` guard is enough.
- At most one strategy per trade in Phase 1. Widening to `strategyIds: string[]` later is additive.
- Strategy names may be blank; UI renders `"Untitled"` but storage preserves `""` — same convention as `/strategies` and `/s/:id`.

---
```

- [ ] **Step 6.3: Update BACKLOG.md**

Open `docs/BACKLOG.md`. Find the existing Session 7c deferrals section near the bottom. The following entries need to be updated or promoted:

**Locate this existing 7c entry and change it:**

```markdown
- `[next]` Tags + trade↔strategy linking — Session 7d. `tags: string[]` on all journal variants; trades reference strategies by id. Autocomplete from existing tags. Normalization decisions (case sensitivity, whitespace).
```

**Replace with:**

```markdown
- `[next]` Tags — Session 7e. `tags: string[]` on all journal variants (trade, session, strategy). Chip-input component, denormalized storage, strict-normalize on save (lowercase + trim). Screenshots shift to Session 7f.
```

**Find the "Per-strategy analytics" entry and update the blocker:**

```markdown
- `[maybe]` Per-strategy analytics on `/w/:address` (e.g., win rate of trades tagged with strategy X). Blocked on tags + trade↔strategy linking.
```

**Replace with:**

```markdown
- `[maybe]` Per-strategy analytics on `/w/:address` (e.g., win rate of trades linked to strategy X). Unblocked after Session 7d; depends on having enough linked trades to be meaningful.
```

**Append a Session 7d deferrals block at the end of the file:**

```markdown

---

## Session 7d deferrals

- `[next]` Tags (see above, now Session 7e).
- `[maybe]` Reverse-lookup list of "trades linked to this strategy" on `/s/:id`. Design-blocked until tags land (picker vs filter UX interacts with tag filtering). Small implementation but wants the right home.
- `[maybe]` Strategy deletion UI. Current orphan UX (graceful chip-hide + "— deleted strategy" picker option) is ready for it; need a confirmation dialog and a decision on soft-archive vs hard-delete.
- `[maybe]` `strategyIds: string[]` widening. One strategy per trade covers Phase 1; revisit if users report trades fitting multiple setups simultaneously.
- `[maybe]` Uuid-format validation on `strategyId` (Zod `.uuid()`). Makes test fixtures brittle for zero gain today; wait for a real reason.
- `[maybe]` Bulk strategy-linking from the trade-history list (right-click a trade → pick strategy). Keyboard-heavy users would want it; most users won't.
```

- [ ] **Step 6.4: Amend CONVENTIONS §15**

Open `docs/CONVENTIONS.md`. Find `## 15. Journaling`. At the end of that section (after the existing bullets), append:

```markdown
- **Trade-to-strategy link is a single nullable id.** `TradeJournalEntry.strategyId: string | null` — a UUID pointing at a `StrategyJournalEntry.id`, or null when unlinked. Widening to a `string[]` is additive and should only happen if multi-link is a real user request.
- **Pre-7d rows coerce on read.** `strategyId` may be `undefined` in IndexedDB for entries written before Session 7d. Every read path (form hydration, detail-page lookup) uses `entry.strategyId ?? null`. The row self-heals on the next upsert (schema writes `null` explicitly).
- **Orphan-id UX.** When a stored `strategyId` doesn't resolve to any current strategy row, the picker renders an additional `"— deleted strategy"` option (value = the orphan id) so the `<select>` stays in sync without a controlled-input warning. The `TradeDetail` header chip is hidden in the same case — hiding outside the editing surface is the cleaner reading signal.
```

- [ ] **Step 6.5: Commit**

```bash
git add docs/SESSION_LOG.md docs/BACKLOG.md docs/CONVENTIONS.md
git commit -m "$(cat <<'EOF'
docs: record Session 7d session log, backlog, conventions

Captures the trade/strategy-link session: strategyId on the trade
variant, Zod schema extension with backwards-compat default,
TradeJournalForm picker with orphan-safe rendering, TradeDetail
header chip, Playwright round-trip.

BACKLOG: retitles the 7c "tags + linking" deferral to a pure tags
entry for Session 7e (screenshots shift to 7f); promotes
per-strategy analytics from "blocked on linking" to "unblocked after
7d"; files six new 7d-specific deferrals.

CONVENTIONS §15: adds three sub-rules covering single-id link
semantics, pre-7d undefined-coercion contract, and orphan-id UX
(picker "— deleted strategy" option + chip hide on detail page).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Success criteria (copy from spec §9)

1. Opening a trade detail shows a "Strategy" select in the journal form.
2. Selecting a strategy persists (Dexie row has `strategyId`); reload preserves.
3. After selection, a header chip `"Strategy: <name> →"` appears on the same page and navigates to `/s/<id>`.
4. Selecting `"— no strategy"` removes the link and the chip.
5. When a `strategyId` is orphaned (no matching row), the picker shows `"— deleted strategy"` and the chip is hidden.
6. Pre-7d entries load without error and round-trip cleanly through export/import.
7. `pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build` all green; domain coverage ≥ 90%.
8. `pnpm test:e2e` — new spec passes; existing 9 specs still pass.
9. SESSION_LOG / BACKLOG / CONVENTIONS updated.
