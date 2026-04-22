# Phase 1 Session 7b — Session/day Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the session/day journal scope. `JournalEntry` becomes a discriminated union (`TradeJournalEntry | SessionJournalEntry`). New `/d/:date` route with a six-field `SessionJournalForm` carrying autosave-on-blur semantics from 7a. `JournalPanel` on SplitHome becomes the real home for discovering and opening session entries. Export/import migrates to a Zod discriminated union without a format-version bump.

**Architecture:** Additive Dexie v3 (new index, no data migration). Same one-table `journalEntries` storage with scope as the discriminator. Trade-journal surface from 7a is untouched. Session entries are wallet-agnostic per plan §11.8 — the `/d/:date` route lives outside the `/w/:address/...` tree.

**Tech Stack:** No new dependencies. React/Router, Dexie, TanStack Query, Zod, Playwright.

---

## File structure (at end of session)

```
HyperJournal/
├── src/
│   ├── entities/
│   │   └── journal-entry.ts                          MODIFY (+Mindset, +SessionJournalEntry, rename to TradeJournalEntry, union)
│   ├── domain/
│   │   └── dates/
│   │       ├── isValidDateString.ts                  NEW — YYYY-MM-DD predicate + branded type
│   │       ├── isValidDateString.test.ts             NEW
│   │       ├── todayUtcDateString.ts                 NEW — inject-now helper
│   │       └── todayUtcDateString.test.ts            NEW
│   ├── lib/
│   │   ├── storage/
│   │   │   ├── db.ts                                 MODIFY (+version(3), +date index on journalEntries)
│   │   │   ├── journal-entries-repo.ts               MODIFY (+findByDate, +listSessionEntries, narrow findByTradeId, fix listAllTradeIds)
│   │   │   └── journal-entries-repo.test.ts          MODIFY (+cases)
│   │   └── validation/
│   │       ├── export.ts                             MODIFY (JournalEntrySchema → discriminated union + MindsetSchema)
│   │       └── export.test.ts                        MODIFY (+cases)
│   ├── features/
│   │   └── journal/
│   │       ├── hooks/
│   │       │   ├── useTradeJournalEntry.ts           MODIFY (narrow types to TradeJournalEntry)
│   │       │   ├── useSessionJournalEntry.ts         NEW
│   │       │   ├── useSessionJournalEntry.test.tsx   NEW
│   │       │   ├── useRecentSessionEntries.ts        NEW
│   │       │   └── useRecentSessionEntries.test.tsx  NEW
│   │       ├── components/
│   │       │   ├── SessionJournalForm.tsx            NEW
│   │       │   ├── SessionJournalForm.test.tsx       NEW
│   │       │   ├── JournalPanel.tsx                  MODIFY (rewrite: real listing + Today CTA)
│   │       │   ├── JournalPanel.test.tsx             NEW
│   │       │   └── TradeJournalForm.tsx              MODIFY (use TradeJournalEntry type in save payload)
│   │       └── index.ts                              MODIFY (+exports)
│   └── app/
│       ├── routes.tsx                                MODIFY (+/d/:date)
│       ├── DayDetail.tsx                             NEW
│       └── DayDetail.test.tsx                        NEW
├── e2e/
│   └── session-journal-roundtrip.spec.ts             NEW
└── docs/
    ├── SESSION_LOG.md                                MODIFY (+Session 7b entry)
    ├── BACKLOG.md                                    MODIFY (+7 entries)
    └── CONVENTIONS.md                                MODIFY (§15 amended)
```

---

## Conventions (for every task)

- Commands from `/Users/angel/Documents/HyperJournal`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- TDD for domain + repo + hooks. Component tests via RTL. Final E2E via Playwright.
- Gauntlet after every code task: `pnpm typecheck && pnpm lint && pnpm test`. Final full gauntlet + E2E at Task 11.

---

## Task 1: Domain helpers — `isValidDateString` + `todayUtcDateString`

Two small pure functions the route + JournalPanel depend on.

**Files:**
- Create: `src/domain/dates/isValidDateString.ts`
- Create: `src/domain/dates/isValidDateString.test.ts`
- Create: `src/domain/dates/todayUtcDateString.ts`
- Create: `src/domain/dates/todayUtcDateString.test.ts`

- [ ] **Step 1.1: Write failing tests for `isValidDateString` (RED)**

Create `src/domain/dates/isValidDateString.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isValidDateString } from './isValidDateString';

describe('isValidDateString', () => {
  it('accepts a valid YYYY-MM-DD', () => {
    expect(isValidDateString('2026-04-22')).toBe(true);
    expect(isValidDateString('2024-02-29')).toBe(true); // leap year
    expect(isValidDateString('1970-01-01')).toBe(true);
  });

  it('rejects malformed strings', () => {
    expect(isValidDateString('2026-4-22')).toBe(false);
    expect(isValidDateString('2026-04-22T00:00:00Z')).toBe(false);
    expect(isValidDateString('22/04/2026')).toBe(false);
    expect(isValidDateString('')).toBe(false);
    expect(isValidDateString('not-a-date')).toBe(false);
  });

  it('rejects impossible calendar dates', () => {
    expect(isValidDateString('2025-02-30')).toBe(false);
    expect(isValidDateString('2025-13-01')).toBe(false);
    expect(isValidDateString('2025-04-31')).toBe(false);
    expect(isValidDateString('2023-02-29')).toBe(false); // non-leap
  });

  it('narrows to YYYYMMDD branded type', () => {
    const s = '2026-04-22';
    if (isValidDateString(s)) {
      // This must typecheck: branded type is assignable to string.
      const _brandedNarrowsToString: string = s;
      void _brandedNarrowsToString;
    }
  });
});
```

- [ ] **Step 1.2: Run — confirm RED**

```bash
pnpm test src/domain/dates/isValidDateString.test.ts
```

Expected: "Cannot find module './isValidDateString'".

- [ ] **Step 1.3: Implement `src/domain/dates/isValidDateString.ts`**

```ts
/**
 * Branded YYYY-MM-DD string. Routes and repos accept this narrowed type
 * so date validation only has to happen at the boundary.
 */
export type YYYYMMDD = string & { readonly __brand: 'YYYYMMDD' };

/**
 * Validates a string is a real YYYY-MM-DD calendar date (UTC-agnostic).
 * Rejects impossible dates like 2025-02-30. Narrows the input to the
 * branded YYYYMMDD type for downstream consumers.
 */
export function isValidDateString(s: string): s is YYYYMMDD {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  // Construct a UTC date and compare — JS Date rolls 2025-02-30 to 2025-03-02,
  // so a round-trip mismatch indicates the original wasn't a real calendar day.
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return (
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() === m - 1 &&
    parsed.getUTCDate() === d
  );
}
```

- [ ] **Step 1.4: Run — confirm GREEN**

```bash
pnpm test src/domain/dates/isValidDateString.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 1.5: Write failing tests for `todayUtcDateString` (RED)**

Create `src/domain/dates/todayUtcDateString.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { todayUtcDateString } from './todayUtcDateString';

describe('todayUtcDateString', () => {
  it('returns YYYY-MM-DD in UTC for the given clock', () => {
    // 2026-04-22T15:30:00Z — deep in UTC "today"
    expect(todayUtcDateString(Date.UTC(2026, 3, 22, 15, 30))).toBe('2026-04-22');
  });

  it('pads single-digit month and day', () => {
    expect(todayUtcDateString(Date.UTC(2026, 0, 5))).toBe('2026-01-05');
  });

  it('is UTC-anchored regardless of the local clock', () => {
    // 2026-04-22T23:30:00Z — still "today" in UTC even if the local
    // timezone is UTC+something that rolls over.
    expect(todayUtcDateString(Date.UTC(2026, 3, 22, 23, 30))).toBe('2026-04-22');
    // 2026-04-23T00:30:00Z — "tomorrow" starts at UTC midnight.
    expect(todayUtcDateString(Date.UTC(2026, 3, 23, 0, 30))).toBe('2026-04-23');
  });
});
```

- [ ] **Step 1.6: Run — confirm RED**

```bash
pnpm test src/domain/dates/todayUtcDateString.test.ts
```

Expected: "Cannot find module './todayUtcDateString'".

- [ ] **Step 1.7: Implement `src/domain/dates/todayUtcDateString.ts`**

```ts
import type { YYYYMMDD } from './isValidDateString';

/**
 * Returns today's date in UTC as YYYY-MM-DD. The `now` parameter is
 * injectable so tests don't depend on wall-clock time and so a calling
 * component can re-compute across midnight if desired.
 */
export function todayUtcDateString(now: number): YYYYMMDD {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}` as YYYYMMDD;
}
```

- [ ] **Step 1.8: Run — confirm GREEN + gauntlet**

```bash
pnpm test src/domain/dates/ && pnpm typecheck && pnpm lint
```

Expected: 7 tests pass; typecheck + lint green.

- [ ] **Step 1.9: Commit**

```bash
git add src/domain/dates/
git commit -m "$(cat <<'EOF'
feat(dates): add isValidDateString + todayUtcDateString pure helpers

isValidDateString narrows a string to a branded YYYYMMDD type, so
route handlers and repos can pass a typed value past the boundary.
Uses Date round-trip comparison to reject impossible dates
(2025-02-30, 2025-13-01, non-leap Feb 29).

todayUtcDateString takes an injected `now` so tests and components
are free of wall-clock coupling.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Entity discriminated union + Dexie schema v3

Widen `JournalEntry` to a union of `TradeJournalEntry | SessionJournalEntry`. Existing Dexie rows already carry `scope: 'trade'` so they match the TradeJournalEntry variant — no data migration. Dexie v3 adds a `date` index.

**Files:**
- Modify: `src/entities/journal-entry.ts`
- Modify: `src/lib/storage/db.ts`

- [ ] **Step 2.1: Rewrite `src/entities/journal-entry.ts`**

```ts
import type { Provenance } from './provenance';

/**
 * Mood the user was in during/after a trade. Trade-scope only.
 */
export type Mood =
  | 'calm'
  | 'confident'
  | 'anxious'
  | 'greedy'
  | 'regretful';

/**
 * Mindset during a trading session. Session-scope only. Parallel shape
 * to Mood (five curated enum values plus null), but different semantic
 * axis — mood is emotional, mindset is cognitive.
 */
export type Mindset =
  | 'focused'
  | 'scattered'
  | 'reactive'
  | 'patient'
  | 'tilted';

/**
 * Trade-scoped journal entry. Introduced in Session 7a.
 */
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

  readonly provenance: Provenance;
};

/**
 * Session/day-scoped journal entry. Introduced in Session 7b. Keyed by
 * a UTC YYYY-MM-DD date; one entry per date. Wallet-agnostic per plan
 * §11.8 — these fields describe the trader, not a specific wallet.
 */
export type SessionJournalEntry = {
  readonly id: string;
  readonly scope: 'session';
  readonly date: string; // YYYY-MM-DD (UTC)
  readonly createdAt: number;
  readonly updatedAt: number;

  readonly marketConditions: string;
  readonly summary: string;
  readonly whatToRepeat: string;
  readonly whatToAvoid: string;

  readonly mindset: Mindset | null;
  readonly disciplineScore: number | null; // 1-5

  readonly provenance: Provenance;
};

/**
 * Discriminated union across all journal scopes. Narrow on `scope` to
 * access variant-specific fields. Sessions 7c/7d will extend this union
 * with 'strategy' and image-attachment variants.
 */
export type JournalEntry = TradeJournalEntry | SessionJournalEntry;
```

- [ ] **Step 2.2: Bump Dexie to v3**

In `src/lib/storage/db.ts`, add after the existing `this.version(2).stores({...})` call:

```ts
    this.version(3).stores({
      wallets: '&address, addedAt',
      fillsCache: '&address, fetchedAt',
      userSettings: '&key',
      journalEntries: '&id, tradeId, scope, updatedAt, date',
    });
```

Update the class-level comment block to mention v3:

```ts
/**
 * Dexie database for HyperJournal.
 *
 * v1: wallets, fillsCache, userSettings (Session 2b).
 * v2: adds journalEntries (Session 7a). Additive only.
 * v3: adds `date` index on journalEntries for session-scope lookups
 *     (Session 7b). Additive only — no .upgrade() callback because
 *     no existing row needs transforming.
 * ...
 */
```

- [ ] **Step 2.3: Typecheck — expect cascading errors**

```bash
pnpm typecheck 2>&1 | head -40
```

Expected: `listAllTradeIds` and `findByTradeId` in `journal-entries-repo.ts` will error because `tradeId` is no longer on every `JournalEntry`. `useTradeJournalEntry.ts` may also error on its `save` signature. These are fixed in Task 3.

Note the error messages — they are informational. Don't commit yet.

- [ ] **Step 2.4: Commit (expect a "broken intermediate" commit)**

The entity + Dexie change cascades into multiple callers; rather than split this commit, bundle the entity change with the fixes in Task 3 by leaving this uncommitted until Task 3's gauntlet is green. Skip commit for now.

---

## Task 3: Repo extensions + caller fixes

Add `findByDate` + `listSessionEntries`. Narrow `findByTradeId` to return `TradeJournalEntry | null`. Fix `listAllTradeIds` to filter by scope. Update `useTradeJournalEntry` types to narrow accordingly.

**Files:**
- Modify: `src/lib/storage/journal-entries-repo.ts`
- Modify: `src/lib/storage/journal-entries-repo.test.ts`
- Modify: `src/features/journal/hooks/useTradeJournalEntry.ts`

- [ ] **Step 3.1: Rewrite `src/lib/storage/journal-entries-repo.ts`**

```ts
import type {
  JournalEntry,
  SessionJournalEntry,
  TradeJournalEntry,
} from '@entities/journal-entry';
import type { HyperJournalDb } from './db';

export type JournalEntriesRepo = {
  findByTradeId(tradeId: string): Promise<TradeJournalEntry | null>;
  findByDate(date: string): Promise<SessionJournalEntry | null>;
  upsert(entry: JournalEntry): Promise<void>;
  remove(id: string): Promise<void>;
  listAll(): Promise<ReadonlyArray<JournalEntry>>;
  listAllTradeIds(): Promise<Set<string>>;
  listSessionEntries(limit?: number): Promise<ReadonlyArray<SessionJournalEntry>>;
};

/**
 * Repository for journal entries. Session 7a added trade-scope lookups;
 * 7b adds session-scope (findByDate + listSessionEntries). Return types
 * narrow to the specific variant so callers don't need their own type
 * guards.
 */
export function createJournalEntriesRepo(db: HyperJournalDb): JournalEntriesRepo {
  return {
    async findByTradeId(tradeId) {
      const entry = await db.journalEntries
        .where('tradeId')
        .equals(tradeId)
        .first();
      if (!entry || entry.scope !== 'trade') return null;
      return entry;
    },
    async findByDate(date) {
      const entry = await db.journalEntries
        .where('date')
        .equals(date)
        .first();
      if (!entry || entry.scope !== 'session') return null;
      return entry;
    },
    async upsert(entry) {
      await db.journalEntries.put(entry);
    },
    async remove(id) {
      await db.journalEntries.delete(id);
    },
    async listAll() {
      return db.journalEntries.toArray();
    },
    async listAllTradeIds() {
      const rows = await db.journalEntries
        .where('scope')
        .equals('trade')
        .toArray();
      // Narrowed: every row here is a TradeJournalEntry (scope filter).
      return new Set(rows.map((r) => (r as TradeJournalEntry).tradeId));
    },
    async listSessionEntries(limit = 7) {
      const rows = await db.journalEntries
        .where('scope')
        .equals('session')
        .toArray();
      // Narrowed: every row here is a SessionJournalEntry.
      const sessions = rows as SessionJournalEntry[];
      sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      return sessions.slice(0, limit);
    },
  };
}
```

- [ ] **Step 3.2: Extend `src/lib/storage/journal-entries-repo.test.ts`**

Add near the top:

```ts
import type { JournalEntry, SessionJournalEntry } from '@entities/journal-entry';
```

Replace the existing `makeEntry` with two factories:

```ts
function makeTradeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'entry-1',
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
    provenance: 'observed',
    ...overrides,
  } as JournalEntry;
}

function makeSessionEntry(overrides: Partial<SessionJournalEntry> = {}): JournalEntry {
  return {
    id: 'session-1',
    scope: 'session',
    date: '2026-04-22',
    createdAt: 100,
    updatedAt: 100,
    marketConditions: '',
    summary: '',
    whatToRepeat: '',
    whatToAvoid: '',
    mindset: null,
    disciplineScore: null,
    provenance: 'observed',
    ...overrides,
  } as JournalEntry;
}
```

Rename references to the old `makeEntry` in the existing tests to `makeTradeEntry`.

Append three new tests at the end of the `describe` block:

```ts
  it('findByDate returns the session entry when one exists', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeSessionEntry({ date: '2026-04-22', summary: 's' }));
    const found = await repo.findByDate('2026-04-22');
    expect(found?.summary).toBe('s');
    expect(found?.scope).toBe('session');
  });

  it('findByDate returns null when the matching entry is a different scope', async () => {
    const repo = createJournalEntriesRepo(db);
    // A trade entry with a `date`-like tradeId should not match.
    await repo.upsert(makeTradeEntry({ tradeId: '2026-04-22' }));
    expect(await repo.findByDate('2026-04-22')).toBeNull();
  });

  it('listSessionEntries returns session-scope rows ordered by updatedAt desc', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeSessionEntry({ id: 'old', date: '2026-04-20', updatedAt: 100 }));
    await repo.upsert(makeSessionEntry({ id: 'new', date: '2026-04-22', updatedAt: 300 }));
    await repo.upsert(makeTradeEntry({ id: 'trade', updatedAt: 200 }));
    const result = await repo.listSessionEntries();
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('new');
    expect(result[1]!.id).toBe('old');
  });

  it('listSessionEntries respects the limit arg', async () => {
    const repo = createJournalEntriesRepo(db);
    for (let i = 0; i < 5; i++) {
      await repo.upsert(
        makeSessionEntry({ id: `s${i}`, date: `2026-04-${String(22 - i).padStart(2, '0')}`, updatedAt: i }),
      );
    }
    const result = await repo.listSessionEntries(3);
    expect(result).toHaveLength(3);
  });

  it('listAllTradeIds only returns trade-scope rows (session rows excluded)', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeTradeEntry({ id: 't1', tradeId: 'BTC-1' }));
    await repo.upsert(makeSessionEntry({ id: 's1', date: '2026-04-22' }));
    const ids = await repo.listAllTradeIds();
    expect(ids.has('BTC-1')).toBe(true);
    expect(ids.size).toBe(1);
  });
```

- [ ] **Step 3.3: Narrow `useTradeJournalEntry` types**

In `src/features/journal/hooks/useTradeJournalEntry.ts`, change the import:

```ts
import type { JournalEntry, TradeJournalEntry } from '@entities/journal-entry';
```

Update `UseTradeJournalEntryResult.entry` type:

```ts
export type UseTradeJournalEntryResult = {
  entry: TradeJournalEntry | null;
  // rest unchanged
  save: (entry: TradeJournalEntry) => Promise<void>;
  // remove unchanged
};
```

Update the `useQuery` generic:

```ts
const query = useQuery<TradeJournalEntry | null>({
```

Update the `saveMutation`'s `mutationFn` signature:

```ts
const saveMutation = useMutation({
  mutationFn: (entry: TradeJournalEntry) => repo.upsert(entry),
  // ...
});
```

And the `save` callback signature:

```ts
const save = useCallback(
  async (entry: TradeJournalEntry) => {
    await saveMutation.mutateAsync(entry);
  },
  [saveMutation],
);
```

`JournalEntry` is still imported because `repo.upsert` accepts the union — we're narrowing the hook-level API only.

- [ ] **Step 3.4: Update TradeJournalForm's commit payload type**

In `src/features/journal/components/TradeJournalForm.tsx`, find the `commit` function:

```ts
async function commit(next: DraftState) {
```

Change the inline `entry` constant's type from `JournalEntry` to `TradeJournalEntry`:

```ts
const entry: TradeJournalEntry = {
```

And update the import:

```ts
import type { JournalEntry, Mood, TradeJournalEntry } from '@entities/journal-entry';
```

(`JournalEntry` stays imported if the file references it elsewhere; remove if unused after this change.)

- [ ] **Step 3.5: Gauntlet + commit (Task 2 + Task 3 together)**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green. If `TradeJournalForm.tsx` has unused `JournalEntry` import, remove it.

```bash
git add src/entities/journal-entry.ts \
        src/lib/storage/db.ts \
        src/lib/storage/journal-entries-repo.ts \
        src/lib/storage/journal-entries-repo.test.ts \
        src/features/journal/hooks/useTradeJournalEntry.ts \
        src/features/journal/components/TradeJournalForm.tsx
git commit -m "$(cat <<'EOF'
feat(journal): extend JournalEntry to a discriminated union (trade | session)

TradeJournalEntry keeps the exact 7a shape; SessionJournalEntry adds
scope='session', YYYY-MM-DD date, and six trader-level fields
(marketConditions, summary, whatToRepeat, whatToAvoid, mindset enum,
disciplineScore 1-5).

Dexie v3 bumps additively — new date index on journalEntries, no
upgrade callback. Existing rows carry scope='trade' and match the
TradeJournalEntry variant without migration.

Repo extends with findByDate + listSessionEntries (narrowed return
types per variant). findByTradeId + listAllTradeIds tighten to filter
by scope='trade' so session rows can't leak into trade-side consumers.

useTradeJournalEntry and TradeJournalForm narrow their save payload
types to TradeJournalEntry; no behavior change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `useSessionJournalEntry` hook

Parallel to `useTradeJournalEntry`. Query key `['journal', 'session', date]`. Invalidates that key + `['journal', 'recent-sessions']` on save/remove.

**Files:**
- Create: `src/features/journal/hooks/useSessionJournalEntry.ts`
- Create: `src/features/journal/hooks/useSessionJournalEntry.test.tsx`
- Modify: `src/features/journal/index.ts`

- [ ] **Step 4.1: Write failing tests (RED)**

Create `src/features/journal/hooks/useSessionJournalEntry.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useSessionJournalEntry } from './useSessionJournalEntry';
import { HyperJournalDb } from '@lib/storage/db';
import type { SessionJournalEntry } from '@entities/journal-entry';

let db: HyperJournalDb;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  db = new HyperJournalDb(`hj-session-hook-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

function makeEntry(overrides: Partial<SessionJournalEntry> = {}): SessionJournalEntry {
  return {
    id: 's1',
    scope: 'session',
    date: '2026-04-22',
    createdAt: 100,
    updatedAt: 100,
    marketConditions: '',
    summary: '',
    whatToRepeat: '',
    whatToAvoid: '',
    mindset: null,
    disciplineScore: null,
    provenance: 'observed',
    ...overrides,
  };
}

describe('useSessionJournalEntry', () => {
  it('returns null when no entry exists for the date', async () => {
    const { result } = renderHook(() => useSessionJournalEntry('2026-04-22', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entry).toBeNull();
  });

  it('returns the entry when one exists', async () => {
    await db.journalEntries.put(makeEntry({ summary: 's' }));
    const { result } = renderHook(() => useSessionJournalEntry('2026-04-22', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entry?.summary).toBe('s');
  });

  it('save() upserts and refreshes the query', async () => {
    const { result } = renderHook(() => useSessionJournalEntry('2026-04-22', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.save(makeEntry({ summary: 'new' }));
    });
    await waitFor(() => expect(result.current.entry?.summary).toBe('new'));
  });
});
```

- [ ] **Step 4.2: Run — confirm RED**

```bash
pnpm test src/features/journal/hooks/useSessionJournalEntry.test.tsx
```

Expected: "Cannot find module './useSessionJournalEntry'".

- [ ] **Step 4.3: Implement `src/features/journal/hooks/useSessionJournalEntry.ts`**

```ts
import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createJournalEntriesRepo } from '@lib/storage/journal-entries-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { SessionJournalEntry } from '@entities/journal-entry';

type Options = { db?: HyperJournalDb };

export type UseSessionJournalEntryResult = {
  entry: SessionJournalEntry | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  save: (entry: SessionJournalEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

/**
 * Read/write the session journal entry for a given date (YYYY-MM-DD).
 * Mutations invalidate this query + the recent-sessions listing query
 * so the JournalPanel updates immediately.
 */
export function useSessionJournalEntry(
  date: string,
  options: Options = {},
): UseSessionJournalEntryResult {
  const db = options.db ?? defaultDb;
  const repo = useMemo(() => createJournalEntriesRepo(db), [db]);
  const queryClient = useQueryClient();

  const query = useQuery<SessionJournalEntry | null>({
    queryKey: ['journal', 'session', date],
    queryFn: () => repo.findByDate(date),
  });

  const saveMutation = useMutation({
    mutationFn: (entry: SessionJournalEntry) => repo.upsert(entry),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['journal', 'session', date] });
      await queryClient.invalidateQueries({ queryKey: ['journal', 'recent-sessions'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => repo.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['journal', 'session', date] });
      await queryClient.invalidateQueries({ queryKey: ['journal', 'recent-sessions'] });
    },
  });

  const save = useCallback(
    async (entry: SessionJournalEntry) => {
      await saveMutation.mutateAsync(entry);
    },
    [saveMutation],
  );

  const remove = useCallback(
    async (id: string) => {
      await removeMutation.mutateAsync(id);
    },
    [removeMutation],
  );

  return {
    entry: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    save,
    remove,
  };
}
```

- [ ] **Step 4.4: Export from feature index**

In `src/features/journal/index.ts`, add:

```ts
export { useSessionJournalEntry } from './hooks/useSessionJournalEntry';
```

- [ ] **Step 4.5: Run — confirm GREEN + gauntlet**

```bash
pnpm test src/features/journal/hooks/useSessionJournalEntry.test.tsx && pnpm typecheck && pnpm lint
```

Expected: 3 tests pass; typecheck + lint green.

- [ ] **Step 4.6: Commit**

```bash
git add src/features/journal/hooks/useSessionJournalEntry.ts \
        src/features/journal/hooks/useSessionJournalEntry.test.tsx \
        src/features/journal/index.ts
git commit -m "$(cat <<'EOF'
feat(journal): add useSessionJournalEntry hook

Parallel to useTradeJournalEntry but keyed on YYYY-MM-DD date.
Mutations invalidate both the per-date query and the
['journal', 'recent-sessions'] query so the JournalPanel listing
(Task 5) updates immediately after a save.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `useRecentSessionEntries` hook

For the `JournalPanel` listing.

**Files:**
- Create: `src/features/journal/hooks/useRecentSessionEntries.ts`
- Create: `src/features/journal/hooks/useRecentSessionEntries.test.tsx`
- Modify: `src/features/journal/index.ts`

- [ ] **Step 5.1: Write failing tests (RED)**

Create `src/features/journal/hooks/useRecentSessionEntries.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useRecentSessionEntries } from './useRecentSessionEntries';
import { HyperJournalDb } from '@lib/storage/db';

let db: HyperJournalDb;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  db = new HyperJournalDb(`hj-recent-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

describe('useRecentSessionEntries', () => {
  it('returns an empty array when no entries exist', async () => {
    const { result } = renderHook(() => useRecentSessionEntries({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries).toEqual([]);
  });

  it('returns session entries sorted by updatedAt desc', async () => {
    await db.journalEntries.put({
      id: 'old',
      scope: 'session',
      date: '2026-04-20',
      createdAt: 100,
      updatedAt: 100,
      marketConditions: '',
      summary: 'old',
      whatToRepeat: '',
      whatToAvoid: '',
      mindset: null,
      disciplineScore: null,
      provenance: 'observed',
    });
    await db.journalEntries.put({
      id: 'new',
      scope: 'session',
      date: '2026-04-22',
      createdAt: 200,
      updatedAt: 300,
      marketConditions: '',
      summary: 'new',
      whatToRepeat: '',
      whatToAvoid: '',
      mindset: null,
      disciplineScore: null,
      provenance: 'observed',
    });
    const { result } = renderHook(() => useRecentSessionEntries({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries[0]!.id).toBe('new');
  });
});
```

- [ ] **Step 5.2: Run — confirm RED**

```bash
pnpm test src/features/journal/hooks/useRecentSessionEntries.test.tsx
```

Expected: "Cannot find module './useRecentSessionEntries'".

- [ ] **Step 5.3: Implement `src/features/journal/hooks/useRecentSessionEntries.ts`**

```ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createJournalEntriesRepo } from '@lib/storage/journal-entries-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { SessionJournalEntry } from '@entities/journal-entry';

type Options = { db?: HyperJournalDb; limit?: number };

export type UseRecentSessionEntriesResult = {
  entries: ReadonlyArray<SessionJournalEntry>;
  isLoading: boolean;
};

const EMPTY_LIST: ReadonlyArray<SessionJournalEntry> = Object.freeze([]);

/**
 * Returns the most recent session journal entries (default 7). Used by
 * JournalPanel to list session journaling activity.
 */
export function useRecentSessionEntries(
  options: Options = {},
): UseRecentSessionEntriesResult {
  const db = options.db ?? defaultDb;
  const limit = options.limit ?? 7;
  const repo = useMemo(() => createJournalEntriesRepo(db), [db]);

  const query = useQuery<ReadonlyArray<SessionJournalEntry>>({
    queryKey: ['journal', 'recent-sessions', limit],
    queryFn: () => repo.listSessionEntries(limit),
  });

  return {
    entries: query.data ?? EMPTY_LIST,
    isLoading: query.isLoading,
  };
}
```

- [ ] **Step 5.4: Export from feature index**

In `src/features/journal/index.ts`, add:

```ts
export { useRecentSessionEntries } from './hooks/useRecentSessionEntries';
```

- [ ] **Step 5.5: Run — confirm GREEN + gauntlet**

```bash
pnpm test src/features/journal/hooks/useRecentSessionEntries.test.tsx && pnpm typecheck && pnpm lint
```

Expected: 2 tests pass; green.

- [ ] **Step 5.6: Commit**

```bash
git add src/features/journal/hooks/useRecentSessionEntries.ts \
        src/features/journal/hooks/useRecentSessionEntries.test.tsx \
        src/features/journal/index.ts
git commit -m "$(cat <<'EOF'
feat(journal): add useRecentSessionEntries hook for JournalPanel

Query key ['journal', 'recent-sessions', limit]; default limit 7.
Invalidated by useSessionJournalEntry save/remove. Returns a
stable frozen empty array when there's no data so the consumer's
.map() calls never reference undefined.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `SessionJournalForm` component

Six fields with autosave-on-blur. Same pattern as `TradeJournalForm` from Session 7a (draftRef, hydration guard, form-level status, `isDraftEmpty` short-circuit).

**Files:**
- Create: `src/features/journal/components/SessionJournalForm.tsx`
- Create: `src/features/journal/components/SessionJournalForm.test.tsx`
- Modify: `src/features/journal/index.ts`

- [ ] **Step 6.1: Write failing tests (RED)**

Create `src/features/journal/components/SessionJournalForm.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionJournalForm } from './SessionJournalForm';
import { HyperJournalDb } from '@lib/storage/db';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`hj-session-form-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

function renderForm(date = '2026-04-22') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionJournalForm date={date} db={db} />
    </QueryClientProvider>,
  );
}

describe('SessionJournalForm', () => {
  it('renders the six fields', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/market conditions/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/summary/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/what to repeat/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/what to avoid/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mindset/i)).toBeInTheDocument();
    expect(screen.getByText(/discipline score/i)).toBeInTheDocument();
  });

  it('pre-populates from an existing entry', async () => {
    await db.journalEntries.put({
      id: 's1',
      scope: 'session',
      date: '2026-04-22',
      createdAt: 100,
      updatedAt: 100,
      marketConditions: 'choppy',
      summary: '',
      whatToRepeat: '',
      whatToAvoid: '',
      mindset: 'focused',
      disciplineScore: 4,
      provenance: 'observed',
    });
    renderForm();
    await waitFor(() => {
      expect(screen.getByLabelText(/market conditions/i)).toHaveValue('choppy');
    });
    expect(screen.getByLabelText(/mindset/i)).toHaveValue('focused');
    expect(screen.getByRole('radio', { name: /^4$/ })).toBeChecked();
  });

  it('saves on blur and shows the saved indicator', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/market conditions/i)).toBeInTheDocument());
    const field = screen.getByLabelText(/market conditions/i);
    fireEvent.change(field, { target: { value: 'trending' } });
    fireEvent.blur(field);
    await waitFor(() => expect(screen.getByText(/saved at/i)).toBeInTheDocument());
    const rows = await db.journalEntries.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      scope: 'session',
      date: '2026-04-22',
      marketConditions: 'trending',
    });
  });

  it('empty-form blur does NOT create a row', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/market conditions/i)).toBeInTheDocument());
    fireEvent.blur(screen.getByLabelText(/market conditions/i));
    await new Promise((r) => setTimeout(r, 50));
    expect(await db.journalEntries.count()).toBe(0);
  });

  it('changing mindset + blurring saves', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/mindset/i)).toBeInTheDocument());
    const mindset = screen.getByLabelText(/mindset/i) as HTMLSelectElement;
    fireEvent.change(mindset, { target: { value: 'tilted' } });
    fireEvent.blur(mindset);
    await waitFor(async () => {
      const rows = await db.journalEntries.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]!).toMatchObject({ mindset: 'tilted' });
    });
  });

  it('selecting a discipline score + blurring saves', async () => {
    renderForm();
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /^3$/ })).toBeInTheDocument(),
    );
    const three = screen.getByRole('radio', { name: /^3$/ });
    fireEvent.click(three);
    fireEvent.blur(three);
    await waitFor(async () => {
      const rows = await db.journalEntries.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]!).toMatchObject({ disciplineScore: 3 });
    });
  });
});
```

- [ ] **Step 6.2: Run — confirm RED**

```bash
pnpm test src/features/journal/components/SessionJournalForm.test.tsx
```

Expected: "Cannot find module './SessionJournalForm'".

- [ ] **Step 6.3: Implement `src/features/journal/components/SessionJournalForm.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useSessionJournalEntry } from '../hooks/useSessionJournalEntry';
import { Label } from '@lib/ui/components/label';
import { cn } from '@lib/ui/utils';
import type { Mindset, SessionJournalEntry } from '@entities/journal-entry';
import type { HyperJournalDb } from '@lib/storage/db';

type Props = {
  date: string;
  db?: HyperJournalDb;
};

type DraftState = {
  marketConditions: string;
  summary: string;
  whatToRepeat: string;
  whatToAvoid: string;
  mindset: Mindset | null;
  disciplineScore: number | null;
};

type Status =
  | { kind: 'clean' }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string };

const EMPTY_DRAFT: DraftState = {
  marketConditions: '',
  summary: '',
  whatToRepeat: '',
  whatToAvoid: '',
  mindset: null,
  disciplineScore: null,
};

const MINDSET_OPTIONS: ReadonlyArray<{ value: Mindset | ''; label: string }> = [
  { value: '', label: '— unset' },
  { value: 'focused', label: 'Focused' },
  { value: 'scattered', label: 'Scattered' },
  { value: 'reactive', label: 'Reactive' },
  { value: 'patient', label: 'Patient' },
  { value: 'tilted', label: 'Tilted' },
];

function isDraftEmpty(d: DraftState): boolean {
  return (
    d.marketConditions.trim() === '' &&
    d.summary.trim() === '' &&
    d.whatToRepeat.trim() === '' &&
    d.whatToAvoid.trim() === '' &&
    d.mindset === null &&
    d.disciplineScore === null
  );
}

function entryToDraft(entry: SessionJournalEntry | null): DraftState {
  if (!entry) return { ...EMPTY_DRAFT };
  return {
    marketConditions: entry.marketConditions,
    summary: entry.summary,
    whatToRepeat: entry.whatToRepeat,
    whatToAvoid: entry.whatToAvoid,
    mindset: entry.mindset,
    disciplineScore: entry.disciplineScore,
  };
}

function formatSavedAt(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SessionJournalForm({ date, db }: Props) {
  const hook = useSessionJournalEntry(date, db ? { db } : {});
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [status, setStatus] = useState<Status>({ kind: 'clean' });
  const [hydrated, setHydrated] = useState(false);

  const draftRef = useRef<DraftState>(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (!hydrated && !hook.isLoading) {
      if (hook.entry) {
        const next = entryToDraft(hook.entry);
        setDraft(next);
        draftRef.current = next;
      }
      setHydrated(true);
    }
  }, [hook.entry, hook.isLoading, hydrated]);

  async function commit(next: DraftState) {
    if (isDraftEmpty(next) && !hook.entry) return;
    setStatus({ kind: 'saving' });
    const now = Date.now();
    const entry: SessionJournalEntry = {
      id: hook.entry?.id ?? crypto.randomUUID(),
      scope: 'session',
      date,
      createdAt: hook.entry?.createdAt ?? now,
      updatedAt: now,
      marketConditions: next.marketConditions,
      summary: next.summary,
      whatToRepeat: next.whatToRepeat,
      whatToAvoid: next.whatToAvoid,
      mindset: next.mindset,
      disciplineScore: next.disciplineScore,
      provenance: 'observed',
    };
    try {
      await hook.save(entry);
      setStatus({ kind: 'saved', at: now });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : "Couldn't save your notes.",
      });
    }
  }

  function change<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    const next = { ...draftRef.current, [key]: value };
    draftRef.current = next;
    setDraft(next);
    setStatus({ kind: 'dirty' });
  }

  function onBlurCommit() {
    void commit(draftRef.current);
  }

  return (
    <section
      aria-labelledby="session-journal-heading"
      className="flex flex-col gap-4 rounded-lg border border-border bg-bg-raised p-6"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="session-journal-heading" className="text-lg font-semibold text-fg-base">
          Journal
        </h2>
        <StatusIndicator status={status} onRetry={onBlurCommit} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="marketConditions">Market conditions</Label>
        <textarea
          id="marketConditions"
          value={draft.marketConditions}
          onChange={(e) => change('marketConditions', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="Choppy, trending, news-driven..."
          rows={2}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="summary">Summary of the day</Label>
        <textarea
          id="summary"
          value={draft.summary}
          onChange={(e) => change('summary', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="What happened, what you did, what you got wrong."
          rows={4}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="whatToRepeat">What to repeat</Label>
        <textarea
          id="whatToRepeat"
          value={draft.whatToRepeat}
          onChange={(e) => change('whatToRepeat', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="What worked that you want to do again."
          rows={2}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="whatToAvoid">What to avoid</Label>
        <textarea
          id="whatToAvoid"
          value={draft.whatToAvoid}
          onChange={(e) => change('whatToAvoid', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="What you did that you want to stop doing."
          rows={2}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="mindset">Mindset</Label>
        <select
          id="mindset"
          value={draft.mindset ?? ''}
          onChange={(e) =>
            change('mindset', e.target.value === '' ? null : (e.target.value as Mindset))
          }
          onBlur={onBlurCommit}
          className={cn(
            'h-10 rounded-md border border-border bg-bg-overlay px-3 text-sm text-fg-base',
            'ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          )}
        >
          {MINDSET_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-fg-base">Discipline score</legend>
        <div className="flex flex-wrap gap-3 text-sm text-fg-base">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              htmlFor={`disciplineScore-${n}`}
              className="flex cursor-pointer items-center gap-2"
            >
              <input
                id={`disciplineScore-${n}`}
                name="disciplineScore"
                type="radio"
                checked={draft.disciplineScore === n}
                onChange={() => change('disciplineScore', n)}
                onBlur={onBlurCommit}
                className="h-4 w-4 border-border bg-bg-overlay text-accent ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              />
              <span>{n}</span>
            </label>
          ))}
          <label
            htmlFor="disciplineScore-unanswered"
            className="flex cursor-pointer items-center gap-2"
          >
            <input
              id="disciplineScore-unanswered"
              name="disciplineScore"
              type="radio"
              checked={draft.disciplineScore === null}
              onChange={() => change('disciplineScore', null)}
              onBlur={onBlurCommit}
              className="h-4 w-4 border-border bg-bg-overlay text-accent ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            />
            <span>Unanswered</span>
          </label>
        </div>
      </fieldset>
    </section>
  );
}

const textareaClass = cn(
  'w-full rounded-md border border-border bg-bg-overlay px-3 py-2 text-sm text-fg-base',
  'placeholder:text-fg-subtle',
  'ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
  'resize-y',
);

function StatusIndicator({
  status,
  onRetry,
}: {
  status: Status;
  onRetry: () => void;
}) {
  if (status.kind === 'clean') return null;
  if (status.kind === 'dirty') {
    return <span className="text-xs text-fg-muted">Unsaved changes</span>;
  }
  if (status.kind === 'saving') {
    return <span className="text-xs text-fg-muted">Saving…</span>;
  }
  if (status.kind === 'saved') {
    return (
      <span className="text-xs text-fg-muted">Saved at {formatSavedAt(status.at)}</span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs text-loss">
      {status.message}
      <button
        type="button"
        onClick={onRetry}
        className="underline ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        Retry
      </button>
    </span>
  );
}
```

- [ ] **Step 6.4: Export from feature index**

```ts
export { SessionJournalForm } from './components/SessionJournalForm';
```

- [ ] **Step 6.5: Run — confirm GREEN + gauntlet**

```bash
pnpm test src/features/journal/components/SessionJournalForm.test.tsx && pnpm typecheck && pnpm lint
```

Expected: 6 tests pass; green.

- [ ] **Step 6.6: Commit**

```bash
git add src/features/journal/components/SessionJournalForm.tsx \
        src/features/journal/components/SessionJournalForm.test.tsx \
        src/features/journal/index.ts
git commit -m "$(cat <<'EOF'
feat(journal): SessionJournalForm with autosave-on-blur

Six fields per spec: four textareas (marketConditions, summary,
whatToRepeat, whatToAvoid), mindset select (5 enum values + unset),
and an inline six-radio group for disciplineScore (1-5 + Unanswered).
Inherits the draftRef / hydration-guard / isDraftEmpty / form-level
status pattern from TradeJournalForm. Same "Saved at HH:MM" chip on
success; loss-tone + Retry on failure.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `/d/:date` route + `DayDetail` page

**Files:**
- Create: `src/app/DayDetail.tsx`
- Create: `src/app/DayDetail.test.tsx`
- Modify: `src/app/routes.tsx`

- [ ] **Step 7.1: Write failing tests (RED)**

Create `src/app/DayDetail.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DayDetail } from './DayDetail';

afterEach(() => cleanup());

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<div data-testid="home">home</div>} />
          <Route path="/d/:date" element={<DayDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DayDetail', () => {
  it('redirects to / when the date is invalid', async () => {
    renderAt('/d/not-a-date');
    await waitFor(() => expect(screen.getByTestId('home')).toBeInTheDocument());
  });

  it('redirects to / when the date is impossible', async () => {
    renderAt('/d/2025-02-30');
    await waitFor(() => expect(screen.getByTestId('home')).toBeInTheDocument());
  });

  it('renders the date header and SessionJournalForm for a valid date', async () => {
    renderAt('/d/2026-04-22');
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument(),
    );
    // The heading contains the formatted date; match by year at least.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/2026/);
    // Journal form is present
    expect(screen.getByRole('heading', { level: 2, name: /^journal$/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 7.2: Run — confirm RED**

```bash
pnpm test src/app/DayDetail.test.tsx
```

Expected: "Cannot find module './DayDetail'".

- [ ] **Step 7.3: Implement `src/app/DayDetail.tsx`**

```tsx
import { useParams, Navigate, Link } from 'react-router-dom';
import { isValidDateString } from '@domain/dates/isValidDateString';
import { SessionJournalForm } from '@features/journal';

export function DayDetail() {
  const { date } = useParams<{ date: string }>();

  if (!date || !isValidDateString(date)) {
    return <Navigate to="/" replace />;
  }

  return <DayDetailInner date={date} />;
}

function DayDetailInner({ date }: { date: string }) {
  const formatted = formatLongDate(date);
  return (
    <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-fg-base">{formatted}</h1>
        <div className="flex items-center gap-2">
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

      <SessionJournalForm date={date} />
    </main>
  );
}

/**
 * "2026-04-22" → "Monday, April 22, 2026" (user locale). Uses
 * Date.UTC to avoid timezone drift — the route date is UTC-anchored.
 */
function formatLongDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d));
  return utc.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
```

- [ ] **Step 7.4: Register the route**

In `src/app/routes.tsx`, add after `/w/:address/t/:tradeId`:

```tsx
import { DayDetail } from './DayDetail';

// ...in the routes array:
    { path: '/w/:address/t/:tradeId', element: <TradeDetail /> },
    { path: '/d/:date', element: <DayDetail /> },
    { path: '/settings', element: <Settings /> },
```

- [ ] **Step 7.5: Run — confirm GREEN + gauntlet**

```bash
pnpm test src/app/DayDetail.test.tsx && pnpm typecheck && pnpm lint
```

Expected: 3 tests pass; green.

- [ ] **Step 7.6: Commit**

```bash
git add src/app/DayDetail.tsx src/app/DayDetail.test.tsx src/app/routes.tsx
git commit -m "$(cat <<'EOF'
feat(app): add /d/:date route with DayDetail page

Header carries the formatted long-form date (user locale, UTC-anchored),
Settings link, and Back link to /. SessionJournalForm mounts below.
Invalid dates and impossible calendar dates (2025-02-30, 2025-13-01)
redirect to /.

Route sits outside the /w/:address tree because session journals are
trader-level, not wallet-scoped, per plan §11.8.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `JournalPanel` becomes real

Replace the Session 1 stub with a real list + "Today's journal" CTA.

**Files:**
- Modify: `src/features/journal/components/JournalPanel.tsx`
- Create: `src/features/journal/components/JournalPanel.test.tsx`

- [ ] **Step 8.1: Write failing tests (RED)**

Create `src/features/journal/components/JournalPanel.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JournalPanel } from './JournalPanel';
import { HyperJournalDb } from '@lib/storage/db';

afterEach(() => cleanup());

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`hj-panel-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

function renderPanel(now = Date.UTC(2026, 3, 22, 12)) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <JournalPanel db={db} now={now} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('JournalPanel', () => {
  it('renders the Journal heading', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: /journal/i })).toBeInTheDocument();
  });

  it('renders the Today\'s journal CTA linking to /d/<today>', () => {
    renderPanel(Date.UTC(2026, 3, 22, 12));
    const cta = screen.getByRole('link', { name: /today'?s journal/i });
    expect(cta).toHaveAttribute('href', '/d/2026-04-22');
  });

  it('shows an empty state when there are no session entries', async () => {
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText(/no session journal yet/i)).toBeInTheDocument(),
    );
  });

  it('lists recent session entries with dates and teasers', async () => {
    await db.journalEntries.put({
      id: 's1',
      scope: 'session',
      date: '2026-04-20',
      createdAt: 100,
      updatedAt: 100,
      marketConditions: 'choppy',
      summary: 'short teaser',
      whatToRepeat: '',
      whatToAvoid: '',
      mindset: null,
      disciplineScore: null,
      provenance: 'observed',
    });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/short teaser/i)).toBeInTheDocument();
    });
    const link = screen.getByRole('link', { name: /short teaser/i });
    expect(link).toHaveAttribute('href', '/d/2026-04-20');
  });
});
```

- [ ] **Step 8.2: Run — confirm RED**

```bash
pnpm test src/features/journal/components/JournalPanel.test.tsx
```

Expected: the existing `JournalPanel` renders "No entries yet" but has no CTA, no list, no db/now props — tests fail.

- [ ] **Step 8.3: Rewrite `src/features/journal/components/JournalPanel.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { useRecentSessionEntries } from '../hooks/useRecentSessionEntries';
import { todayUtcDateString } from '@domain/dates/todayUtcDateString';
import { Button } from '@lib/ui/components/button';
import type { HyperJournalDb } from '@lib/storage/db';
import type { SessionJournalEntry } from '@entities/journal-entry';

type Props = {
  db?: HyperJournalDb;
  /** Injectable clock for tests; defaults to Date.now() at render time. */
  now?: number;
};

export function JournalPanel({ db, now }: Props) {
  const today = todayUtcDateString(now ?? Date.now());
  const { entries, isLoading } = useRecentSessionEntries(db ? { db } : {});

  return (
    <section
      aria-labelledby="journal-panel-heading"
      className="flex h-full flex-col gap-4 rounded-lg border border-border bg-bg-raised p-6"
    >
      <header className="flex items-center justify-between gap-4">
        <h2 id="journal-panel-heading" className="text-lg font-semibold text-fg-base">
          Journal
        </h2>
        <Link to={`/d/${today}`}>
          <Button variant="default" size="sm">
            + Today's journal
          </Button>
        </Link>
      </header>

      {isLoading ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-fg-subtle">No session journal yet. Start with today's.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <li key={e.id}>
              <Link
                to={`/d/${e.date}`}
                className="flex flex-col gap-1 rounded-md border border-border bg-bg-overlay p-3 text-sm ring-offset-bg-base hover:bg-bg-overlay/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                <span className="text-xs font-medium uppercase tracking-wider text-fg-muted">
                  {formatShortDate(e.date)}
                </span>
                <span className="line-clamp-1 text-fg-base">{teaser(e)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatShortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d));
  return utc.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function teaser(entry: SessionJournalEntry): string {
  const priority = [
    entry.summary,
    entry.marketConditions,
    entry.whatToRepeat,
    entry.whatToAvoid,
  ];
  for (const field of priority) {
    const first = field.split('\n')[0]?.trim();
    if (first) {
      return first.length > 60 ? `${first.slice(0, 59)}…` : first;
    }
  }
  return 'Mindset / discipline only';
}
```

- [ ] **Step 8.4: Run — confirm GREEN + gauntlet**

```bash
pnpm test src/features/journal/components/JournalPanel.test.tsx && pnpm typecheck && pnpm lint && pnpm test
```

Expected: green.

- [ ] **Step 8.5: Commit**

```bash
git add src/features/journal/components/JournalPanel.tsx \
        src/features/journal/components/JournalPanel.test.tsx
git commit -m "$(cat <<'EOF'
feat(journal): rewrite JournalPanel with real listing + Today CTA

Replaces the Session 1 stub. Shows a "+ Today's journal" button linking
to /d/<today> (UTC), plus up to 7 most-recent session entries (from
useRecentSessionEntries). Each row renders the short-form date and a
teaser — first non-empty field's first line, truncated to 60 chars.
Empty state: "No session journal yet. Start with today's."

Injectable `now` prop for deterministic tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Zod discriminated union + schema tests

**Files:**
- Modify: `src/lib/validation/export.ts`
- Modify: `src/lib/validation/export.test.ts`

- [ ] **Step 9.1: Rewrite the journal-entry schema**

In `src/lib/validation/export.ts`, find the existing `MoodSchema` and `JournalEntrySchema`. Replace them with:

```ts
const MoodSchema = z
  .enum(['calm', 'confident', 'anxious', 'greedy', 'regretful'])
  .nullable();

const MindsetSchema = z
  .enum(['focused', 'scattered', 'reactive', 'patient', 'tilted'])
  .nullable();

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

const JournalEntrySchema = z.discriminatedUnion('scope', [
  TradeJournalEntrySchema,
  SessionJournalEntrySchema,
]);
```

Leave the rest of the file (ExportDataSchema etc.) unchanged — the reference to `JournalEntrySchema` still resolves.

- [ ] **Step 9.2: Extend the validation test file**

In `src/lib/validation/export.test.ts`, append cases to the `describe('ExportFileSchema', ...)` block:

```ts
  it('parses a file with a session journalEntries row', () => {
    const out = ExportFileSchema.parse({
      ...validFile,
      data: {
        ...validFile.data,
        journalEntries: [
          {
            id: 's1',
            scope: 'session',
            date: '2026-04-22',
            createdAt: 1,
            updatedAt: 1,
            marketConditions: '',
            summary: 's',
            whatToRepeat: '',
            whatToAvoid: '',
            mindset: 'focused',
            disciplineScore: 4,
            provenance: 'observed',
          },
        ],
      },
    });
    expect(out.data.journalEntries).toHaveLength(1);
    expect(out.data.journalEntries![0]!.scope).toBe('session');
  });

  it('rejects a session entry missing the date field', () => {
    expect(() =>
      ExportFileSchema.parse({
        ...validFile,
        data: {
          ...validFile.data,
          journalEntries: [
            {
              id: 's1',
              scope: 'session',
              // no date
              createdAt: 1,
              updatedAt: 1,
              marketConditions: '',
              summary: '',
              whatToRepeat: '',
              whatToAvoid: '',
              mindset: null,
              disciplineScore: null,
              provenance: 'observed',
            },
          ],
        },
      }),
    ).toThrow();
  });

  it('rejects a disciplineScore of 6 (out of 1-5 range)', () => {
    expect(() =>
      ExportFileSchema.parse({
        ...validFile,
        data: {
          ...validFile.data,
          journalEntries: [
            {
              id: 's1',
              scope: 'session',
              date: '2026-04-22',
              createdAt: 1,
              updatedAt: 1,
              marketConditions: '',
              summary: '',
              whatToRepeat: '',
              whatToAvoid: '',
              mindset: null,
              disciplineScore: 6,
              provenance: 'observed',
            },
          ],
        },
      }),
    ).toThrow();
  });
```

- [ ] **Step 9.3: Run — confirm GREEN + gauntlet**

```bash
pnpm test src/lib/validation/export.test.ts && pnpm typecheck && pnpm lint
```

Expected: green. Previous tests (the `rejects a journalEntries row with an invalid scope` case) still pass — discriminatedUnion rejects `scope: 'weird'` because it matches neither literal.

- [ ] **Step 9.4: Commit**

```bash
git add src/lib/validation/export.ts src/lib/validation/export.test.ts
git commit -m "$(cat <<'EOF'
feat(validation): migrate JournalEntrySchema to a discriminated union

TradeJournalEntrySchema + SessionJournalEntrySchema composed via
z.discriminatedUnion('scope', [...]). The existing trade shape is
unchanged; the session variant requires date (YYYY-MM-DD),
marketConditions/summary/whatToRepeat/whatToAvoid strings, a MindsetSchema
enum (null permitted), and disciplineScore bounded to int [1,5] or null.

No formatVersion bump — adding a new discriminated-union branch is
additive per CONVENTIONS §13. The one-way _schemaCheck continues to
hold because the union on the Zod side matches the union on the entity
side.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Playwright E2E — session round-trip

**Files:**
- Create: `e2e/session-journal-roundtrip.spec.ts`

- [ ] **Step 10.1: Write the test**

Create `e2e/session-journal-roundtrip.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { mockHyperliquid } from './fixtures/hyperliquid-route';

test.describe('session journal round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await mockHyperliquid(page);
  });

  test('click "today\'s journal", type, blur, reload, persist', async ({ page }) => {
    await page.goto('/');

    // 1. Click "Today's journal" CTA on the JournalPanel.
    const cta = page.getByRole('link', { name: /today'?s journal/i });
    await cta.click();

    // 2. Land on /d/:date.
    await expect(page).toHaveURL(/\/d\/\d{4}-\d{2}-\d{2}$/);
    await expect(page.getByRole('heading', { name: /^journal$/i })).toBeVisible();

    // 3. Type into summary + blur.
    const summary = page.getByLabel(/summary of the day/i);
    await summary.fill('E2E session test entry');
    await summary.blur();
    await expect(page.getByText(/saved at/i)).toBeVisible();

    // 4. Reload the page.
    await page.reload();

    // 5. Content persists.
    await expect(page.getByLabel(/summary of the day/i)).toHaveValue('E2E session test entry');
  });

  test('session entry appears in the JournalPanel list after saving', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /today'?s journal/i }).click();

    await page.getByLabel(/summary of the day/i).fill('panel-listing teaser');
    await page.getByLabel(/summary of the day/i).blur();
    await expect(page.getByText(/saved at/i)).toBeVisible();

    // Back to /.
    await page.getByRole('link', { name: /back/i }).click();
    await expect(page).toHaveURL(/\/$/);

    // Entry appears in the list.
    await expect(page.getByText(/panel-listing teaser/i)).toBeVisible();
  });
});
```

- [ ] **Step 10.2: Run the test**

```bash
pnpm test:e2e e2e/session-journal-roundtrip.spec.ts
```

Expected: 2 tests pass.

- [ ] **Step 10.3: Commit**

```bash
git add e2e/session-journal-roundtrip.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): add session-journal round-trip

Two tests: (1) click Today's journal CTA → land on /d/<today> →
type into summary → blur → reload → content persists. (2) after
saving, the entry appears in the JournalPanel listing on /.

Exercises the full JournalPanel → DayDetail route → SessionJournalForm
→ useRecentSessionEntries invalidation chain end-to-end.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Close-out docs

**Files:**
- Modify: `docs/SESSION_LOG.md`
- Modify: `docs/BACKLOG.md`
- Modify: `docs/CONVENTIONS.md`

- [ ] **Step 11.1: Append Session 7b entry to SESSION_LOG.md**

Append at the end of the file, before the trailing `---`:

```markdown

## 2026-04-22 — Phase 1 Session 7b: Session/day journal

**Session goal:** Extend journaling to the session/day scope. One entry per UTC date, wallet-agnostic. New /d/:date route. JournalPanel becomes real.

**Done:**

- `src/entities/journal-entry.ts`: extended to discriminated union. `TradeJournalEntry` (7a shape, unchanged semantics) + `SessionJournalEntry` (scope='session', date YYYY-MM-DD UTC, six trader-level fields: marketConditions / summary / whatToRepeat / whatToAvoid / mindset enum / disciplineScore 1-5). New `Mindset` type.
- Dexie schema v3 (additive): new `date` index on the existing `journalEntries` table. No `.upgrade()` — rows keep their `scope: 'trade'` and match the trade variant cleanly.
- `isValidDateString` + `todayUtcDateString` pure helpers in `src/domain/dates/`. Branded `YYYYMMDD` type narrows at the boundary. [+7 tests]
- Repo extensions: `findByDate`, `listSessionEntries`. `findByTradeId` narrows to `TradeJournalEntry | null`; `listAllTradeIds` filters by scope='trade'. [+5 tests]
- `useSessionJournalEntry(date)` hook — parallel to useTradeJournalEntry, keyed on date. [+3 tests]
- `useRecentSessionEntries({ limit })` hook — for the JournalPanel listing. [+2 tests]
- `SessionJournalForm` — six fields with autosave-on-blur, draftRef, hydration guard, isDraftEmpty short-circuit, form-level status + "Saved at HH:MM" chip. Inline 6-radio disciplineScore group. [+6 tests]
- `/d/:date` route with `DayDetail.tsx` — header with long-form UTC date + Settings + Back links, SessionJournalForm below. Invalid or impossible dates redirect to /. [+3 tests]
- `JournalPanel` rewrite — "Today's journal" CTA linking to /d/<today-UTC>, list of up to 7 recent session entries (each linking to /d/:date), empty state, injectable `now` for deterministic tests. Replaces the Session 1 stub. [+4 tests]
- Zod `JournalEntrySchema` → `z.discriminatedUnion('scope', [TradeJournalEntrySchema, SessionJournalEntrySchema])`. MindsetSchema enum added. disciplineScore bounded `1..5 | null`. [+3 validation cases]
- Playwright: `e2e/session-journal-roundtrip.spec.ts` — two tests covering type→blur→reload persistence and JournalPanel listing-after-save. [+2 E2E tests]
- End state: **280 unit tests across 44 files** (was 256/40 after Session 7a; +24 this session), **7 E2E tests** passing. Gauntlet clean.

**Decisions made:** none (no new ADRs).

**Deferred / not done:**

- Strategy/setup journal scope + tags — Session 7c.
- Screenshots/images — Session 7d.
- Calendar-cell click → day detail navigation — BACKLOG.
- Cross-wallet PnL summary on DayDetail — BACKLOG (needs "which wallets" design).
- Per-wallet session entries — BACKLOG (additive via `walletAddress?` field).
- Multi-entry per date — BACKLOG.

**Gotchas for next session:**

- `JournalEntry` is now a discriminated union. Anywhere code accesses variant-specific fields (tradeId, date, etc.), narrow on `scope` first or use the narrowed return types from the repo (findByTradeId → TradeJournalEntry, findByDate → SessionJournalEntry).
- `listAllTradeIds` uses `where('scope').equals('trade')` — make sure Session 7c's strategy scope doesn't accidentally leak into this set.
- `listSessionEntries` does its own in-memory sort because Dexie's `.where('scope').equals('session').reverse()` plus `.sortBy('updatedAt')` is awkward to compose with the scope filter. Fine for Phase 1 data volumes.
- The `/d/:date` route is wallet-agnostic. Sessions 7c+ adding a strategy scope should either sit under `/s/:strategy` or be hosted within a Strategies page — do not nest it under `/w/:address`.
- `JournalPanel.now` prop is for tests only. Production passes `undefined` and the component uses `Date.now()` at render. Midnight UTC rollover while the tab is open shifts "today" on next render.
- `SessionJournalForm` and `TradeJournalForm` share the autosave-on-blur pattern but don't share implementation. Extracting a shared hook is BACKLOG polish; don't do it until a third scope (strategy) forces the extraction.
- Dexie v3 is a one-way bump; v2 → v3 upgrades silently on first open.

**Invariants assumed:**

- One session entry per date (scope='session'). Multi-entry is not supported in Session 7b.
- Session entry IDs are UUID v4 from `crypto.randomUUID()`, stable across reloads because the mutation reuses `hook.entry.id`.
- Dates in the entity + schema + routes are UTC-anchored YYYY-MM-DD strings. Local-timezone mode is a separate BACKLOG item.
- `TradeJournalEntry` shape is bit-for-bit identical to 7a's `JournalEntry` shape — pre-existing Dexie rows match without migration.
- The `_schemaCheck` in lib/validation/export.ts still holds one-way: the Zod discriminated union's inferred shape is assignable to the entity union.

---
```

- [ ] **Step 11.2: Append Session 7b entries to BACKLOG.md**

At the end of the file:

```markdown

---

## Session 7b deferrals

- `[next]` Strategy/setup journal scope + tags — Session 7c. Extends JournalEntry discriminator to `'strategy'`. Introduces the cross-cutting tags concept for linking trades/sessions to strategy names.
- `[next]` Screenshots/images — Session 7d. IndexedDB blob storage + thumbnail generation + quota handling.
- `[maybe]` Calendar-cell click navigates to /d/:date. ECharts `page.route` analog — custom click event on a calendar cell, mapping the cell's data to YYYY-MM-DD, navigating to the route. Narrow work but fiddly wiring.
- `[maybe]` Cross-wallet PnL summary on the DayDetail page. Requires a "which wallets" design — all saved wallets? Most-recent viewed? An explicit picker? Out of scope until Phase 2 filter panel is clearer.
- `[maybe]` Per-wallet session entries. Optional `walletAddress: string | null` field on SessionJournalEntry. Additive; only ship if users report wanting per-wallet day reflections.
- `[maybe]` Multi-entry per date. Morning-session + afternoon-session journaling. Extend `findByDate` to return an array; update the SessionJournalForm into a list + "New entry" CTA.
- `[maybe]` Full-history listing for session entries. JournalPanel shows last 7; a dedicated /journal/history route could show all with filters.
- `[maybe]` JournalPanel filtering by mindset / date range / has-content. Small but useful once users have tens of entries.
- `[maybe]` Local-timezone mode for session date keys. Today UTC is used across the app (calendar, session journal, export). A single toggle + corresponding `todayLocalDateString` helper would flip it.
- `[maybe]` Shared autosave-on-blur hook. TradeJournalForm and SessionJournalForm implement the same pattern independently. Extract when Session 7c adds a third form — three is the trigger for DRY.
```

- [ ] **Step 11.3: Amend CONVENTIONS.md §15**

Open `docs/CONVENTIONS.md` and find the `## 15. Journaling` section. Amend the existing bullets and append these new ones at the end of the section:

```markdown
- **Discriminated union on scope.** `JournalEntry` is a union of variants discriminated on `scope`. Session 7a introduced `'trade'`; 7b adds `'session'`; 7c will add `'strategy'`. Consumers narrow on `scope` to access variant-specific fields. Repo methods return narrowed types (e.g., `findByTradeId: Promise<TradeJournalEntry | null>`) so most call sites avoid their own type guards.
- **Wallet-agnostic session journals.** Session-scope entries live outside `/w/:address/...` because the fields (mindset, discipline, mistakes) describe the trader, not a wallet. Route lives at `/d/:date`. If a future need for per-wallet session notes surfaces, add an optional `walletAddress` field rather than moving the route under the wallet tree.
- **UTC date anchors.** Session entries key on `date: YYYY-MM-DD` in UTC. `isValidDateString` + `todayUtcDateString` in `@domain/dates/*` are the only two places that produce or validate these strings. Local-timezone mode is a BACKLOG item; do not sprinkle local-date logic across the codebase.
- **Dexie additive migrations.** Adding a table in v2 or a new index in v3 is additive — keep the previous version's `.stores({...})` declaration in place, add a new `.version(N).stores({...})`, and skip the `.upgrade()` callback when no existing row needs transforming.
- **Parallel form implementations, shared pattern.** `TradeJournalForm` and `SessionJournalForm` share the autosave-on-blur pattern (draftRef, hydration guard, isDraftEmpty, form-level status). They do NOT share implementation; extract when a third scope joins (Session 7c).
```

- [ ] **Step 11.4: Final full gauntlet**

```bash
pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build && pnpm test:e2e
```

Expected: all green. Domain coverage ≥ 90%.

- [ ] **Step 11.5: Commit**

```bash
git add docs/SESSION_LOG.md docs/BACKLOG.md docs/CONVENTIONS.md
git commit -m "$(cat <<'EOF'
docs: record Session 7b session log, backlog, conventions

Captures the session/day journal session: JournalEntry extended to
a discriminated union (trade | session), Dexie v3 additive migration,
isValidDateString + todayUtcDateString domain helpers, repo +
hooks + SessionJournalForm + DayDetail route, JournalPanel rewrite,
Zod discriminated-union migration, Playwright session round-trip.

Amends CONVENTIONS §15 with five new sub-rules covering the
discriminated-union pattern, wallet-agnostic session scoping,
UTC date anchoring, Dexie additive migrations, and parallel form
implementations. Files 10 Session 7b BACKLOG entries, none of
which block v1 acceptance.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 11.6: Verify clean state**

```bash
git status && git log --oneline 2897a2a..HEAD
```

Expected: working tree clean; Session 7b commits in sequence.

---

## Success criteria (copy from spec §Acceptance)

1. `/d/:date` route renders the long-form date header + SessionJournalForm. Invalid / impossible dates redirect to `/`.
2. Typing in any field + blur persists to Dexie. Reload preserves. Empty-form blur does NOT create a row.
3. `JournalPanel` on `/` shows "+ Today's journal" CTA + up to 7 recent entries, each linking to `/d/:date`.
4. Export includes session entries when present; import restores them into a fresh browser context.
5. `pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build` green. Domain coverage ≥ 90%.
6. `pnpm test:e2e` — new session round-trip + all existing specs pass.
7. SESSION_LOG, BACKLOG, CONVENTIONS updated.
