# Phase 1 Session 7e — Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `tags: ReadonlyArray<string>` to all three journal variants. Build a reusable `TagInput` chip-input primitive and a `TagChipList` read-only display primitive. Wire into the three forms (with pooled cross-variant autocomplete) and onto three read surfaces (trade-history rows, `/strategies` list, `JournalPanel` session rows).

**Architecture:** Additive field on every journal variant. Strict normalize on save (lowercase + trim + collapse whitespace, 40-char cap). Denormalized storage, no registry table. No Dexie schema bump; Zod `.default([])` for backwards-compat. New `useAllTags` hook pooled across all three variants drives autocomplete; `useJournalTagsByTradeId` threads trade-tags across the wallets→journal feature boundary.

**Tech Stack:** No new dependencies. React, TanStack Query, Dexie, Zod, Playwright.

---

## File structure (at end of session)

```
HyperJournal/
├── src/
│   ├── entities/
│   │   └── journal-entry.ts                              MODIFY (+tags on all three variants)
│   ├── domain/
│   │   └── tags/
│   │       ├── normalizeTag.ts                           NEW
│   │       └── normalizeTag.test.ts                      NEW
│   ├── lib/
│   │   ├── ui/
│   │   │   └── components/
│   │   │       ├── tag-input.tsx                         NEW
│   │   │       └── tag-input.test.tsx                    NEW
│   │   └── validation/
│   │       ├── export.ts                                 MODIFY (+tags on three schema branches)
│   │       └── export.test.ts                            MODIFY (+3 cases)
│   ├── features/
│   │   ├── journal/
│   │   │   ├── hooks/
│   │   │   │   ├── useAllTags.ts                         NEW
│   │   │   │   ├── useAllTags.test.tsx                   NEW
│   │   │   │   ├── useJournalTagsByTradeId.ts            NEW
│   │   │   │   ├── useJournalTagsByTradeId.test.tsx      NEW
│   │   │   │   ├── useTradeJournalEntry.ts               MODIFY (+invalidate all-tags + tags-by-trade-id)
│   │   │   │   ├── useSessionJournalEntry.ts             MODIFY (+invalidate all-tags)
│   │   │   │   └── useStrategyEntry.ts                   MODIFY (+invalidate all-tags)
│   │   │   ├── components/
│   │   │   │   ├── TagChipList.tsx                       NEW
│   │   │   │   ├── TagChipList.test.tsx                  NEW
│   │   │   │   ├── TradeJournalForm.tsx                  MODIFY (+Tags field)
│   │   │   │   ├── TradeJournalForm.test.tsx             MODIFY (+2)
│   │   │   │   ├── SessionJournalForm.tsx                MODIFY (+Tags field)
│   │   │   │   ├── SessionJournalForm.test.tsx           MODIFY (+2)
│   │   │   │   ├── StrategyJournalForm.tsx               MODIFY (+Tags field)
│   │   │   │   ├── StrategyJournalForm.test.tsx          MODIFY (+2)
│   │   │   │   ├── JournalPanel.tsx                      MODIFY (+TagChipList on rows)
│   │   │   │   └── JournalPanel.test.tsx                 MODIFY (+1)
│   │   │   └── index.ts                                  MODIFY (+exports)
│   │   └── wallets/
│   │       └── components/
│   │           ├── TradeHistoryList.tsx                  MODIFY (+tradeTagsByTradeId prop + Tags column)
│   │           └── TradeHistoryList.test.tsx             MODIFY (+1)
│   └── app/
│       ├── WalletView.tsx                                MODIFY (+useJournalTagsByTradeId thread-through)
│       ├── Strategies.tsx                                MODIFY (+TagChipList on rows)
│       └── Strategies.test.tsx                           MODIFY (+1)
├── e2e/
│   └── tags-roundtrip.spec.ts                            NEW (+2 E2E)
└── docs/
    ├── SESSION_LOG.md                                    MODIFY
    ├── BACKLOG.md                                        MODIFY
    └── CONVENTIONS.md                                    MODIFY
```

---

## Conventions (for every task)

- Commands from `/Users/angel/Documents/HyperJournal`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- TDD for every code task; RED → GREEN → commit.
- Gauntlet after every task: `pnpm typecheck && pnpm lint && pnpm test`. Final full gauntlet + E2E at Task 8.
- **7d lesson**: adding a required field to `TradeJournalEntry` / `SessionJournalEntry` / `StrategyJournalEntry` surfaces cascading typecheck errors in peripheral test files that construct literals. The full list was discovered late in 7d; for 7e, Task 1 pre-runs `grep -l "scope: 'trade'" src/` (and similar for session/strategy) and backfills everywhere in one commit.

---

## Task 1: Entity + normalize helper + Zod + peripheral literal backfill

Bundle the additive entity change, the Zod schema update (TDD), and the normalize helper (TDD), plus the full fan-out of `tags: []` added to every literal construction across the codebase. Single commit ends with a green gauntlet.

**Files:**
- Modify: `src/entities/journal-entry.ts`
- Create: `src/domain/tags/normalizeTag.ts`
- Create: `src/domain/tags/normalizeTag.test.ts`
- Modify: `src/lib/validation/export.ts`
- Modify: `src/lib/validation/export.test.ts`
- Modify: (every test file constructing a trade/session/strategy literal — discovered via grep in Step 1.7)

- [ ] **Step 1.1: Write the normalize helper test (RED)**

Create `src/domain/tags/normalizeTag.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeTag, normalizeTagList } from './normalizeTag';

describe('normalizeTag', () => {
  it('lowercases and trims', () => {
    expect(normalizeTag('  Breakout ')).toBe('breakout');
  });

  it('collapses internal whitespace runs to a single space', () => {
    expect(normalizeTag('revenge  trade')).toBe('revenge trade');
    expect(normalizeTag('gap\tfill')).toBe('gap fill');
    expect(normalizeTag('multi   \n  word')).toBe('multi word');
  });

  it('returns empty string for all-whitespace input', () => {
    expect(normalizeTag('   ')).toBe('');
  });
});

describe('normalizeTagList', () => {
  it('normalizes, dedupes, and preserves first-seen order', () => {
    expect(
      normalizeTagList(['Breakout', ' breakout ', 'Revenge Trade', 'BREAKOUT']),
    ).toEqual(['breakout', 'revenge trade']);
  });

  it('drops entries that normalize to empty', () => {
    expect(normalizeTagList(['  ', 'foo', ''])).toEqual(['foo']);
  });

  it('truncates to maxLen (default 40) post-normalize', () => {
    const long = 'x'.repeat(50);
    const out = normalizeTagList([long]);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(40);
  });

  it('honours a custom maxLen', () => {
    expect(normalizeTagList(['abcdef'], 3)).toEqual(['abc']);
  });
});
```

- [ ] **Step 1.2: Run — confirm RED**

```bash
pnpm test src/domain/tags/normalizeTag.test.ts 2>&1 | tail -10
```

Expected: "Cannot find module './normalizeTag'".

- [ ] **Step 1.3: Implement the helper (GREEN)**

Create `src/domain/tags/normalizeTag.ts`:

```ts
/**
 * Normalize a single tag string for storage: trim, lowercase, collapse
 * any run of whitespace (spaces, tabs, newlines) into a single space.
 * Returns empty string if the input is all whitespace — callers filter
 * empties.
 */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Normalize, truncate, and deduplicate a list of tags. First-seen order
 * preserved (useful so the UI shows chips in the order the user added
 * them). Tags that normalize to empty are dropped.
 */
export function normalizeTagList(
  raws: ReadonlyArray<string>,
  maxLen = 40,
): ReadonlyArray<string> {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of raws) {
    const t = normalizeTag(raw).slice(0, maxLen);
    if (t === '' || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
```

- [ ] **Step 1.4: Run — confirm GREEN**

```bash
pnpm test src/domain/tags/normalizeTag.test.ts 2>&1 | tail -10
```

Expected: 7 tests pass.

- [ ] **Step 1.5: Write the Zod validation tests (RED)**

In `src/lib/validation/export.test.ts`, find the existing Session 7d strategyId tests. After the "defaults strategyId to null when the field is missing (pre-7d export)" case, before the "rejects a journalEntries row with an invalid scope" case, append three new tests:

```ts
  it('parses a trade entry with tags', () => {
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
            tags: ['breakout', 'fomc'],
            provenance: 'observed',
          },
        ],
      },
    });
    const first = out.data.journalEntries![0]!;
    if (first.scope !== 'trade') throw new Error('expected trade');
    expect(first.tags).toEqual(['breakout', 'fomc']);
  });

  it('parses a session entry with an empty tags array', () => {
    const out = ExportFileSchema.parse({
      ...validFile,
      data: {
        ...validFile.data,
        journalEntries: [
          {
            id: 's1',
            scope: 'session',
            date: '2026-04-24',
            createdAt: 1,
            updatedAt: 1,
            marketConditions: '',
            summary: '',
            whatToRepeat: '',
            whatToAvoid: '',
            mindset: null,
            disciplineScore: null,
            tags: [],
            provenance: 'observed',
          },
        ],
      },
    });
    const first = out.data.journalEntries![0]!;
    if (first.scope !== 'session') throw new Error('expected session');
    expect(first.tags).toEqual([]);
  });

  it('defaults tags to [] across all three variants when the field is missing (pre-7e export)', () => {
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
            // no tags
            provenance: 'observed',
          },
          {
            id: 's1',
            scope: 'session',
            date: '2026-04-24',
            createdAt: 1,
            updatedAt: 1,
            marketConditions: '',
            summary: '',
            whatToRepeat: '',
            whatToAvoid: '',
            mindset: null,
            disciplineScore: null,
            // no tags
            provenance: 'observed',
          },
          {
            id: 'st1',
            scope: 'strategy',
            createdAt: 1,
            updatedAt: 1,
            name: '',
            conditions: '',
            invalidation: '',
            idealRR: '',
            examples: '',
            recurringMistakes: '',
            notes: '',
            // no tags
            provenance: 'observed',
          },
        ],
      },
    });
    const entries = out.data.journalEntries!;
    expect(entries[0]!.tags).toEqual([]);
    expect(entries[1]!.tags).toEqual([]);
    expect(entries[2]!.tags).toEqual([]);
  });
```

- [ ] **Step 1.6: Add the entity field and update the Zod schema (GREEN)**

**Entity** — in `src/entities/journal-entry.ts`, add `readonly tags: ReadonlyArray<string>;` before `provenance` in all three variants.

Find `TradeJournalEntry`:

```ts
  readonly strategyId: string | null;

  readonly provenance: Provenance;
};
```

Replace with:

```ts
  readonly strategyId: string | null;

  /**
   * Free-form labels attached to this entry. Introduced in Session 7e.
   * Normalized (lowercase + trim + whitespace-collapsed) on save; see
   * `@domain/tags/normalizeTag`. Pre-7e rows may carry `undefined`;
   * consumers treat `undefined` as `[]`.
   */
  readonly tags: ReadonlyArray<string>;

  readonly provenance: Provenance;
};
```

Find `SessionJournalEntry`:

```ts
  readonly mindset: Mindset | null;
  readonly disciplineScore: number | null; // 1-5

  readonly provenance: Provenance;
};
```

Replace with:

```ts
  readonly mindset: Mindset | null;
  readonly disciplineScore: number | null; // 1-5

  /**
   * Free-form labels attached to this entry. Same pool as trade/strategy
   * tags (see §3 of 7e design spec). See `@domain/tags/normalizeTag`.
   */
  readonly tags: ReadonlyArray<string>;

  readonly provenance: Provenance;
};
```

Find `StrategyJournalEntry`:

```ts
  readonly notes: string;

  readonly provenance: Provenance;
};
```

Replace with:

```ts
  readonly notes: string;

  /**
   * Free-form labels attached to this strategy. Same pool as trade and
   * session tags. See `@domain/tags/normalizeTag`.
   */
  readonly tags: ReadonlyArray<string>;

  readonly provenance: Provenance;
};
```

**Zod schema** — in `src/lib/validation/export.ts`:

Find `TradeJournalEntrySchema`:

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
  tags: z.array(z.string()).default([]),
  provenance: z.enum(['observed', 'derived', 'inferred', 'unknown']),
});
```

Find `SessionJournalEntrySchema`:

```ts
const SessionJournalEntrySchema = z.object({
  id: z.string().min(1),
  scope: z.literal('session'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  marketConditions: z.string(),
  summary: z.string(),
  whatToRepeat: z.string(),
  whatToAvoid: z.string(),
  mindset: MindsetSchema,
  disciplineScore: z.number().int().min(1).max(5).nullable(),
  provenance: z.enum(['observed', 'derived', 'inferred', 'unknown']),
});
```

Replace with:

```ts
const SessionJournalEntrySchema = z.object({
  id: z.string().min(1),
  scope: z.literal('session'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  marketConditions: z.string(),
  summary: z.string(),
  whatToRepeat: z.string(),
  whatToAvoid: z.string(),
  mindset: MindsetSchema,
  disciplineScore: z.number().int().min(1).max(5).nullable(),
  tags: z.array(z.string()).default([]),
  provenance: z.enum(['observed', 'derived', 'inferred', 'unknown']),
});
```

Find `StrategyJournalEntrySchema`:

```ts
const StrategyJournalEntrySchema = z.object({
  id: z.string().min(1),
  scope: z.literal('strategy'),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  name: z.string(),
  conditions: z.string(),
  invalidation: z.string(),
  idealRR: z.string(),
  examples: z.string(),
  recurringMistakes: z.string(),
  notes: z.string(),
  provenance: z.enum(['observed', 'derived', 'inferred', 'unknown']),
});
```

Replace with:

```ts
const StrategyJournalEntrySchema = z.object({
  id: z.string().min(1),
  scope: z.literal('strategy'),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  name: z.string(),
  conditions: z.string(),
  invalidation: z.string(),
  idealRR: z.string(),
  examples: z.string(),
  recurringMistakes: z.string(),
  notes: z.string(),
  tags: z.array(z.string()).default([]),
  provenance: z.enum(['observed', 'derived', 'inferred', 'unknown']),
});
```

- [ ] **Step 1.7: Backfill `tags: []` across all peripheral literal constructions**

Run `pnpm typecheck 2>&1 | grep "error TS"` to see which files need `tags: []` added. Expected list (verify with grep; fix every reported error):

- `src/domain/export/buildExport.test.ts` — trade-entry literal in the "includes journalEntries unconditionally" test.
- `src/domain/export/mergeImport.test.ts` — trade-entry literal in the "passes journalEntries through from the file" test.
- `src/lib/storage/export-repo.test.ts` — trade-entry literal in the "readSnapshot returns all journalEntries rows" test.
- `src/lib/storage/import-repo.test.ts` — trade-entry literal in the "applyMerge upserts journalEntries" test.
- `src/lib/storage/journal-entries-repo.test.ts` — trade/session/strategy factory functions.
- `src/features/journal/hooks/useTradeJournalEntry.test.tsx` — `makeEntry` factory.
- `src/features/journal/hooks/useSessionJournalEntry.test.tsx` — `makeEntry` factory.
- `src/features/journal/hooks/useStrategyEntry.test.tsx` — `makeEntry` factory.
- `src/features/journal/hooks/useJournalEntryIds.test.tsx` — trade-entry literal.
- `src/features/journal/hooks/useStrategies.test.tsx` — `makeStrategy` factory.
- `src/features/journal/hooks/useCreateStrategy.test.tsx` — (no literal constructions; skip if nothing reported).
- `src/features/journal/hooks/useRecentSessionEntries.test.tsx` — factory or literals.
- `src/features/journal/components/TradeJournalForm.test.tsx` — pre-populate literal + seedStrategy factory.
- `src/features/journal/components/SessionJournalForm.test.tsx` — factory or literals.
- `src/features/journal/components/StrategyJournalForm.test.tsx` — `seed` helper.
- `src/features/journal/components/JournalPanel.test.tsx` — any session-entry literals.
- `src/app/Strategies.test.tsx` — strategy-entry literal in the "lists existing strategies" test.
- `src/app/StrategyDetail.test.tsx` — `seed` helper.
- `src/app/TradeDetail.test.tsx` — `seedTradeJournal` + `seedStrategy` helpers.

For each file, find the `scope: 'trade' | 'session' | 'strategy'` literal and insert `tags: [],` before the closing `}` (typically before `provenance`). Exact insertion is mechanical; the typecheck error message in each case names the missing property.

- [ ] **Step 1.8: Run the gauntlet**

```bash
pnpm typecheck && pnpm lint && pnpm test 2>&1 | tail -10
```

Expected: typecheck clean; validation + normalize tests green; all previously-passing tests still green.

Exact final count: `329 + 3 validation + 7 normalize = 339`.

- [ ] **Step 1.9: Commit**

```bash
git add src/entities/journal-entry.ts \
        src/domain/tags/normalizeTag.ts \
        src/domain/tags/normalizeTag.test.ts \
        src/lib/validation/export.ts \
        src/lib/validation/export.test.ts \
        src/domain/export/buildExport.test.ts \
        src/domain/export/mergeImport.test.ts \
        src/lib/storage/export-repo.test.ts \
        src/lib/storage/import-repo.test.ts \
        src/lib/storage/journal-entries-repo.test.ts \
        src/features/journal/hooks/useTradeJournalEntry.test.tsx \
        src/features/journal/hooks/useSessionJournalEntry.test.tsx \
        src/features/journal/hooks/useStrategyEntry.test.tsx \
        src/features/journal/hooks/useJournalEntryIds.test.tsx \
        src/features/journal/hooks/useStrategies.test.tsx \
        src/features/journal/hooks/useRecentSessionEntries.test.tsx \
        src/features/journal/components/TradeJournalForm.test.tsx \
        src/features/journal/components/SessionJournalForm.test.tsx \
        src/features/journal/components/StrategyJournalForm.test.tsx \
        src/features/journal/components/JournalPanel.test.tsx \
        src/app/Strategies.test.tsx \
        src/app/StrategyDetail.test.tsx \
        src/app/TradeDetail.test.tsx
git commit -m "$(cat <<'EOF'
feat(journal): add tags to all three variants + normalize helper + schema

All three journal variants (trade, session, strategy) gain
`tags: ReadonlyArray<string>`. Stored normalized (lowercase, trimmed,
whitespace-collapsed, deduped, 40-char cap).

normalizeTag + normalizeTagList pure helpers in @domain/tags. Defence
in depth: TagInput normalizes on per-add commit (Task 2); forms
re-normalize the whole list on save (Task 4); import-time normalization
deferred so old/hand-edited files parse lossy-forward.

Zod schema adds tags: z.array(z.string()).default([]) to all three
variant branches — pre-7e export files lacking the field coerce to [].
formatVersion unchanged; additive per CONVENTIONS §13. No Dexie schema
bump; pre-7e rows load with `undefined` and self-heal on next upsert
via `entry.tags ?? []` read coercion in consumers (wired in Task 4+5+6).

Backfills `tags: []` across all peripheral test literals that
construct journal-entry objects; learned from 7d that this is required
for typecheck to green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `TagInput` primitive

A controlled, accessible chip input with keyboard-driven autocomplete.

**Files:**
- Create: `src/lib/ui/components/tag-input.tsx`
- Create: `src/lib/ui/components/tag-input.test.tsx`

- [ ] **Step 2.1: Write failing tests (RED)**

Create `src/lib/ui/components/tag-input.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { TagInput } from './tag-input';

afterEach(() => cleanup());

function Harness({
  initial = [],
  suggestions = [],
  onChange,
  onBlur,
}: {
  initial?: ReadonlyArray<string>;
  suggestions?: ReadonlyArray<string>;
  onChange?: (tags: ReadonlyArray<string>) => void;
  onBlur?: () => void;
}) {
  const [value, setValue] = useState<ReadonlyArray<string>>(initial);
  return (
    <TagInput
      id="t"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      onBlur={onBlur}
      suggestions={suggestions}
      placeholder="Add tags"
    />
  );
}

describe('TagInput', () => {
  it('renders each existing chip with its label', () => {
    render(<Harness initial={['breakout', 'fomc']} />);
    expect(screen.getByText('breakout')).toBeInTheDocument();
    expect(screen.getByText('fomc')).toBeInTheDocument();
  });

  it('Enter commits the typed text as a new normalized chip', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: '  Breakout  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['breakout']);
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('comma commits the typed text as a new chip', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'revenge trade' } });
    fireEvent.keyDown(input, { key: ',' });
    expect(onChange).toHaveBeenCalledWith(['revenge trade']);
  });

  it('Backspace in empty input removes the last chip', () => {
    const onChange = vi.fn();
    render(<Harness initial={['a', 'b']} onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('suggestion dropdown filters by startsWith on the normalized input', () => {
    render(<Harness suggestions={['breakout', 'fade', 'fomc']} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'f' } });
    expect(screen.getByRole('option', { name: 'fade' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'fomc' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'breakout' })).toBeNull();
  });

  it('ArrowDown + Enter picks the highlighted suggestion', () => {
    const onChange = vi.fn();
    render(<Harness suggestions={['breakout', 'fomc']} onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'f' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['fomc']);
  });

  it('blur commits any pending text and fires onBlur', () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();
    render(<Harness onChange={onChange} onBlur={onBlur} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'late' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(['late']);
    expect(onBlur).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2.2: Run — confirm RED**

```bash
pnpm test src/lib/ui/components/tag-input.test.tsx 2>&1 | tail -10
```

Expected: "Cannot find module './tag-input'".

- [ ] **Step 2.3: Implement `src/lib/ui/components/tag-input.tsx`**

```tsx
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { normalizeTag } from '@domain/tags/normalizeTag';
import { cn } from '@lib/ui/utils';

type Props = {
  id: string;
  value: ReadonlyArray<string>;
  onChange: (tags: ReadonlyArray<string>) => void;
  onBlur?: () => void;
  suggestions: ReadonlyArray<string>;
  placeholder?: string;
  maxLength?: number;
};

const MAX_SUGGESTIONS = 8;

export function TagInput({
  id,
  value,
  onChange,
  onBlur,
  suggestions,
  placeholder,
  maxLength = 40,
}: Props) {
  const [inputText, setInputText] = useState('');
  const [highlighted, setHighlighted] = useState(-1);
  const listboxId = `${id}-listbox`;
  const inputRef = useRef<HTMLInputElement | null>(null);

  const visible = useMemo(() => {
    const q = normalizeTag(inputText);
    if (q === '') return [] as ReadonlyArray<string>;
    return suggestions
      .filter((s) => s.startsWith(q) && !value.includes(s))
      .slice(0, MAX_SUGGESTIONS);
  }, [inputText, suggestions, value]);

  const open = visible.length > 0;

  function commit(rawText: string) {
    const normalized = normalizeTag(rawText).slice(0, maxLength);
    if (normalized !== '' && !value.includes(normalized)) {
      onChange([...value, normalized]);
    }
    setInputText('');
    setHighlighted(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0 && highlighted < visible.length) {
        commit(visible[highlighted]!);
      } else {
        commit(inputText);
      }
      return;
    }
    if (e.key === ',') {
      e.preventDefault();
      commit(inputText);
      return;
    }
    if (e.key === 'Backspace' && inputText === '' && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (visible.length === 0) return;
      setHighlighted((h) => Math.min(visible.length - 1, h + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(-1, h - 1));
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setInputText('');
      setHighlighted(-1);
      return;
    }
  }

  function handleBlur() {
    commit(inputText);
    onBlur?.();
  }

  function removeAt(idx: number) {
    const next = [...value];
    next.splice(idx, 1);
    onChange(next);
    inputRef.current?.focus();
  }

  return (
    <div className="relative">
      <div
        className={cn(
          'flex min-h-[2.5rem] flex-wrap items-center gap-1 rounded-md border border-border bg-bg-overlay px-2 py-1',
          'ring-offset-bg-base focus-within:outline-none focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2',
        )}
        onMouseDown={(e) => {
          // Clicking empty area inside the box focuses the input.
          if (e.target === e.currentTarget) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        {value.map((tag, idx) => (
          <span
            key={`${tag}-${idx}`}
            className="flex items-center gap-1 rounded-full border border-border bg-bg-raised px-2 py-0.5 text-xs text-fg-base"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove tag: ${tag}`}
              onClick={() => removeAt(idx)}
              className="rounded text-fg-muted hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            highlighted >= 0 ? `${listboxId}-opt-${highlighted}` : undefined
          }
          type="text"
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            setHighlighted(-1);
          }}
          onKeyDown={onKeyDown}
          onBlur={handleBlur}
          placeholder={value.length === 0 ? placeholder : undefined}
          maxLength={maxLength}
          className="flex-1 min-w-[8rem] bg-transparent text-sm text-fg-base outline-none placeholder:text-fg-subtle"
        />
      </div>
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-bg-raised shadow-sm"
        >
          {visible.map((s, idx) => (
            <li
              key={s}
              id={`${listboxId}-opt-${idx}`}
              role="option"
              aria-selected={idx === highlighted}
              onMouseDown={(e) => {
                // mousedown before the input blurs so we can commit.
                e.preventDefault();
                commit(s);
                inputRef.current?.focus();
              }}
              className={cn(
                'cursor-pointer px-3 py-1 text-sm text-fg-base',
                idx === highlighted ? 'bg-bg-overlay' : 'hover:bg-bg-overlay/60',
              )}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2.4: Run — confirm GREEN + gauntlet**

```bash
pnpm test src/lib/ui/components/tag-input.test.tsx && pnpm typecheck && pnpm lint 2>&1 | tail -3
```

Expected: 7 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/ui/components/tag-input.tsx src/lib/ui/components/tag-input.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add TagInput primitive

Controlled chip input with keyboard-driven autocomplete. Enter or
comma commits typed text as a normalized chip; Backspace in empty
input removes the last; X button on each chip removes individually.
Suggestion dropdown filters by startsWith on the normalized input (up
to 8 shown, already-present tags filtered out). Arrow keys navigate;
Enter with a highlighted suggestion picks it, Enter with nothing
highlighted commits the typed text. Escape clears input and closes
dropdown.

Blur commits any pending text (same pipeline as Enter with nothing
highlighted) then calls onBlur — parent handlers read the final value
array via draftRef synchronously updated by the preceding onChange.

role=combobox + aria-expanded + aria-controls + aria-activedescendant
on the input; each chip X is a real <button> with aria-label.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `useAllTags` hook + invalidation wiring

**Files:**
- Create: `src/features/journal/hooks/useAllTags.ts`
- Create: `src/features/journal/hooks/useAllTags.test.tsx`
- Modify: `src/features/journal/hooks/useTradeJournalEntry.ts`
- Modify: `src/features/journal/hooks/useSessionJournalEntry.ts`
- Modify: `src/features/journal/hooks/useStrategyEntry.ts`
- Modify: `src/features/journal/index.ts`

- [ ] **Step 3.1: Write failing tests (RED)**

Create `src/features/journal/hooks/useAllTags.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useAllTags } from './useAllTags';
import { HyperJournalDb } from '@lib/storage/db';
import type {
  SessionJournalEntry,
  StrategyJournalEntry,
  TradeJournalEntry,
} from '@entities/journal-entry';

let db: HyperJournalDb;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  db = new HyperJournalDb(`hj-all-tags-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

describe('useAllTags', () => {
  it('returns an empty array when there are no entries', async () => {
    const { result } = renderHook(() => useAllTags({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tags).toEqual([]);
  });

  it('pools tags from all three variants, dedupes, sorts alphabetically', async () => {
    const trade: TradeJournalEntry = {
      id: 't1',
      scope: 'trade',
      tradeId: 'BTC-1',
      createdAt: 0,
      updatedAt: 0,
      preTradeThesis: '',
      postTradeReview: '',
      lessonLearned: '',
      mood: null,
      planFollowed: null,
      stopLossUsed: null,
      strategyId: null,
      tags: ['breakout', 'fomc'],
      provenance: 'observed',
    };
    const session: SessionJournalEntry = {
      id: 's1',
      scope: 'session',
      date: '2026-04-24',
      createdAt: 0,
      updatedAt: 0,
      marketConditions: '',
      summary: '',
      whatToRepeat: '',
      whatToAvoid: '',
      mindset: null,
      disciplineScore: null,
      tags: ['fomc', 'macro'],
      provenance: 'observed',
    };
    const strat: StrategyJournalEntry = {
      id: 'st1',
      scope: 'strategy',
      createdAt: 0,
      updatedAt: 0,
      name: 'Breakout',
      conditions: '',
      invalidation: '',
      idealRR: '',
      examples: '',
      recurringMistakes: '',
      notes: '',
      tags: ['breakout', 'momentum'],
      provenance: 'observed',
    };
    await db.journalEntries.put(trade);
    await db.journalEntries.put(session);
    await db.journalEntries.put(strat);

    const { result } = renderHook(() => useAllTags({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tags).toEqual(['breakout', 'fomc', 'macro', 'momentum']);
  });
});
```

- [ ] **Step 3.2: Run — confirm RED**

```bash
pnpm test src/features/journal/hooks/useAllTags.test.tsx 2>&1 | tail -10
```

Expected: "Cannot find module './useAllTags'".

- [ ] **Step 3.3: Implement `src/features/journal/hooks/useAllTags.ts`**

```ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';

type Options = { db?: HyperJournalDb };

export type UseAllTagsResult = {
  tags: ReadonlyArray<string>;
  isLoading: boolean;
};

const EMPTY_LIST: ReadonlyArray<string> = Object.freeze([]);

/**
 * Returns every distinct tag used across all journal variants, sorted
 * alphabetically. Powers autocomplete in the three form-level
 * TagInputs. Read-all-and-dedupe is cheap at Phase 1 volumes (dozens
 * of entries); revisit with an index-backed aggregate once entries
 * reach the thousands.
 */
export function useAllTags(options: Options = {}): UseAllTagsResult {
  const db = options.db ?? defaultDb;

  const query = useQuery<ReadonlyArray<string>>({
    queryKey: ['journal', 'all-tags'],
    queryFn: async () => {
      const rows = await db.journalEntries.toArray();
      const seen = new Set<string>();
      for (const row of rows) {
        const tags = (row as { tags?: ReadonlyArray<string> }).tags ?? [];
        for (const t of tags) seen.add(t);
      }
      return Array.from(seen).sort();
    },
  });

  return {
    tags: query.data ?? EMPTY_LIST,
    isLoading: query.isLoading,
  };
}
```

- [ ] **Step 3.4: Wire invalidation on all three save hooks**

In `src/features/journal/hooks/useTradeJournalEntry.ts`, find the `saveMutation.onSuccess` block (it invalidates `['journal', 'trade', tradeId]` and `['journal', 'trade-ids']`). Append:

```ts
      await queryClient.invalidateQueries({ queryKey: ['journal', 'all-tags'] });
      await queryClient.invalidateQueries({ queryKey: ['journal', 'trade-tags-by-id'] });
```

Do the same in `removeMutation.onSuccess` (same two lines).

In `src/features/journal/hooks/useSessionJournalEntry.ts`, in both `onSuccess` blocks, append:

```ts
      await queryClient.invalidateQueries({ queryKey: ['journal', 'all-tags'] });
```

In `src/features/journal/hooks/useStrategyEntry.ts`, in both `onSuccess` blocks, append:

```ts
      await queryClient.invalidateQueries({ queryKey: ['journal', 'all-tags'] });
```

- [ ] **Step 3.5: Export from feature barrel**

In `src/features/journal/index.ts`, add:

```ts
export { useAllTags } from './hooks/useAllTags';
```

- [ ] **Step 3.6: Run — GREEN + gauntlet**

```bash
pnpm test src/features/journal/hooks/useAllTags.test.tsx && pnpm typecheck && pnpm lint 2>&1 | tail -3
```

Expected: 2 tests pass.

- [ ] **Step 3.7: Commit**

```bash
git add src/features/journal/hooks/useAllTags.ts \
        src/features/journal/hooks/useAllTags.test.tsx \
        src/features/journal/hooks/useTradeJournalEntry.ts \
        src/features/journal/hooks/useSessionJournalEntry.ts \
        src/features/journal/hooks/useStrategyEntry.ts \
        src/features/journal/index.ts
git commit -m "$(cat <<'EOF'
feat(journal): add useAllTags + wire invalidation on save

useAllTags reads every journal row and returns the deduped,
alphabetically sorted set of tags across all three variants — powers
the autocomplete for form-level TagInputs (Tasks 4 + 5).

All three save hooks (useTradeJournalEntry, useSessionJournalEntry,
useStrategyEntry) now invalidate ['journal', 'all-tags'] on save +
remove so autocomplete stays fresh. useTradeJournalEntry also
invalidates ['journal', 'trade-tags-by-id'] in preparation for the
trade-history chip rendering (Task 7).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire `TagInput` into `TradeJournalForm`

**Files:**
- Modify: `src/features/journal/components/TradeJournalForm.tsx`
- Modify: `src/features/journal/components/TradeJournalForm.test.tsx`

- [ ] **Step 4.1: Write failing tests (RED)**

In `src/features/journal/components/TradeJournalForm.test.tsx`, at the end of the `describe('TradeJournalForm', ...)` block (before the closing `});`), append:

```ts
  it('renders the Tags field with label', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/^tags$/i)).toBeInTheDocument());
  });

  it('typing a tag + Enter + blur persists the tag on the Dexie row', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/^tags$/i)).toBeInTheDocument());
    const input = screen.getByLabelText(/^tags$/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'breakout' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    await waitFor(async () => {
      const rows = await db.journalEntries.toArray();
      const trade = rows.find((r) => r.scope === 'trade');
      if (!trade || trade.scope !== 'trade') throw new Error('expected trade');
      expect(trade.tags).toEqual(['breakout']);
    });
  });
```

- [ ] **Step 4.2: Run — confirm RED**

```bash
pnpm test src/features/journal/components/TradeJournalForm.test.tsx 2>&1 | tail -10
```

Expected: 2 new failures — no label matching /tags/.

- [ ] **Step 4.3: Update `TradeJournalForm.tsx`**

Open `src/features/journal/components/TradeJournalForm.tsx`. Apply the following edits.

**Edit A — imports.** Find:

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

Replace with:

```ts
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTradeJournalEntry } from '../hooks/useTradeJournalEntry';
import { useStrategies } from '../hooks/useStrategies';
import { useAllTags } from '../hooks/useAllTags';
import { TriStateRadio } from './TriStateRadio';
import { Label } from '@lib/ui/components/label';
import { TagInput } from '@lib/ui/components/tag-input';
import { normalizeTagList } from '@domain/tags/normalizeTag';
import { cn } from '@lib/ui/utils';
import type { Mood, TradeJournalEntry } from '@entities/journal-entry';
import type { HyperJournalDb } from '@lib/storage/db';
```

**Edit B — `DraftState`.** Find:

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

Replace with:

```ts
type DraftState = {
  preTradeThesis: string;
  postTradeReview: string;
  lessonLearned: string;
  mood: Mood | null;
  planFollowed: boolean | null;
  stopLossUsed: boolean | null;
  strategyId: string | null;
  tags: ReadonlyArray<string>;
};
```

**Edit C — `EMPTY_DRAFT`.** Find:

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

Replace with:

```ts
const EMPTY_DRAFT: DraftState = {
  preTradeThesis: '',
  postTradeReview: '',
  lessonLearned: '',
  mood: null,
  planFollowed: null,
  stopLossUsed: null,
  strategyId: null,
  tags: [],
};
```

**Edit D — `isDraftEmpty`.** Find:

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

Replace with:

```ts
function isDraftEmpty(draft: DraftState): boolean {
  return (
    draft.preTradeThesis.trim() === '' &&
    draft.postTradeReview.trim() === '' &&
    draft.lessonLearned.trim() === '' &&
    draft.mood === null &&
    draft.planFollowed === null &&
    draft.stopLossUsed === null &&
    draft.strategyId === null &&
    draft.tags.length === 0
  );
}
```

**Edit E — `entryToDraft`.** Find:

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
    // Pre-7d rows may carry undefined here; treat as null.
    strategyId: entry.strategyId ?? null,
  };
}
```

Replace with:

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
    // Pre-7d rows may carry undefined here; treat as null.
    strategyId: entry.strategyId ?? null,
    // Pre-7e rows may carry undefined; treat as [].
    tags: entry.tags ?? [],
  };
}
```

**Edit F — commit entry literal.** Find:

```ts
      mood: next.mood,
      planFollowed: next.planFollowed,
      stopLossUsed: next.stopLossUsed,
      strategyId: next.strategyId,
      provenance: 'observed',
    };
```

Replace with:

```ts
      mood: next.mood,
      planFollowed: next.planFollowed,
      stopLossUsed: next.stopLossUsed,
      strategyId: next.strategyId,
      tags: normalizeTagList(next.tags),
      provenance: 'observed',
    };
```

**Edit G — hook + suggestions source.** Find:

```ts
export function TradeJournalForm({ tradeId, db }: Props) {
  const hook = useTradeJournalEntry(tradeId, db ? { db } : {});
  const strategies = useStrategies(db ? { db } : {});
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
```

Replace with:

```ts
export function TradeJournalForm({ tradeId, db }: Props) {
  const hook = useTradeJournalEntry(tradeId, db ? { db } : {});
  const strategies = useStrategies(db ? { db } : {});
  const allTags = useAllTags(db ? { db } : {});
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
```

And still inside the component function, before the `return`, add:

```ts
  const suggestions = useMemo(
    () => allTags.tags.filter((t) => !draft.tags.includes(t)),
    [allTags.tags, draft.tags],
  );
```

**Edit H — JSX.** Find the strategy picker block (it ends with `</div>` immediately before the first `<TriStateRadio`). Insert the Tags block AFTER the strategy-picker `</div>` and BEFORE the first `<TriStateRadio`:

```tsx
      <div className="flex flex-col gap-2">
        <Label htmlFor="tags">Tags</Label>
        <TagInput
          id="tags"
          value={draft.tags}
          onChange={(v) => change('tags', v)}
          onBlur={onBlurCommit}
          suggestions={suggestions}
          placeholder="Add tags, press Enter"
        />
      </div>

```

- [ ] **Step 4.4: Run — GREEN + gauntlet**

```bash
pnpm test src/features/journal/components/TradeJournalForm.test.tsx && pnpm typecheck && pnpm lint 2>&1 | tail -3
```

Expected: 13 tests pass (11 pre-existing + 2 new).

- [ ] **Step 4.5: Commit**

```bash
git add src/features/journal/components/TradeJournalForm.tsx \
        src/features/journal/components/TradeJournalForm.test.tsx
git commit -m "$(cat <<'EOF'
feat(journal): wire TagInput into TradeJournalForm

Tags field appears below the strategy picker, above the tri-state
radios. Autocomplete suggestions come from useAllTags (pooled across
all three journal variants), filtered to exclude tags already on the
current draft. commit() re-normalizes via normalizeTagList as
defence-in-depth; TagInput already normalizes per-add.

isDraftEmpty gains `tags.length === 0` — typing a tag counts as
content (empty-form blur with only a tag DOES create a row, matching
how mood + strategy behave).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire `TagInput` into `SessionJournalForm` + `StrategyJournalForm`

Bundle — near-identical patterns.

**Files:**
- Modify: `src/features/journal/components/SessionJournalForm.tsx`
- Modify: `src/features/journal/components/SessionJournalForm.test.tsx`
- Modify: `src/features/journal/components/StrategyJournalForm.tsx`
- Modify: `src/features/journal/components/StrategyJournalForm.test.tsx`

- [ ] **Step 5.1: SessionJournalForm — write failing tests**

In `src/features/journal/components/SessionJournalForm.test.tsx`, append to the `describe` block (before closing `});`):

```ts
  it('renders the Tags field with label', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/^tags$/i)).toBeInTheDocument());
  });

  it('typing a tag + Enter + blur persists the tag on the Dexie row', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/^tags$/i)).toBeInTheDocument());
    const input = screen.getByLabelText(/^tags$/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'fomc' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    await waitFor(async () => {
      const rows = await db.journalEntries.toArray();
      const session = rows.find((r) => r.scope === 'session');
      if (!session || session.scope !== 'session') throw new Error('expected session');
      expect(session.tags).toEqual(['fomc']);
    });
  });
```

- [ ] **Step 5.2: SessionJournalForm — confirm RED**

```bash
pnpm test src/features/journal/components/SessionJournalForm.test.tsx 2>&1 | tail -10
```

Expected: 2 new failures.

- [ ] **Step 5.3: SessionJournalForm — implement**

Apply the SAME kind of edits as Task 4 (A through H) to `src/features/journal/components/SessionJournalForm.tsx`:

- **Edit A:** add `useMemo`, `useAllTags`, `TagInput`, `normalizeTagList` imports (mirror Task 4's Edit A).
- **Edit B–D:** add `tags: ReadonlyArray<string>` to `DraftState`, `tags: []` to `EMPTY_DRAFT`, and `draft.tags.length === 0` to the AND chain in `isDraftEmpty`.
- **Edit E:** in `entryToDraft`, add `tags: entry.tags ?? [],` as a new field.
- **Edit F:** in the `commit` function's entry literal, add `tags: normalizeTagList(next.tags),` before `provenance`.
- **Edit G:** add `const allTags = useAllTags(db ? { db } : {});` near the top of the component, and `const suggestions = useMemo(() => allTags.tags.filter((t) => !draft.tags.includes(t)), [allTags.tags, draft.tags]);` before `return`.
- **Edit H:** in the JSX, insert the Tags block AFTER the `whatToAvoid` textarea block's closing `</div>` and BEFORE the `mindset` select block. The JSX is identical to Task 4's Edit H:

```tsx
      <div className="flex flex-col gap-2">
        <Label htmlFor="tags">Tags</Label>
        <TagInput
          id="tags"
          value={draft.tags}
          onChange={(v) => change('tags', v)}
          onBlur={onBlurCommit}
          suggestions={suggestions}
          placeholder="Add tags, press Enter"
        />
      </div>

```

- [ ] **Step 5.4: SessionJournalForm — GREEN**

```bash
pnpm test src/features/journal/components/SessionJournalForm.test.tsx 2>&1 | tail -10
```

Expected: all green.

- [ ] **Step 5.5: StrategyJournalForm — write failing tests**

In `src/features/journal/components/StrategyJournalForm.test.tsx`, append to the describe block:

```ts
  it('renders the Tags field with label', async () => {
    await seed({ id: 's1' });
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/^tags$/i)).toBeInTheDocument());
  });

  it('typing a tag + Enter + blur persists the tag on the Dexie row', async () => {
    await seed({ id: 's1', name: 'Breakout' });
    renderForm();
    // Wait for hydration — seeded data loaded into draft so our typed tag
    // doesn't get clobbered by the hydration effect.
    await waitFor(() =>
      expect(screen.getByLabelText(/^name$/i)).toHaveValue('Breakout'),
    );
    const input = screen.getByLabelText(/^tags$/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'momentum' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    await waitFor(async () => {
      const row = await db.journalEntries.get('s1');
      if (!row || row.scope !== 'strategy') throw new Error('expected strategy');
      expect(row.tags).toEqual(['momentum']);
    });
  });
```

- [ ] **Step 5.6: StrategyJournalForm — confirm RED**

```bash
pnpm test src/features/journal/components/StrategyJournalForm.test.tsx 2>&1 | tail -10
```

Expected: 2 new failures.

- [ ] **Step 5.7: StrategyJournalForm — implement**

Apply Task-4-style edits to `src/features/journal/components/StrategyJournalForm.tsx`. Same A–H pattern. **Edit H placement:** insert the Tags block at the very end of the form's content — AFTER the `notes` textarea's closing `</div>` and BEFORE the section's closing `</section>`. Use the identical `<div className="flex flex-col gap-2"><Label htmlFor="tags">Tags</Label><TagInput .../></div>` block.

- [ ] **Step 5.8: StrategyJournalForm — GREEN + full gauntlet**

```bash
pnpm test src/features/journal/components/ && pnpm typecheck && pnpm lint 2>&1 | tail -3
```

Expected: all green.

- [ ] **Step 5.9: Commit**

```bash
git add src/features/journal/components/SessionJournalForm.tsx \
        src/features/journal/components/SessionJournalForm.test.tsx \
        src/features/journal/components/StrategyJournalForm.tsx \
        src/features/journal/components/StrategyJournalForm.test.tsx
git commit -m "$(cat <<'EOF'
feat(journal): wire TagInput into Session + Strategy forms

Session form: Tags field appears below whatToAvoid, above the mindset
select. Strategy form: Tags is the last field, below notes (catch-all
for an open-ended doc).

Both follow the same pattern as TradeJournalForm: useAllTags supplies
cross-variant autocomplete, suggestions filter out already-present
tags, commit re-normalizes via normalizeTagList, isDraftEmpty gains
the `tags.length === 0` check.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `TagChipList` + `useJournalTagsByTradeId`

Read-only display primitive + the hook that threads trade-tags across the feature boundary.

**Files:**
- Create: `src/features/journal/components/TagChipList.tsx`
- Create: `src/features/journal/components/TagChipList.test.tsx`
- Create: `src/features/journal/hooks/useJournalTagsByTradeId.ts`
- Create: `src/features/journal/hooks/useJournalTagsByTradeId.test.tsx`
- Modify: `src/features/journal/index.ts`

- [ ] **Step 6.1: TagChipList — write failing tests (RED)**

Create `src/features/journal/components/TagChipList.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TagChipList } from './TagChipList';

afterEach(() => cleanup());

describe('TagChipList', () => {
  it('renders null when the tags array is empty', () => {
    const { container } = render(<TagChipList tags={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders each tag as a chip', () => {
    render(<TagChipList tags={['breakout', 'fomc']} />);
    expect(screen.getByText('breakout')).toBeInTheDocument();
    expect(screen.getByText('fomc')).toBeInTheDocument();
  });

  it('shows +N more when there are more tags than max', () => {
    render(<TagChipList tags={['a', 'b', 'c', 'd', 'e']} max={3} />);
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('c')).toBeInTheDocument();
    expect(screen.queryByText('d')).toBeNull();
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6.2: TagChipList — confirm RED**

```bash
pnpm test src/features/journal/components/TagChipList.test.tsx 2>&1 | tail -10
```

Expected: "Cannot find module './TagChipList'".

- [ ] **Step 6.3: TagChipList — implement**

Create `src/features/journal/components/TagChipList.tsx`:

```tsx
type Props = {
  tags: ReadonlyArray<string>;
  max?: number;
};

const DEFAULT_MAX = 3;

export function TagChipList({ tags, max = DEFAULT_MAX }: Props) {
  if (tags.length === 0) return null;
  const visible = tags.slice(0, max);
  const hidden = tags.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((t) => (
        <span
          key={t}
          className="rounded-full border border-border bg-bg-overlay px-2 py-0.5 text-xs text-fg-muted"
        >
          {t}
        </span>
      ))}
      {hidden > 0 && (
        <span className="rounded-full border border-border bg-bg-overlay px-2 py-0.5 text-xs text-fg-muted">
          +{hidden} more
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 6.4: TagChipList — GREEN**

```bash
pnpm test src/features/journal/components/TagChipList.test.tsx 2>&1 | tail -10
```

Expected: 3 tests pass.

- [ ] **Step 6.5: useJournalTagsByTradeId — write failing tests**

Create `src/features/journal/hooks/useJournalTagsByTradeId.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useJournalTagsByTradeId } from './useJournalTagsByTradeId';
import { HyperJournalDb } from '@lib/storage/db';
import type { SessionJournalEntry, TradeJournalEntry } from '@entities/journal-entry';

let db: HyperJournalDb;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  db = new HyperJournalDb(`hj-trade-tags-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

describe('useJournalTagsByTradeId', () => {
  it('returns an empty map when no trade entries exist', async () => {
    const { result } = renderHook(() => useJournalTagsByTradeId({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tagsByTradeId.size).toBe(0);
  });

  it('returns only trade-scope rows, keyed by tradeId', async () => {
    const trade: TradeJournalEntry = {
      id: 'e1',
      scope: 'trade',
      tradeId: 'BTC-1',
      createdAt: 0,
      updatedAt: 0,
      preTradeThesis: '',
      postTradeReview: '',
      lessonLearned: '',
      mood: null,
      planFollowed: null,
      stopLossUsed: null,
      strategyId: null,
      tags: ['breakout'],
      provenance: 'observed',
    };
    const session: SessionJournalEntry = {
      id: 's1',
      scope: 'session',
      date: '2026-04-24',
      createdAt: 0,
      updatedAt: 0,
      marketConditions: '',
      summary: '',
      whatToRepeat: '',
      whatToAvoid: '',
      mindset: null,
      disciplineScore: null,
      tags: ['ignored'],
      provenance: 'observed',
    };
    await db.journalEntries.put(trade);
    await db.journalEntries.put(session);

    const { result } = renderHook(() => useJournalTagsByTradeId({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tagsByTradeId.size).toBe(1);
    expect(result.current.tagsByTradeId.get('BTC-1')).toEqual(['breakout']);
  });
});
```

- [ ] **Step 6.6: useJournalTagsByTradeId — confirm RED**

```bash
pnpm test src/features/journal/hooks/useJournalTagsByTradeId.test.tsx 2>&1 | tail -10
```

Expected: "Cannot find module".

- [ ] **Step 6.7: useJournalTagsByTradeId — implement**

Create `src/features/journal/hooks/useJournalTagsByTradeId.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { TradeJournalEntry } from '@entities/journal-entry';

type Options = { db?: HyperJournalDb };

export type UseJournalTagsByTradeIdResult = {
  tagsByTradeId: ReadonlyMap<string, ReadonlyArray<string>>;
  isLoading: boolean;
};

const EMPTY_MAP: ReadonlyMap<string, ReadonlyArray<string>> = new Map();

/**
 * Returns a Map from tradeId to tags array for every trade-scope
 * journal entry. Threaded down from WalletView into TradeHistoryList
 * so wallets-feature components don't have to import journal-feature
 * code (boundaries rule).
 */
export function useJournalTagsByTradeId(
  options: Options = {},
): UseJournalTagsByTradeIdResult {
  const db = options.db ?? defaultDb;

  const query = useQuery<ReadonlyMap<string, ReadonlyArray<string>>>({
    queryKey: ['journal', 'trade-tags-by-id'],
    queryFn: async () => {
      const rows = await db.journalEntries.where('scope').equals('trade').toArray();
      const map = new Map<string, ReadonlyArray<string>>();
      for (const row of rows) {
        const trade = row as TradeJournalEntry;
        map.set(trade.tradeId, trade.tags ?? []);
      }
      return map;
    },
  });

  return {
    tagsByTradeId: query.data ?? EMPTY_MAP,
    isLoading: query.isLoading,
  };
}
```

- [ ] **Step 6.8: Export from barrel**

In `src/features/journal/index.ts`, add:

```ts
export { TagChipList } from './components/TagChipList';
export { useJournalTagsByTradeId } from './hooks/useJournalTagsByTradeId';
```

- [ ] **Step 6.9: GREEN + gauntlet**

```bash
pnpm test src/features/journal/components/TagChipList.test.tsx src/features/journal/hooks/useJournalTagsByTradeId.test.tsx && pnpm typecheck && pnpm lint 2>&1 | tail -3
```

Expected: 5 tests pass.

- [ ] **Step 6.10: Commit**

```bash
git add src/features/journal/components/TagChipList.tsx \
        src/features/journal/components/TagChipList.test.tsx \
        src/features/journal/hooks/useJournalTagsByTradeId.ts \
        src/features/journal/hooks/useJournalTagsByTradeId.test.tsx \
        src/features/journal/index.ts
git commit -m "$(cat <<'EOF'
feat(journal): add TagChipList + useJournalTagsByTradeId

TagChipList is a read-only display primitive: empty → null,
≤ max → render each as a chip, > max → first max + "+N more"
overflow. Neutral styling (fg-muted on bg-overlay rounded-full).

useJournalTagsByTradeId reads trade-scope rows and returns a
ReadonlyMap keyed by tradeId. Query key 'journal.trade-tags-by-id';
invalidated by useTradeJournalEntry save + remove (wired in Task 3).
Threads trade tags across the wallets→journal feature boundary via
the route-level composer (WalletView), keeping CONVENTIONS §15's
import-boundary rule intact.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Render `TagChipList` on three read surfaces

**Files:**
- Modify: `src/features/wallets/components/TradeHistoryList.tsx`
- Modify: `src/features/wallets/components/TradeHistoryList.test.tsx`
- Modify: `src/app/WalletView.tsx`
- Modify: `src/app/Strategies.tsx`
- Modify: `src/app/Strategies.test.tsx`
- Modify: `src/features/journal/components/JournalPanel.tsx`
- Modify: `src/features/journal/components/JournalPanel.test.tsx`

- [ ] **Step 7.1: TradeHistoryList — write failing test**

In `src/features/wallets/components/TradeHistoryList.test.tsx`, add (before closing `});`):

```ts
  it('renders tag chips when the trade has tags', () => {
    const trade = makeTrade({ id: 'BTC-1' });
    const tagsByTradeId = new Map<string, ReadonlyArray<string>>([
      ['BTC-1', ['breakout', 'fomc']],
    ]);
    render(
      <MemoryRouter>
        <TradeHistoryList
          trades={[trade]}
          address={'0x0000000000000000000000000000000000000001' as WalletAddress}
          tradeTagsByTradeId={tagsByTradeId}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('breakout')).toBeInTheDocument();
    expect(screen.getByText('fomc')).toBeInTheDocument();
  });
```

If `makeTrade` and `MemoryRouter` and `WalletAddress` aren't already imported in the test file, inspect the existing imports and add them.

- [ ] **Step 7.2: TradeHistoryList — confirm RED**

```bash
pnpm test src/features/wallets/components/TradeHistoryList.test.tsx 2>&1 | tail -10
```

Expected: the new test fails (prop `tradeTagsByTradeId` doesn't exist, tags not rendered).

- [ ] **Step 7.3: TradeHistoryList — add the prop and a Tags grid column**

Open `src/features/wallets/components/TradeHistoryList.tsx`.

**Edit A — imports.** Before the type imports, add:

```ts
import { TagChipList } from '@features/journal';
```

**Edit B — new empty default for the tag map.** Right after `const EMPTY_IDS: ReadonlySet<string> = new Set();`, add:

```ts
const EMPTY_TAGS_MAP: ReadonlyMap<string, ReadonlyArray<string>> = new Map();
```

**Edit C — Props.** Find:

```ts
type Props = {
  trades: ReadonlyArray<ReconstructedTrade>;
  address: WalletAddress;
  /**
   * Set of tradeIds that have journal notes. Supplied by the route-level
   * composer (src/app/*) which is allowed to consume features/journal;
   * features/wallets can't import sibling features directly per the
   * boundaries rule. Defaults to an empty set.
   */
  tradeIdsWithNotes?: ReadonlySet<string>;
};
```

Replace with:

```ts
type Props = {
  trades: ReadonlyArray<ReconstructedTrade>;
  address: WalletAddress;
  /**
   * Set of tradeIds that have journal notes. Supplied by the route-level
   * composer (src/app/*) which is allowed to consume features/journal;
   * features/wallets can't import sibling features directly per the
   * boundaries rule. Defaults to an empty set.
   */
  tradeIdsWithNotes?: ReadonlySet<string>;
  /**
   * Map of tradeId → tag array. Same boundary rationale as
   * tradeIdsWithNotes. Defaults to an empty map.
   */
  tradeTagsByTradeId?: ReadonlyMap<string, ReadonlyArray<string>>;
};
```

**Edit D — update `GRID_COLUMNS`.** Find:

```ts
const GRID_COLUMNS =
  'grid-cols-[minmax(80px,1fr)_70px_minmax(120px,1fr)_80px_minmax(100px,1fr)_80px]';
```

Replace with:

```ts
const GRID_COLUMNS =
  'grid-cols-[minmax(80px,1fr)_70px_minmax(120px,1fr)_80px_minmax(100px,1fr)_80px_minmax(80px,1fr)]';
```

**Edit E — component args destructure.** Find:

```ts
export function TradeHistoryList({
  trades,
  address,
  tradeIdsWithNotes = EMPTY_IDS,
}: Props) {
```

Replace with:

```ts
export function TradeHistoryList({
  trades,
  address,
  tradeIdsWithNotes = EMPTY_IDS,
  tradeTagsByTradeId = EMPTY_TAGS_MAP,
}: Props) {
```

**Edit F — add a Tags cell to each row.** Find:

```tsx
                  <div role="cell" className="text-right font-mono text-fg-muted">
                    {t.status === 'open' ? '—' : formatHoldTime(t.holdTimeMs)}
                  </div>
                </Link>
```

Replace with:

```tsx
                  <div role="cell" className="text-right font-mono text-fg-muted">
                    {t.status === 'open' ? '—' : formatHoldTime(t.holdTimeMs)}
                  </div>
                  <div role="cell" className="overflow-hidden">
                    <TagChipList tags={tradeTagsByTradeId.get(t.id) ?? []} max={2} />
                  </div>
                  {/* tradeTagsByTradeId.get(...) ?? [] defends against
                      both missing-entry and pre-7e rows where
                      useJournalTagsByTradeId returns undefined-tagged
                      rows (coerced to [] in the hook). */}
                </Link>
```

**Edit G — check the header row.** If `TradeHistoryList` renders a header row somewhere (look for "trade history" heading or a row with header labels that maps to the same `GRID_COLUMNS`), add a blank 7th cell to match. If the component does NOT render a header row, skip — the grid auto-handles the extra column.

- [ ] **Step 7.4: TradeHistoryList — GREEN**

```bash
pnpm test src/features/wallets/components/TradeHistoryList.test.tsx 2>&1 | tail -10
```

Expected: all green.

- [ ] **Step 7.5: WalletView — thread the hook down**

Open `src/app/WalletView.tsx`. Near the existing `useJournalEntryIds` call (line ~76), add:

```ts
  const { tagsByTradeId } = useJournalTagsByTradeId();
```

Also update the import on line ~15 from:

```ts
import { useJournalEntryIds } from '@features/journal';
```

to:

```ts
import { useJournalEntryIds, useJournalTagsByTradeId } from '@features/journal';
```

Then thread `tagsByTradeId` into the `<TradeHistoryList>` usage. Find the existing line that passes `tradeIdsWithNotes={tradeIdsWithNotes}` (around line 136) and add a sibling prop:

```tsx
            tradeIdsWithNotes={tradeIdsWithNotes}
            tradeTagsByTradeId={tagsByTradeId}
```

- [ ] **Step 7.6: Strategies — add TagChipList to list rows**

Open `src/app/Strategies.test.tsx`. In the existing "lists existing strategies with names and teasers" test, the entry literal now has `tags: []` (added by Task 1 Step 1.7 backfill). Find that line and replace:

```ts
      tags: [],
```

with:

```ts
      tags: ['breakout', 'momentum'],
```

After the existing `expect(screen.getByRole('link', { name: /breakout/i })).toHaveAttribute('href', '/s/abc');` line, append:

```ts
    expect(screen.getByText('momentum')).toBeInTheDocument();
```

Then open `src/app/Strategies.tsx`. Update the import to bring in `TagChipList`:

Find:

```ts
import { useCreateStrategy, useStrategies } from '@features/journal';
```

Replace with:

```ts
import { useCreateStrategy, useStrategies, TagChipList } from '@features/journal';
```

In the list `<Link>` block (around `{e.name.trim() === '' ? 'Untitled' : e.name}` span), after the teaser span `<span className="line-clamp-1 text-fg-base">{teaser(e)}</span>` and before the `</Link>`, add:

```tsx
                  <TagChipList tags={e.tags ?? []} max={3} />
```

(`e.tags ?? []` defends against pre-7e strategy rows that lack the `tags` field at runtime.)

- [ ] **Step 7.7: JournalPanel — add TagChipList**

Open `src/features/journal/components/JournalPanel.test.tsx`. In the existing "lists recent session entries with dates and teasers" test, the seeded entry now has `tags: []` (backfilled by Task 1 Step 1.7). Find:

```ts
      tags: [],
```

Replace with:

```ts
      tags: ['fomc'],
```

After the existing `expect(link).toHaveAttribute('href', '/d/2026-04-20');` assertion, append:

```ts
    expect(screen.getByText('fomc')).toBeInTheDocument();
```

Then open `src/features/journal/components/JournalPanel.tsx`. Add the import:

```ts
import { TagChipList } from './TagChipList';
```

In the list `<Link>` row, after the existing teaser span `<span className="line-clamp-1 text-fg-base">{teaser(e)}</span>` and before the `</Link>`, add:

```tsx
              <TagChipList tags={e.tags ?? []} max={3} />
```

(`e.tags ?? []` defends against pre-7e session rows.)

- [ ] **Step 7.8: GREEN + gauntlet**

```bash
pnpm typecheck && pnpm lint && pnpm test 2>&1 | tail -10
```

Expected: all green.

- [ ] **Step 7.9: Commit**

```bash
git add src/features/wallets/components/TradeHistoryList.tsx \
        src/features/wallets/components/TradeHistoryList.test.tsx \
        src/app/WalletView.tsx \
        src/app/Strategies.tsx \
        src/app/Strategies.test.tsx \
        src/features/journal/components/JournalPanel.tsx \
        src/features/journal/components/JournalPanel.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): render TagChipList on three read surfaces

Trade-history rows: new "Tags" grid column at far right renders up to
2 chips + "+N more" overflow (virtualizer + fixed-height row =
max-2-chip constraint). WalletView composes useJournalTagsByTradeId
and threads the map through the same feature-boundary path as
tradeIdsWithNotes.

/strategies list rows: up to 3 chips below the teaser line.
JournalPanel session rows: up to 3 chips below the teaser line.

All three surfaces are read-only; tag-filter interaction is
out-of-scope for 7e (deferred to a later session).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Playwright E2E + docs + final gauntlet

**Files:**
- Create: `e2e/tags-roundtrip.spec.ts`
- Modify: `docs/SESSION_LOG.md`
- Modify: `docs/BACKLOG.md`
- Modify: `docs/CONVENTIONS.md`

- [ ] **Step 8.1: Write the E2E spec**

Create `e2e/tags-roundtrip.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { mockHyperliquid } from './fixtures/hyperliquid-route';

const TEST_ADDR = '0x0000000000000000000000000000000000000001';

test.describe('tags round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await mockHyperliquid(page);
  });

  test('trade tag round-trip: add → blur → reload → persists → remove', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}$`));
    const table = page.getByRole('table', { name: /trade history/i });
    await table.getByRole('row').nth(1).click();
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}/t/`));

    const input = page.getByLabel(/^tags$/i);
    await input.fill('breakout');
    await input.press('Enter');
    await input.fill('revenge trade');
    await input.press('Enter');
    await input.press('Tab');
    await expect(page.getByText(/saved at/i)).toBeVisible();

    await page.reload();
    await expect(page.getByText('breakout')).toBeVisible();
    await expect(page.getByText('revenge trade')).toBeVisible();

    // Remove breakout via its X.
    await page.getByRole('button', { name: 'Remove tag: breakout' }).click();
    await page.getByLabel(/^tags$/i).press('Tab');
    await expect(page.getByText(/saved at/i)).toBeVisible();

    await page.reload();
    await expect(page.getByText('revenge trade')).toBeVisible();
    await expect(page.getByText('breakout')).toBeHidden();
  });

  test('cross-variant autocomplete: strategy tag suggests on a trade', async ({
    page,
  }) => {
    // 1. Create a strategy with a tag.
    await page.goto('/');
    await page.getByRole('link', { name: /strategies/i }).click();
    await page.getByLabel(/new strategy name/i).fill('E2E Strategy');
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page).toHaveURL(/\/s\/[0-9a-f-]{36}$/);
    const stratTagInput = page.getByLabel(/^tags$/i);
    await stratTagInput.fill('e2e-pooled');
    await stratTagInput.press('Enter');
    await stratTagInput.press('Tab');
    await expect(page.getByText(/saved at/i)).toBeVisible();

    // 2. Navigate to a trade.
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    const table = page.getByRole('table', { name: /trade history/i });
    await table.getByRole('row').nth(1).click();

    // 3. Type partial into the trade's tag input → suggestion appears.
    const tradeTagInput = page.getByLabel(/^tags$/i);
    await tradeTagInput.fill('e2e');
    await expect(page.getByRole('option', { name: 'e2e-pooled' })).toBeVisible();

    // 4. ArrowDown + Enter picks it.
    await tradeTagInput.press('ArrowDown');
    await tradeTagInput.press('Enter');
    await tradeTagInput.press('Tab');
    await expect(page.getByText(/saved at/i)).toBeVisible();

    // 5. Reload — tag persists.
    await page.reload();
    await expect(page.getByText('e2e-pooled')).toBeVisible();
  });
});
```

- [ ] **Step 8.2: Run E2E**

```bash
pnpm test:e2e e2e/tags-roundtrip.spec.ts 2>&1 | tail -15
```

Expected: 2 tests pass. If any locator fails, adjust using the 7d lesson (`press('Tab')` not `blur()` for React onBlur reliability; already baked in).

- [ ] **Step 8.3: Commit E2E**

```bash
git add e2e/tags-roundtrip.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): add tags round-trip

Two tests. (1) Navigate into a trade → type two tags + Enter each →
Tab to blur → "Saved at" appears → reload → both chips present →
remove one via its X button → reload → only the other persists.

(2) Create a strategy at /strategies with a tag → navigate to a
trade → type partial into the trade's tag input → suggestion appears
in the dropdown → ArrowDown + Enter picks it → reload → tag persists
on the trade. Exercises the pooled-cross-variant autocomplete
(useAllTags).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8.4: Run full gauntlet — get final counts**

```bash
pnpm typecheck && pnpm lint && pnpm test:coverage 2>&1 | tail -15
pnpm build 2>&1 | tail -5
pnpm test:e2e 2>&1 | tail -15
```

Expected: all green; domain coverage ≥ 90%. Note the total unit count (should be **360** — 329 prior + 7 normalize + 3 validation + 7 TagInput + 2 useAllTags + 2 useJournalTagsByTradeId + 3 TagChipList + 2+2+2 form tests + 1+1+1 surface tests) and confirm **13** E2E tests pass.

- [ ] **Step 8.5: Append Session 7e entry to SESSION_LOG.md**

At the end of `docs/SESSION_LOG.md`:

```markdown

## 2026-04-24 — Phase 1 Session 7e: Tags

**Session goal:** Add free-form tags to every journal variant. Build a reusable chip-input primitive; display tag chips on existing read surfaces. Split from the original combined "7d — Tags + linking" BACKLOG entry (7d shipped linking).

**Done:**

- `tags: ReadonlyArray<string>` added to `TradeJournalEntry`, `SessionJournalEntry`, `StrategyJournalEntry`. No Dexie schema bump — row value only; pre-7e rows coerce via `entry.tags ?? []` and self-heal on next upsert.
- `@domain/tags/normalizeTag` — pure `normalizeTag` + `normalizeTagList` helpers (lowercase, trim, whitespace-collapse, 40-char cap, dedupe). [+5 tests]
- Zod `.default([])` on all three variant schemas; `formatVersion` unchanged. Pre-7e export files parse cleanly. [+3 validation cases]
- `TagInput` primitive (`@lib/ui/components/tag-input`) — accessible combobox-style chip input with keyboard autocomplete. Enter/comma commits; Backspace-in-empty removes last; X on chip removes; Arrow-key nav; Escape clears; blur commits pending then calls parent onBlur in order. [+7 tests]
- `useAllTags` hook — pooled across all three variants, dedupes + sorts. Invalidated by all three save hooks. [+2 tests]
- `useJournalTagsByTradeId` hook — `ReadonlyMap<tradeId, tags>` for trade-scope rows; threads across the wallets→journal feature boundary without import cycles. [+2 tests]
- All three form components wired: TagInput below domain-specific fields (above tri-state radios in Trade; below whatToAvoid in Session; bottom of form in Strategy). `isDraftEmpty` extended; `commit` re-normalizes via `normalizeTagList`. [+2 tests per form = 6 total]
- `TagChipList` read-only primitive — max N chips + "+N more" overflow. [+3 tests]
- Three read surfaces integrated:
  - `TradeHistoryList`: new "Tags" grid column (far right), max=2 due to virtualized fixed-row-height constraint; threaded via `tradeTagsByTradeId` prop from `WalletView`. [+1 test]
  - `/strategies` list rows: max=3 chips below the teaser. [+1 test]
  - `JournalPanel` session rows: max=3 chips below the teaser. [+1 test]
- Playwright: `e2e/tags-roundtrip.spec.ts` — trade round-trip + cross-variant autocomplete. [+2 E2E]
- End state: **360** unit tests, **13** E2E tests, gauntlet + build green, domain coverage ≥ 90%.

**Decisions made:** none (no new ADRs).

**Deferred / not done:**

- **Tag filter** on list surfaces — not in 7e; BACKLOG. Adds multi-tag AND vs OR semantics, filter-control placement, composition with existing filters.
- **Tag management UI** (rename / merge / archive) — BACKLOG.
- **Multi-entry `*tags` Dexie index** — not in 7e; needed when tag-filtering at scale lands.
- **Tag-usage counts in autocomplete** — BACKLOG polish.
- **Paste-comma-separated bulk entry** — BACKLOG small item.
- **Screenshots** — Session 7f.

**Gotchas for next session:**

- `TagInput` suggestions dropdown uses `onMouseDown` to commit (mousedown fires before blur). If anything ever adds click-outside handling, be careful to exclude the listbox from the "outside" detection — otherwise clicking a suggestion looks like outside-click.
- `useJournalTagsByTradeId` invalidation is wired ONLY on trade-journal save/remove. Session + strategy saves don't invalidate it (they don't affect the trade map). If a future refactor changes scope membership post-save, revisit.
- Pre-7e rows in storage lack `tags` entirely. `entry.tags ?? []` handles read-time; next save writes `[]` explicitly. Export files written before 7e default via Zod. Both paths covered.
- `TradeHistoryList` grid now has 7 columns. The `GRID_COLUMNS` constant is the single source; any future column adds need to update there.

**Invariants assumed:**

- Tag strings in storage are ALWAYS normalized (lowercased, trimmed, whitespace-collapsed). Inbound import doesn't re-normalize — but the first form save re-normalizes via `normalizeTagList`. Lossy-forward: hand-edited imports are treated kindly.
- Tag dedup is case-insensitive via normalization; storage never carries both "Breakout" and "breakout" as distinct tags.
- Empty `tags: []` is always the fallback — never null, never undefined in the final TypeScript type (even if Dexie storage has undefined from pre-7e rows).

---
```

- [ ] **Step 8.6: Update BACKLOG.md**

Open `docs/BACKLOG.md`. Find the existing Session 7c entry (from 7d commit):

```markdown
- `[next]` Tags — Session 7e. `tags: string[]` on all journal variants (trade, session, strategy). Chip-input component, denormalized storage, strict-normalize on save (lowercase + trim). Screenshots shift to Session 7f.
```

Replace with:

```markdown
- `[next]` Screenshots/images — Session 7f. IndexedDB blob storage.
```

Find any other references to "Tags — Session 7e" in the 7c/7d deferral blocks and delete them (tags are now done).

Append at the end of `docs/BACKLOG.md`:

```markdown

---

## Session 7e deferrals

- `[next]` Screenshots — Session 7f.
- `[maybe]` Tag filtering on list surfaces. Multi-tag AND vs OR semantics, filter-control UX (chip-strip vs dropdown vs search bar), composition with existing filters. Real design work; own session.
- `[maybe]` Tag management UI — rename, merge, archive. Phase 1 data volumes make find-and-replace practical; revisit when a user reports confused vocabulary.
- `[maybe]` `*tags` Dexie multiEntry index. Needed when tag-filter or tag-count reach enough data volume to matter.
- `[maybe]` Tag-usage counts in autocomplete dropdown ("breakout (used 7×)"). Useful past ~50 tags.
- `[maybe]` Paste-comma-separated bulk entry — `"breakout, fomc, macro"` in a single paste fans out to three chips. Small but non-trivial keyboard logic.
- `[maybe]` Tag-color customization. Currently all chips are neutral; custom color-per-tag is product-identity work deserving its own design.
- `[maybe]` Click-outside-to-close on the `TagInput` suggestion dropdown. Blur already closes it; click-outside matters only if the dropdown needs to survive blur (it doesn't today).
```

- [ ] **Step 8.7: Amend CONVENTIONS §15**

Open `docs/CONVENTIONS.md`. Find `## 15. Journaling`. At the end of that section, append:

```markdown
- **Tags are normalized on save, lossy-forward on import.** Normalize = lowercase + trim + collapse-whitespace + truncate-to-40 + dedupe. The `TagInput` normalizes per-commit; forms re-normalize the whole array on save (defence-in-depth); imports do NOT normalize (preserves forward-compat with hypothetical future schema enrichment — first form save re-normalizes).
- **Tag vocabulary is pooled across all three journal variants.** `useAllTags` reads every journal row; any tag used on any variant suggests in any variant's form. Prevents per-scope namespace confusion.
- **Tag read surfaces are view-only in 7e.** `TagChipList` chips aren't clickable. Click-to-filter is a future concern with its own design scope.
- **Pre-7e rows coerce on read.** `tags` may be `undefined` in IndexedDB for entries written before 7e. Every read uses `entry.tags ?? []`. Row self-heals on next upsert.
- **TagInput listbox uses `onMouseDown` for selection.** Mousedown fires before blur, so clicking a suggestion commits without racing the input's blur handler.
```

- [ ] **Step 8.8: Commit docs**

```bash
git add docs/SESSION_LOG.md docs/BACKLOG.md docs/CONVENTIONS.md
git commit -m "$(cat <<'EOF'
docs: record Session 7e session log, backlog, conventions

Captures the tags session: tags on all three journal variants,
normalizeTag helper, Zod .default([]) backwards-compat, TagInput +
TagChipList primitives, useAllTags + useJournalTagsByTradeId hooks,
form integrations, read-surface integrations, Playwright round-trip.

BACKLOG: promotes Session 7f (screenshots) to [next]; files eight
new 7e deferrals (filtering, management, index, tag counts, bulk
paste, colors, click-outside, tag-usage).

CONVENTIONS §15: adds five sub-rules covering normalize-on-save
lossy-forward-on-import semantics, pooled-cross-variant vocabulary,
read-surface view-only status, pre-7e row coercion, and the
TagInput mousedown-for-selection pattern.

End state: 360 unit / 13 E2E, gauntlet + build green, domain
coverage ≥ 90%.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Success criteria (copy from spec §13)

1. All three journal forms expose a "Tags" field with chip-input behavior (Enter/comma commits, Backspace removes, X-on-chip removes, autocomplete dropdown).
2. Typing a tag + Enter + blur (via Tab) persists `tags: ["the-tag"]` on Dexie; reload preserves.
3. Autocomplete draws from every existing tag across all three variants.
4. X on a chip or Backspace-in-empty removes; form autosaves.
5. Trade-history rows, `/strategies` list, and `JournalPanel` session rows render up to N chips + "+K more" overflow.
6. Pre-7e entries load without error; export/import round-trips cleanly including for old files lacking the field.
7. `pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build` all green; domain coverage ≥ 90%.
8. `pnpm test:e2e` — new spec passes; existing 11 specs still pass.
9. SESSION_LOG / BACKLOG / CONVENTIONS updated.
