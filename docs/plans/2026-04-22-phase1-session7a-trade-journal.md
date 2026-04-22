# Phase 1 Session 7a — Trade Journal Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the first journaling surface — trade-scoped entries stored locally in Dexie v2, edited on `/w/:address/t/:tradeId` with autosave-on-blur. Pencil icon on trade-history rows for trades with notes. Export/import extended to carry journal data.

**Architecture:** Five layers, each testable in isolation. `src/entities/journal-entry.ts` owns the type. Dexie schema v2 (additive) + `src/lib/storage/journal-entries-repo.ts` owns persistence. `src/features/journal/` owns the TanStack Query hooks and the form component. A new `src/app/TradeDetail.tsx` route composes the form with a trade-summary card. `TradeHistoryList` gains a pencil icon and clickable rows. Export/import plumbing extends additively per CONVENTIONS §13.

**Tech Stack (no new dependencies):** React/Router, Dexie, TanStack Query, Zod, Playwright. `crypto.randomUUID()` for entry IDs (native; no deps).

---

## File structure (at end of session)

```
HyperJournal/
├── src/
│   ├── entities/
│   │   ├── journal-entry.ts                       NEW — JournalEntry type + Mood enum
│   │   └── export.ts                              MODIFY (+journalEntries on ExportData + ExportSnapshot + MergeResult)
│   ├── lib/
│   │   ├── storage/
│   │   │   ├── db.ts                              MODIFY (+version(2), +journalEntries table)
│   │   │   ├── journal-entries-repo.ts            NEW — CRUD
│   │   │   ├── journal-entries-repo.test.ts       NEW
│   │   │   ├── export-repo.ts                     MODIFY (+journalEntries in readSnapshot)
│   │   │   ├── export-repo.test.ts                MODIFY (+1 case)
│   │   │   ├── import-repo.ts                     MODIFY (+journalEntries in applyMerge transaction)
│   │   │   └── import-repo.test.ts                MODIFY (+1 case)
│   │   └── validation/
│   │       ├── export.ts                          MODIFY (+JournalEntrySchema)
│   │       └── export.test.ts                     MODIFY (+2 cases)
│   ├── domain/
│   │   └── export/
│   │       ├── buildExport.ts                     MODIFY (+journalEntries pass-through)
│   │       ├── buildExport.test.ts                MODIFY (+1 case)
│   │       ├── mergeImport.ts                     MODIFY (+journalEntries upsert)
│   │       └── mergeImport.test.ts                MODIFY (+2 cases)
│   ├── features/
│   │   ├── journal/
│   │   │   ├── components/
│   │   │   │   ├── TradeJournalForm.tsx           NEW — 6-field form w/ autosave
│   │   │   │   ├── TradeJournalForm.test.tsx      NEW
│   │   │   │   ├── TriStateRadio.tsx              NEW — yes/no/unanswered
│   │   │   │   └── TriStateRadio.test.tsx         NEW
│   │   │   ├── hooks/
│   │   │   │   ├── useTradeJournalEntry.ts        NEW — TanStack Query wrapper
│   │   │   │   ├── useTradeJournalEntry.test.tsx  NEW
│   │   │   │   ├── useJournalEntryIds.ts          NEW — Set<tradeId> query
│   │   │   │   └── useJournalEntryIds.test.tsx    NEW
│   │   │   └── index.ts                           NEW — public surface
│   │   └── wallets/
│   │       └── components/
│   │           ├── TradeHistoryList.tsx           MODIFY (+address prop, +Link wrap, +pencil icon)
│   │           └── TradeHistoryList.test.tsx      MODIFY (+2 cases)
│   └── app/
│       ├── routes.tsx                             MODIFY (+/w/:address/t/:tradeId route)
│       ├── TradeDetail.tsx                        NEW — summary card + journal form
│       ├── TradeDetail.test.tsx                   NEW
│       └── WalletView.tsx                         MODIFY (pass address to TradeHistoryList)
├── e2e/
│   └── journal-roundtrip.spec.ts                  NEW — paste → trade → type → blur → reload
└── docs/
    ├── SESSION_LOG.md                             MODIFY (+Session 7a entry)
    ├── BACKLOG.md                                 MODIFY (+9 entries)
    └── CONVENTIONS.md                             MODIFY (+§15 Journaling)
```

---

## Conventions (for every task)

- Commands from `/Users/angel/Documents/HyperJournal`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- TDD for `src/domain/**` and `src/lib/storage/**`. Component tests use RTL. Autosave-on-blur is tested by firing `blur` and waiting for the "Saved at" chip.
- Gauntlet after every code task: `pnpm typecheck && pnpm lint && pnpm test`. The final `pnpm test:coverage && pnpm build && pnpm test:e2e` runs at Task 9.
- Authorized test wallet stays in controller memory only. Fixtures use `0x0...01`.

---

## Task 1: `JournalEntry` entity + Dexie schema v2

Additive migration — existing v1 data unchanged; v2 adds the `journalEntries` table.

**Files:**
- Create: `src/entities/journal-entry.ts`
- Modify: `src/lib/storage/db.ts`

- [ ] **Step 1.1: Create `src/entities/journal-entry.ts`**

```ts
import type { Provenance } from './provenance';

/**
 * Mood the user was in during/after the trade. Five curated enum values
 * (plus null for unset) rather than free text so Phase 4 AI and future
 * pattern detection can query against a stable vocabulary.
 */
export type Mood =
  | 'calm'
  | 'confident'
  | 'anxious'
  | 'greedy'
  | 'regretful';

/**
 * One journal entry. Session 7a supports trade-scope only; the scope
 * discriminator is present so 7b (session/day) and 7c (strategy) can
 * extend without reshaping the table.
 *
 * One entry per trade for the 'trade' scope — subsequent saves overwrite
 * the same row by `id`. The row is not created until the first non-empty
 * blur, so users who navigate into a trade without typing never produce
 * dead rows.
 */
export type JournalEntry = {
  readonly id: string; // UUID v4
  readonly scope: 'trade';
  readonly tradeId: string; // ReconstructedTrade.id ("${coin}-${tid}")
  readonly createdAt: number; // Unix ms
  readonly updatedAt: number; // Unix ms

  readonly preTradeThesis: string;
  readonly postTradeReview: string;
  readonly lessonLearned: string;

  readonly mood: Mood | null;
  readonly planFollowed: boolean | null; // tri-state; null = unanswered
  readonly stopLossUsed: boolean | null;

  readonly provenance: Provenance; // always 'observed' for user-authored entries
};
```

- [ ] **Step 1.2: Bump Dexie to v2 in `src/lib/storage/db.ts`**

Replace the full file:

```ts
import Dexie, { type EntityTable } from 'dexie';
import type { Wallet } from '@entities/wallet';
import type { FillsCacheEntry } from '@entities/fills-cache';
import type { UserSettings } from '@entities/user-settings';
import type { JournalEntry } from '@entities/journal-entry';

// Re-exported for callers that already import from @lib/storage/db.
// New call sites should prefer @entities/* directly.
export type { FillsCacheEntry } from '@entities/fills-cache';
export type { UserSettings } from '@entities/user-settings';
export type { JournalEntry } from '@entities/journal-entry';

/**
 * Dexie database for HyperJournal.
 *
 * v1: wallets, fillsCache, userSettings (Session 2b).
 * v2: adds journalEntries (Session 7a). Additive only — no .upgrade()
 *     callback because no existing row needs transforming.
 *
 * Keys:
 * - wallets: primary key = address
 * - fillsCache: primary key = address
 * - userSettings: primary key = key (always 'singleton')
 * - journalEntries: primary key = id (UUID); indexed on tradeId, scope,
 *   updatedAt for list/filter queries
 */
export class HyperJournalDb extends Dexie {
  wallets!: EntityTable<Wallet, 'address'>;
  fillsCache!: EntityTable<FillsCacheEntry, 'address'>;
  userSettings!: EntityTable<UserSettings, 'key'>;
  journalEntries!: EntityTable<JournalEntry, 'id'>;

  constructor(name = 'hyperjournal') {
    super(name);
    this.version(1).stores({
      wallets: '&address, addedAt',
      fillsCache: '&address, fetchedAt',
      userSettings: '&key',
    });
    this.version(2).stores({
      wallets: '&address, addedAt',
      fillsCache: '&address, fetchedAt',
      userSettings: '&key',
      journalEntries: '&id, tradeId, scope, updatedAt',
    });
  }
}

/**
 * Shared module-level database instance. Tests override via the
 * HyperJournalDb constructor's optional `name` argument so each test
 * opens a unique DB.
 */
export const db = new HyperJournalDb();
```

- [ ] **Step 1.3: Gauntlet**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: green. No tests break — existing v1 tests continue to work because Dexie applies migrations on open and the v2 change is additive.

- [ ] **Step 1.4: Commit**

```bash
git add src/entities/journal-entry.ts src/lib/storage/db.ts
git commit -m "$(cat <<'EOF'
feat(entities): add JournalEntry + Dexie schema v2 with journalEntries table

JournalEntry carries scope discriminator ('trade' for now; 'session' and
'strategy' join in Sessions 7b/7c), tradeId foreign key to
ReconstructedTrade.id, tri-state booleans for planFollowed and
stopLossUsed (null = unanswered), and a five-value Mood enum (null =
unset).

Dexie bumps to v2 additively — v1 declaration stays in place; v2 adds
the journalEntries table with indexes on tradeId, scope, and updatedAt.
No .upgrade() callback because no existing rows transform.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `journal-entries-repo` (TDD)

**Files:**
- Create: `src/lib/storage/journal-entries-repo.ts`
- Create: `src/lib/storage/journal-entries-repo.test.ts`

- [ ] **Step 2.1: Write failing tests (RED)**

Create `src/lib/storage/journal-entries-repo.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HyperJournalDb } from './db';
import { createJournalEntriesRepo } from './journal-entries-repo';
import type { JournalEntry } from '@entities/journal-entry';

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`journal-repo-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
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
  };
}

describe('createJournalEntriesRepo', () => {
  it('findByTradeId returns null when no entry exists', async () => {
    const repo = createJournalEntriesRepo(db);
    expect(await repo.findByTradeId('BTC-1')).toBeNull();
  });

  it('findByTradeId returns the entry when one exists', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeEntry({ tradeId: 'BTC-1', preTradeThesis: 'thesis' }));
    const found = await repo.findByTradeId('BTC-1');
    expect(found?.preTradeThesis).toBe('thesis');
  });

  it('upsert overwrites by id', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeEntry({ id: 'e1', preTradeThesis: 'old' }));
    await repo.upsert(makeEntry({ id: 'e1', preTradeThesis: 'new', updatedAt: 200 }));
    const all = await repo.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.preTradeThesis).toBe('new');
    expect(all[0]!.updatedAt).toBe(200);
  });

  it('remove deletes the entry by id', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeEntry({ id: 'e1' }));
    await repo.remove('e1');
    expect(await repo.listAll()).toEqual([]);
  });

  it('listAll returns every entry', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeEntry({ id: 'e1', tradeId: 'BTC-1' }));
    await repo.upsert(makeEntry({ id: 'e2', tradeId: 'ETH-1' }));
    const all = await repo.listAll();
    expect(all).toHaveLength(2);
  });

  it('listAllTradeIds returns a deduplicated set of tradeIds', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeEntry({ id: 'e1', tradeId: 'BTC-1' }));
    await repo.upsert(makeEntry({ id: 'e2', tradeId: 'ETH-1' }));
    const ids = await repo.listAllTradeIds();
    expect(ids).toBeInstanceOf(Set);
    expect(ids.has('BTC-1')).toBe(true);
    expect(ids.has('ETH-1')).toBe(true);
    expect(ids.size).toBe(2);
  });
});
```

- [ ] **Step 2.2: Run — confirm RED**

```bash
pnpm test src/lib/storage/journal-entries-repo.test.ts
```

Expected: "Cannot find module './journal-entries-repo'".

- [ ] **Step 2.3: Implement `src/lib/storage/journal-entries-repo.ts`**

```ts
import type { JournalEntry } from '@entities/journal-entry';
import type { HyperJournalDb } from './db';

export type JournalEntriesRepo = {
  findByTradeId(tradeId: string): Promise<JournalEntry | null>;
  upsert(entry: JournalEntry): Promise<void>;
  remove(id: string): Promise<void>;
  listAll(): Promise<ReadonlyArray<JournalEntry>>;
  listAllTradeIds(): Promise<Set<string>>;
};

/**
 * Repository for journal entries. Session 7a only uses the trade scope
 * (one entry per tradeId); findByTradeId filters on the indexed column
 * and returns the first match. Multi-scope queries will grow this repo
 * in Sessions 7b+.
 */
export function createJournalEntriesRepo(db: HyperJournalDb): JournalEntriesRepo {
  return {
    async findByTradeId(tradeId) {
      const entry = await db.journalEntries.where('tradeId').equals(tradeId).first();
      return entry ?? null;
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
      const rows = await db.journalEntries.toArray();
      return new Set(rows.map((r) => r.tradeId));
    },
  };
}
```

- [ ] **Step 2.4: Run — confirm GREEN**

```bash
pnpm test src/lib/storage/journal-entries-repo.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 2.5: Gauntlet**

```bash
pnpm typecheck && pnpm lint
```

Expected: green.

- [ ] **Step 2.6: Commit**

```bash
git add src/lib/storage/journal-entries-repo.ts src/lib/storage/journal-entries-repo.test.ts
git commit -m "$(cat <<'EOF'
feat(storage): add journal-entries-repo with CRUD + listAllTradeIds

findByTradeId returns null (not undefined) to match the project's
other repos. upsert uses db.journalEntries.put (primary key = id, so
writes overwrite on conflict). listAllTradeIds reads every row and
dedupes into a Set — simpler than Dexie's orderBy for the small data
volume expected in Phase 1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: TanStack Query hooks for journal entries

Two hooks: `useTradeJournalEntry(tradeId)` reads/writes one trade's entry; `useJournalEntryIds()` returns the set of tradeIds with entries, used by the trade-history pencil icon.

**Files:**
- Create: `src/features/journal/hooks/useTradeJournalEntry.ts`
- Create: `src/features/journal/hooks/useTradeJournalEntry.test.tsx`
- Create: `src/features/journal/hooks/useJournalEntryIds.ts`
- Create: `src/features/journal/hooks/useJournalEntryIds.test.tsx`
- Create: `src/features/journal/index.ts`

- [ ] **Step 3.1: Create the public surface**

Create `src/features/journal/index.ts`:

```ts
export { useTradeJournalEntry } from './hooks/useTradeJournalEntry';
export { useJournalEntryIds } from './hooks/useJournalEntryIds';
```

(The `TradeJournalForm` + `TriStateRadio` exports land in Task 4.)

- [ ] **Step 3.2: Write failing tests for `useTradeJournalEntry` (RED)**

Create `src/features/journal/hooks/useTradeJournalEntry.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useTradeJournalEntry } from './useTradeJournalEntry';
import { HyperJournalDb } from '@lib/storage/db';
import type { JournalEntry } from '@entities/journal-entry';

let db: HyperJournalDb;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  db = new HyperJournalDb(`hj-journal-hook-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
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
    provenance: 'observed',
    ...overrides,
  };
}

describe('useTradeJournalEntry', () => {
  it('returns null when no entry exists', async () => {
    const { result } = renderHook(() => useTradeJournalEntry('BTC-1', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entry).toBeNull();
  });

  it('returns the entry when one exists', async () => {
    await db.journalEntries.put(makeEntry({ preTradeThesis: 'thesis' }));
    const { result } = renderHook(() => useTradeJournalEntry('BTC-1', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entry?.preTradeThesis).toBe('thesis');
  });

  it('save() upserts the entry and refreshes the query', async () => {
    const { result } = renderHook(() => useTradeJournalEntry('BTC-1', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.save(makeEntry({ preTradeThesis: 'new' }));
    });
    await waitFor(() => expect(result.current.entry?.preTradeThesis).toBe('new'));
  });

  it('remove() deletes the entry', async () => {
    await db.journalEntries.put(makeEntry());
    const { result } = renderHook(() => useTradeJournalEntry('BTC-1', { db }), { wrapper });
    await waitFor(() => expect(result.current.entry).not.toBeNull());
    await act(async () => {
      await result.current.remove('e1');
    });
    await waitFor(() => expect(result.current.entry).toBeNull());
  });
});
```

- [ ] **Step 3.3: Run — confirm RED**

```bash
pnpm test src/features/journal/hooks/useTradeJournalEntry.test.tsx
```

Expected: "Cannot find module './useTradeJournalEntry'".

- [ ] **Step 3.4: Implement `src/features/journal/hooks/useTradeJournalEntry.ts`**

```ts
import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createJournalEntriesRepo } from '@lib/storage/journal-entries-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { JournalEntry } from '@entities/journal-entry';

type Options = { db?: HyperJournalDb };

export type UseTradeJournalEntryResult = {
  entry: JournalEntry | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  save: (entry: JournalEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

/**
 * Read/write the journal entry for a single trade. Write invalidates
 * both this query and the cross-wallet tradeIds query (so the pencil
 * icon on trade-history rows updates immediately).
 */
export function useTradeJournalEntry(
  tradeId: string,
  options: Options = {},
): UseTradeJournalEntryResult {
  const db = options.db ?? defaultDb;
  const repo = useMemo(() => createJournalEntriesRepo(db), [db]);
  const queryClient = useQueryClient();

  const query = useQuery<JournalEntry | null>({
    queryKey: ['journal', 'trade', tradeId],
    queryFn: () => repo.findByTradeId(tradeId),
  });

  const saveMutation = useMutation({
    mutationFn: (entry: JournalEntry) => repo.upsert(entry),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['journal', 'trade', tradeId] });
      await queryClient.invalidateQueries({ queryKey: ['journal', 'trade-ids'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => repo.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['journal', 'trade', tradeId] });
      await queryClient.invalidateQueries({ queryKey: ['journal', 'trade-ids'] });
    },
  });

  const save = useCallback(
    async (entry: JournalEntry) => {
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

- [ ] **Step 3.5: Run — confirm GREEN**

```bash
pnpm test src/features/journal/hooks/useTradeJournalEntry.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 3.6: Write failing tests for `useJournalEntryIds` (RED)**

Create `src/features/journal/hooks/useJournalEntryIds.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useJournalEntryIds } from './useJournalEntryIds';
import { HyperJournalDb } from '@lib/storage/db';

let db: HyperJournalDb;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  db = new HyperJournalDb(`hj-ids-hook-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

describe('useJournalEntryIds', () => {
  it('returns an empty Set when no entries exist', async () => {
    const { result } = renderHook(() => useJournalEntryIds({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.ids.size).toBe(0);
  });

  it('returns a Set of tradeIds for existing entries', async () => {
    await db.journalEntries.put({
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
      provenance: 'observed',
    });
    const { result } = renderHook(() => useJournalEntryIds({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.ids.has('BTC-1')).toBe(true);
    expect(result.current.ids.size).toBe(1);
  });
});
```

- [ ] **Step 3.7: Run — confirm RED**

```bash
pnpm test src/features/journal/hooks/useJournalEntryIds.test.tsx
```

Expected: "Cannot find module './useJournalEntryIds'".

- [ ] **Step 3.8: Implement `src/features/journal/hooks/useJournalEntryIds.ts`**

```ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createJournalEntriesRepo } from '@lib/storage/journal-entries-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';

type Options = { db?: HyperJournalDb };

export type UseJournalEntryIdsResult = {
  ids: Set<string>;
  isLoading: boolean;
};

const EMPTY_SET: Set<string> = new Set();

/**
 * Returns the set of tradeIds that have journal entries. Used by
 * TradeHistoryList to render a pencil icon per row. Cheap enough to
 * read-all-and-dedupe; when entries start reaching the thousands,
 * revisit with an index-backed count query.
 */
export function useJournalEntryIds(options: Options = {}): UseJournalEntryIdsResult {
  const db = options.db ?? defaultDb;
  const repo = useMemo(() => createJournalEntriesRepo(db), [db]);

  const query = useQuery<Set<string>>({
    queryKey: ['journal', 'trade-ids'],
    queryFn: () => repo.listAllTradeIds(),
  });

  return {
    ids: query.data ?? EMPTY_SET,
    isLoading: query.isLoading,
  };
}
```

- [ ] **Step 3.9: Run — confirm GREEN**

```bash
pnpm test src/features/journal/hooks/useJournalEntryIds.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 3.10: Gauntlet + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: green.

```bash
git add src/features/journal/
git commit -m "$(cat <<'EOF'
feat(journal): add TanStack Query hooks useTradeJournalEntry + useJournalEntryIds

useTradeJournalEntry: read/save/remove the entry for one tradeId.
Mutations invalidate both the per-trade query and the cross-wallet
tradeIds query so the pencil icon on trade-history rows updates after
the user saves.

useJournalEntryIds: returns Set<string> of tradeIds with entries.
Cheap to compute for Phase 1 data volumes (read-all then dedupe);
revisit if entries reach thousands.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `TriStateRadio` + `TradeJournalForm`

`TriStateRadio` is a small reusable 3-option radio group (Yes / No / Unanswered) used twice in the form.

**Files:**
- Create: `src/features/journal/components/TriStateRadio.tsx`
- Create: `src/features/journal/components/TriStateRadio.test.tsx`
- Create: `src/features/journal/components/TradeJournalForm.tsx`
- Create: `src/features/journal/components/TradeJournalForm.test.tsx`
- Modify: `src/features/journal/index.ts`

- [ ] **Step 4.1: Write failing tests for `TriStateRadio` (RED)**

Create `src/features/journal/components/TriStateRadio.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TriStateRadio } from './TriStateRadio';

afterEach(() => cleanup());

describe('TriStateRadio', () => {
  it('renders three options with the given label', () => {
    render(<TriStateRadio legend="Plan followed?" name="plan" value={null} onChange={() => {}} />);
    expect(screen.getByText('Plan followed?')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /yes/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /no/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /unanswered/i })).toBeInTheDocument();
  });

  it('marks the Unanswered radio as checked when value is null', () => {
    render(<TriStateRadio legend="Plan followed?" name="plan" value={null} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /unanswered/i })).toBeChecked();
  });

  it('marks Yes / No when the value matches', () => {
    const { rerender } = render(
      <TriStateRadio legend="Plan followed?" name="plan" value={true} onChange={() => {}} />,
    );
    expect(screen.getByRole('radio', { name: /yes/i })).toBeChecked();
    rerender(<TriStateRadio legend="Plan followed?" name="plan" value={false} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /no/i })).toBeChecked();
  });

  it('fires onChange with the mapped value on click', () => {
    const onChange = vi.fn();
    render(<TriStateRadio legend="Plan followed?" name="plan" value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /yes/i }));
    expect(onChange).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('radio', { name: /no/i }));
    expect(onChange).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole('radio', { name: /unanswered/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('fires onBlur when any radio loses focus', () => {
    const onBlur = vi.fn();
    render(
      <TriStateRadio legend="Plan followed?" name="plan" value={null} onChange={() => {}} onBlur={onBlur} />,
    );
    const yes = screen.getByRole('radio', { name: /yes/i });
    fireEvent.blur(yes);
    expect(onBlur).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4.2: Run — confirm RED**

```bash
pnpm test src/features/journal/components/TriStateRadio.test.tsx
```

Expected: "Cannot find module './TriStateRadio'".

- [ ] **Step 4.3: Implement `src/features/journal/components/TriStateRadio.tsx`**

```tsx
import { cn } from '@lib/ui/utils';

type Props = {
  legend: string;
  name: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  onBlur?: () => void;
};

type Option = { label: string; value: boolean | null };

const OPTIONS: ReadonlyArray<Option> = [
  { label: 'Yes', value: true },
  { label: 'No', value: false },
  { label: 'Unanswered', value: null },
];

/**
 * Three-option radio group: Yes / No / Unanswered. Used for
 * planFollowed and stopLossUsed on the trade journal form. Unanswered
 * is the default and is a first-class value — forcing users to pick
 * Yes or No up front would push them toward whichever is less
 * emotionally loaded.
 */
export function TriStateRadio({ legend, name, value, onChange, onBlur }: Props) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-fg-base">{legend}</legend>
      <div className="flex flex-wrap gap-3 text-sm text-fg-base">
        {OPTIONS.map((opt) => {
          const id = `${name}-${opt.label.toLowerCase()}`;
          const checked = value === opt.value;
          return (
            <label
              key={opt.label}
              htmlFor={id}
              className="flex cursor-pointer items-center gap-2"
            >
              <input
                id={id}
                name={name}
                type="radio"
                checked={checked}
                onChange={() => onChange(opt.value)}
                {...(onBlur ? { onBlur } : {})}
                className={cn(
                  'h-4 w-4 border-border bg-bg-overlay text-accent ring-offset-bg-base',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                )}
              />
              <span>{opt.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 4.4: Run — confirm GREEN**

```bash
pnpm test src/features/journal/components/TriStateRadio.test.tsx
```

Expected: 5 tests pass.

- [ ] **Step 4.5: Write failing tests for `TradeJournalForm` (RED)**

Create `src/features/journal/components/TradeJournalForm.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TradeJournalForm } from './TradeJournalForm';
import { HyperJournalDb } from '@lib/storage/db';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`hj-form-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

function renderForm(tradeId = 'BTC-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TradeJournalForm tradeId={tradeId} db={db} />
    </QueryClientProvider>,
  );
}

describe('TradeJournalForm', () => {
  it('renders the six fields', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/pre-trade thesis/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/post-trade review/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/lesson learned/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mood/i)).toBeInTheDocument();
    expect(screen.getByText(/plan followed/i)).toBeInTheDocument();
    expect(screen.getByText(/stop-loss used/i)).toBeInTheDocument();
  });

  it('pre-populates from an existing entry', async () => {
    await db.journalEntries.put({
      id: 'e1',
      scope: 'trade',
      tradeId: 'BTC-1',
      createdAt: 100,
      updatedAt: 100,
      preTradeThesis: 'my thesis',
      postTradeReview: '',
      lessonLearned: '',
      mood: 'calm',
      planFollowed: null,
      stopLossUsed: null,
      provenance: 'observed',
    });
    renderForm();
    await waitFor(() => {
      expect(screen.getByLabelText(/pre-trade thesis/i)).toHaveValue('my thesis');
    });
    expect(screen.getByLabelText(/mood/i)).toHaveValue('calm');
  });

  it('saves on blur and shows the saved indicator', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/pre-trade thesis/i)).toBeInTheDocument());
    const field = screen.getByLabelText(/pre-trade thesis/i);
    fireEvent.change(field, { target: { value: 'typed' } });
    fireEvent.blur(field);
    await waitFor(() => expect(screen.getByText(/saved at/i)).toBeInTheDocument());
    const rows = await db.journalEntries.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.preTradeThesis).toBe('typed');
  });

  it('empty-form blur does NOT create a row', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/pre-trade thesis/i)).toBeInTheDocument());
    fireEvent.blur(screen.getByLabelText(/pre-trade thesis/i));
    // Give TanStack Query / Dexie a moment; no save should happen.
    await new Promise((r) => setTimeout(r, 50));
    expect(await db.journalEntries.count()).toBe(0);
  });

  it('changing mood + blurring saves', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/mood/i)).toBeInTheDocument());
    const mood = screen.getByLabelText(/mood/i) as HTMLSelectElement;
    fireEvent.change(mood, { target: { value: 'regretful' } });
    fireEvent.blur(mood);
    await waitFor(async () => {
      const rows = await db.journalEntries.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.mood).toBe('regretful');
    });
  });

  it('changing a tri-state + blurring saves', async () => {
    renderForm();
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /^yes$/i, hidden: false })).toBeInTheDocument(),
    );
    const planYes = screen.getAllByRole('radio', { name: /^yes$/i })[0]!;
    fireEvent.click(planYes);
    fireEvent.blur(planYes);
    await waitFor(async () => {
      const rows = await db.journalEntries.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.planFollowed).toBe(true);
    });
  });
});
```

- [ ] **Step 4.6: Run — confirm RED**

```bash
pnpm test src/features/journal/components/TradeJournalForm.test.tsx
```

Expected: "Cannot find module './TradeJournalForm'".

- [ ] **Step 4.7: Implement `src/features/journal/components/TradeJournalForm.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useTradeJournalEntry } from '../hooks/useTradeJournalEntry';
import { TriStateRadio } from './TriStateRadio';
import { Label } from '@lib/ui/components/label';
import { cn } from '@lib/ui/utils';
import type { JournalEntry, Mood } from '@entities/journal-entry';
import type { HyperJournalDb } from '@lib/storage/db';

type Props = {
  tradeId: string;
  db?: HyperJournalDb;
};

type DraftState = {
  preTradeThesis: string;
  postTradeReview: string;
  lessonLearned: string;
  mood: Mood | null;
  planFollowed: boolean | null;
  stopLossUsed: boolean | null;
};

type Status =
  | { kind: 'clean' }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string };

const EMPTY_DRAFT: DraftState = {
  preTradeThesis: '',
  postTradeReview: '',
  lessonLearned: '',
  mood: null,
  planFollowed: null,
  stopLossUsed: null,
};

const MOOD_OPTIONS: ReadonlyArray<{ value: Mood | ''; label: string }> = [
  { value: '', label: '— unset' },
  { value: 'calm', label: 'Calm' },
  { value: 'confident', label: 'Confident' },
  { value: 'anxious', label: 'Anxious' },
  { value: 'greedy', label: 'Greedy' },
  { value: 'regretful', label: 'Regretful' },
];

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

function entryToDraft(entry: JournalEntry | null): DraftState {
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

function formatSavedAt(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TradeJournalForm({ tradeId, db }: Props) {
  const hook = useTradeJournalEntry(tradeId, db ? { db } : {});
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [status, setStatus] = useState<Status>({ kind: 'clean' });
  const [hydrated, setHydrated] = useState(false);

  // Hydrate once when the query resolves the first time.
  useEffect(() => {
    if (!hydrated && !hook.isLoading) {
      setDraft(entryToDraft(hook.entry));
      setHydrated(true);
    }
  }, [hook.entry, hook.isLoading, hydrated]);

  async function commit(next: DraftState) {
    if (isDraftEmpty(next) && !hook.entry) {
      // No existing row and nothing to save — stay idle.
      return;
    }
    setStatus({ kind: 'saving' });
    const now = Date.now();
    const entry: JournalEntry = {
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
    setDraft((d) => ({ ...d, [key]: value }));
    setStatus({ kind: 'dirty' });
  }

  function onBlurCommit() {
    void commit(draft);
  }

  return (
    <section
      aria-labelledby="journal-heading"
      className="flex flex-col gap-4 rounded-lg border border-border bg-bg-raised p-6"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="journal-heading" className="text-lg font-semibold text-fg-base">
          Journal
        </h2>
        <StatusIndicator status={status} onRetry={onBlurCommit} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="preTradeThesis">Pre-trade thesis</Label>
        <textarea
          id="preTradeThesis"
          value={draft.preTradeThesis}
          onChange={(e) => change('preTradeThesis', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="What was your thesis before entering this trade?"
          rows={3}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="postTradeReview">Post-trade review</Label>
        <textarea
          id="postTradeReview"
          value={draft.postTradeReview}
          onChange={(e) => change('postTradeReview', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="What actually happened? What went right or wrong?"
          rows={4}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="lessonLearned">Lesson learned</Label>
        <textarea
          id="lessonLearned"
          value={draft.lessonLearned}
          onChange={(e) => change('lessonLearned', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="One sentence takeaway for next time."
          rows={2}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="mood">Mood</Label>
        <select
          id="mood"
          value={draft.mood ?? ''}
          onChange={(e) =>
            change('mood', e.target.value === '' ? null : (e.target.value as Mood))
          }
          onBlur={onBlurCommit}
          className={cn(
            'h-10 rounded-md border border-border bg-bg-overlay px-3 text-sm text-fg-base',
            'ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          )}
        >
          {MOOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <TriStateRadio
        legend="Plan followed?"
        name="planFollowed"
        value={draft.planFollowed}
        onChange={(v) => change('planFollowed', v)}
        onBlur={onBlurCommit}
      />

      <TriStateRadio
        legend="Stop-loss used?"
        name="stopLossUsed"
        value={draft.stopLossUsed}
        onChange={(v) => change('stopLossUsed', v)}
        onBlur={onBlurCommit}
      />
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

- [ ] **Step 4.8: Update `src/features/journal/index.ts`**

```ts
export { useTradeJournalEntry } from './hooks/useTradeJournalEntry';
export { useJournalEntryIds } from './hooks/useJournalEntryIds';
export { TradeJournalForm } from './components/TradeJournalForm';
export { TriStateRadio } from './components/TriStateRadio';
```

- [ ] **Step 4.9: Run — confirm GREEN**

```bash
pnpm test src/features/journal/components/TradeJournalForm.test.tsx
```

Expected: 6 tests pass.

- [ ] **Step 4.10: Gauntlet + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: green.

```bash
git add src/features/journal/components/ src/features/journal/index.ts
git commit -m "$(cat <<'EOF'
feat(journal): TradeJournalForm with autosave-on-blur + TriStateRadio

Six fields per spec: three textareas (pre-trade thesis, post-trade
review, lesson learned), mood select (5 enum values + unset), and two
TriStateRadio groups for planFollowed and stopLossUsed. Autosave
triggers on every field's onBlur; isDraftEmpty short-circuits so
empty-form blurs don't create dead rows when the user navigates away
without typing.

Form-level status machine: clean / dirty / saving / saved / error.
"Saved at HH:MM" chip on success; loss-tone error chip with a Retry
button on failure. Local clock via toLocaleTimeString.

TriStateRadio is a small reusable 3-option radio group (Yes / No /
Unanswered). Unanswered is the default and a first-class value — we
don't force a binary pick up front.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `TradeDetail` route + page

**Files:**
- Create: `src/app/TradeDetail.tsx`
- Create: `src/app/TradeDetail.test.tsx`
- Modify: `src/app/routes.tsx`

- [ ] **Step 5.1: Write failing tests (RED)**

Create `src/app/TradeDetail.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TradeDetail } from './TradeDetail';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/w/:address" element={<div data-testid="wallet-view">wallet view</div>} />
          <Route path="/w/:address/t/:tradeId" element={<TradeDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TradeDetail', () => {
  it('redirects when the address is invalid', async () => {
    renderAt('/w/not-a-hex/t/BTC-1');
    // With an invalid address, TradeDetail returns <Navigate to="/" />.
    // The test route table doesn't include "/", so the redirect lands on
    // React Router's "No routes matched" state; we assert that the wallet
    // view stub is NOT in the DOM (TradeDetail's own content never rendered).
    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    });
  });

  it('redirects to /w/:address when the tradeId does not match any trade', async () => {
    // Mock fetch to return an empty fills array — no trades reconstruct,
    // so any tradeId on the path will miss.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })));
    renderAt('/w/0x0000000000000000000000000000000000000001/t/NONEXISTENT');
    await waitFor(() => expect(screen.getByTestId('wallet-view')).toBeInTheDocument());
  });
});
```

Note: the positive-case (valid tradeId renders summary + form) is exercised end-to-end in Task 8's Playwright test against the real fixture. Asserting it here would require either hard-coding a fixture tradeId (brittle to fixture refreshes) or running the reconstruction pipeline inside the test (noisy setup). The redirect paths are the invariants worth testing in isolation.

- [ ] **Step 5.2: Run — confirm RED**

```bash
pnpm test src/app/TradeDetail.test.tsx
```

Expected: "Cannot find module './TradeDetail'".

- [ ] **Step 5.3: Implement `src/app/TradeDetail.tsx`**

```tsx
import { useParams, Navigate, Link } from 'react-router-dom';
import { isValidWalletAddress } from '@domain/wallets/isValidWalletAddress';
import { useWalletMetrics } from '@features/wallets';
import { TradeJournalForm } from '@features/journal';
import { formatCurrency, formatHoldTime } from '@lib/ui/format';
import type { WalletAddress } from '@entities/wallet';
import type { ReconstructedTrade } from '@entities/trade';

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

function SideBadge({ side }: { side: 'long' | 'short' }) {
  const tone = side === 'long' ? 'bg-gain/10 text-gain' : 'bg-loss/10 text-loss';
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-medium uppercase ${tone}`}>
      {side}
    </span>
  );
}

function StatusBadge({ status }: { status: 'open' | 'closed' }) {
  const tone = status === 'closed' ? 'bg-bg-overlay text-fg-muted' : 'bg-risk/10 text-risk';
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>
  );
}

function TradeSummary({ trade }: { trade: ReconstructedTrade }) {
  const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return (
    <section
      aria-labelledby="trade-summary-heading"
      className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-bg-raised p-6 md:grid-cols-4"
    >
      <h2 id="trade-summary-heading" className="sr-only">
        Trade summary
      </h2>
      <SummaryCell label="Opened" value={fmtDate(trade.openedAt)} />
      <SummaryCell
        label={trade.status === 'closed' ? 'Closed' : 'Still open'}
        value={trade.status === 'closed' ? fmtDate(trade.closedAt) : '—'}
      />
      <SummaryCell
        label="Avg entry"
        value={trade.avgEntryPx !== null ? trade.avgEntryPx.toFixed(2) : '—'}
      />
      <SummaryCell
        label="Avg exit"
        value={trade.avgExitPx !== null ? trade.avgExitPx.toFixed(2) : '—'}
      />
      <SummaryCell label="Size" value={trade.openedSize.toString()} />
      <SummaryCell
        label="Realized PnL"
        value={trade.status === 'closed' ? formatCurrency(trade.realizedPnl) : '—'}
      />
      <SummaryCell label="Fees" value={formatCurrency(-trade.totalFees)} />
      <SummaryCell
        label="Held"
        value={trade.status === 'closed' ? formatHoldTime(trade.holdTimeMs) : '—'}
      />
    </section>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wider text-fg-muted">
        {label}
      </p>
      <p className="font-mono text-sm text-fg-base">{value}</p>
    </div>
  );
}
```

- [ ] **Step 5.4: Register the route**

In `src/app/routes.tsx`, add the detail route AFTER `/w/:address` and BEFORE `/settings`:

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { SplitHome } from './SplitHome';
import { WalletView } from './WalletView';
import { Settings } from './Settings';
import { TradeDetail } from './TradeDetail';

const router = createBrowserRouter(
  [
    { path: '/', element: <SplitHome /> },
    { path: '/w/:address', element: <WalletView /> },
    { path: '/w/:address/t/:tradeId', element: <TradeDetail /> },
    { path: '/settings', element: <Settings /> },
  ],
  {
    basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
  },
);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
```

- [ ] **Step 5.5: Run the test**

```bash
pnpm test src/app/TradeDetail.test.tsx
```

Expected: 2 tests pass (redirect on invalid address; redirect on unknown tradeId).

- [ ] **Step 5.6: Gauntlet + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: green.

```bash
git add src/app/TradeDetail.tsx src/app/TradeDetail.test.tsx src/app/routes.tsx
git commit -m "$(cat <<'EOF'
feat(app): add /w/:address/t/:tradeId route with TradeDetail page

Header carries coin + side/status badges + Settings + Back links.
Summary grid renders opened/closed dates, avg entry/exit prices,
size, realized PnL, fees, and hold time — all from the existing
useWalletMetrics pipeline. Unknown tradeId redirects to /w/:address;
invalid address falls through to /. TradeJournalForm is mounted
below the summary.

Unit tests assert the redirect path; content rendering is covered
by the Playwright round-trip in Task 8 where the real reconstruction
runs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Clickable history rows + pencil icon

`TradeHistoryList` rows become `<Link>`s; a pencil icon appears when `useJournalEntryIds().has(tradeId)`.

**Files:**
- Modify: `src/features/wallets/components/TradeHistoryList.tsx`
- Modify: `src/features/wallets/components/TradeHistoryList.test.tsx`
- Modify: `src/app/WalletView.tsx`

- [ ] **Step 6.1: Update `TradeHistoryList` — add `address` prop, wrap rows with `<Link>`, render pencil icon**

Open `src/features/wallets/components/TradeHistoryList.tsx`. Three changes to apply:

**Change 1:** Import `<Link>` and `useJournalEntryIds`; widen the prop type.

Near the existing imports, add:

```tsx
import { Link } from 'react-router-dom';
import { useJournalEntryIds } from '@features/journal';
import type { WalletAddress } from '@entities/wallet';
```

Widen `Props`:

```tsx
type Props = {
  trades: ReadonlyArray<ReconstructedTrade>;
  address: WalletAddress;
};
```

Update the component signature:

```tsx
export function TradeHistoryList({ trades, address }: Props) {
```

**Change 2:** Read the entry-ids inside the body, near the existing `useMemo` / `useRef` hooks:

```tsx
  const { ids: journalIds } = useJournalEntryIds();
```

**Change 3:** Replace the per-row rendering (`virtualizer.getVirtualItems().map(...)`) so each row is a `<Link>`. The relevant block inside the inner `role="rowgroup"` div becomes:

```tsx
            {virtualizer.getVirtualItems().map((v) => {
              const t = sorted[v.index]!;
              const pnlTone =
                t.status === 'open'
                  ? 'text-fg-muted'
                  : t.realizedPnl > 0
                    ? 'text-gain'
                    : t.realizedPnl < 0
                      ? 'text-loss'
                      : 'text-fg-base';
              const hasNotes = journalIds.has(t.id);
              return (
                <Link
                  key={t.id}
                  to={`/w/${address}/t/${t.id}`}
                  role="row"
                  className={cn(
                    'grid items-center gap-2 border-b border-border py-2 text-sm',
                    'ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                    'hover:bg-bg-overlay/40',
                    GRID_COLUMNS,
                  )}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${v.start}px)`,
                    height: ROW_HEIGHT,
                  }}
                >
                  <div role="cell" className="flex items-center gap-1 truncate font-mono text-fg-base">
                    <span className="truncate">{t.coin}</span>
                    {hasNotes && (
                      <PencilIcon aria-label="Has journal notes" className="h-3 w-3 shrink-0 text-fg-muted" />
                    )}
                  </div>
                  <div
                    role="cell"
                    className={t.side === 'long' ? 'text-gain' : 'text-loss'}
                  >
                    {t.side}
                  </div>
                  <div role="cell" className="font-mono text-xs text-fg-muted">
                    {formatDate(t.openedAt)}
                  </div>
                  <div role="cell" className="text-fg-muted">
                    {t.status}
                  </div>
                  <div role="cell" className={cn('text-right font-mono', pnlTone)}>
                    {t.status === 'open' ? '—' : formatCurrency(t.realizedPnl)}
                  </div>
                  <div role="cell" className="text-right font-mono text-fg-muted">
                    {t.status === 'open' ? '—' : formatHoldTime(t.holdTimeMs)}
                  </div>
                </Link>
              );
            })}
```

**Change 4:** Add the `PencilIcon` component at the bottom of the file:

```tsx
function PencilIcon({
  className,
  ...rest
}: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}
```

- [ ] **Step 6.2: Update `WalletView.tsx` to pass the address**

Find the `<TradeHistoryList trades={metrics.trades} />` line and change to:

```tsx
          <TradeHistoryList trades={metrics.trades} address={address} />
```

- [ ] **Step 6.3: Update `TradeHistoryList.test.tsx` — add `address` prop + 2 new cases**

Open `src/features/wallets/components/TradeHistoryList.test.tsx`.

**Change 1:** Wrap the existing test render calls so they include the MemoryRouter + QueryClientProvider (needed for the new `<Link>` and `useJournalEntryIds`). Add near the top:

```tsx
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WalletAddress } from '@entities/wallet';

const ADDR = '0x0000000000000000000000000000000000000001' as WalletAddress;

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}
```

**Change 2:** Update every existing `render(<TradeHistoryList trades={...} />)` call to `render(wrap(<TradeHistoryList trades={...} address={ADDR} />))`.

**Change 3:** Add two new test cases at the end of the describe block:

```tsx
  it('rows are links to /w/:address/t/:tradeId', () => {
    render(wrap(<TradeHistoryList trades={[makeTrade({ id: 'BTC-1', coin: 'BTC' })]} address={ADDR} />));
    const link = screen.getByRole('row', { name: /BTC/i });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', `/w/${ADDR}/t/BTC-1`);
  });

  it('shows a pencil icon on rows that have journal entries', async () => {
    // useJournalEntryIds consults the default Dexie singleton. Write
    // directly via the singleton so this test is self-contained.
    const { db } = await import('@lib/storage/db');
    await db.journalEntries.put({
      id: 'e-x',
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
      provenance: 'observed',
    });
    render(wrap(<TradeHistoryList trades={[makeTrade({ id: 'BTC-1', coin: 'BTC' })]} address={ADDR} />));
    const pencil = await screen.findByLabelText(/has journal notes/i);
    expect(pencil).toBeInTheDocument();
    // Cleanup so the singleton doesn't leak into the next test
    await db.journalEntries.delete('e-x');
  });
```

- [ ] **Step 6.4: Run the tests**

```bash
pnpm test src/features/wallets/components/TradeHistoryList.test.tsx
```

Expected: all tests pass (existing 5 + 2 new = 7).

- [ ] **Step 6.5: Gauntlet + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: green.

```bash
git add src/features/wallets/components/TradeHistoryList.tsx src/features/wallets/components/TradeHistoryList.test.tsx src/app/WalletView.tsx
git commit -m "$(cat <<'EOF'
feat(wallets): clickable trade-history rows + pencil icon for journaled trades

Rows become <Link to=/w/:address/t/:tradeId> while preserving the
role="row" ARIA chain (role="row" on an <a> is valid). Focus-visible
ring and subtle hover state added so keyboard and mouse users both
get affordance. WalletView now threads the address down.

Pencil icon from useJournalEntryIds().has(tradeId) — decorative with
aria-label="Has journal notes". Inline with the coin cell so it sits
close to the primary identifier.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Export/import extension for journal entries

Additive — per CONVENTIONS §13, no `formatVersion` bump.

**Files:**
- Modify: `src/entities/export.ts`
- Modify: `src/lib/validation/export.ts`
- Modify: `src/lib/validation/export.test.ts`
- Modify: `src/lib/storage/export-repo.ts`
- Modify: `src/lib/storage/export-repo.test.ts`
- Modify: `src/lib/storage/import-repo.ts`
- Modify: `src/lib/storage/import-repo.test.ts`
- Modify: `src/domain/export/buildExport.ts`
- Modify: `src/domain/export/buildExport.test.ts`
- Modify: `src/domain/export/mergeImport.ts`
- Modify: `src/domain/export/mergeImport.test.ts`
- Modify: `src/app/settings/ImportPanel.tsx`

- [ ] **Step 7.1: Extend `ExportSnapshot`, `ExportData`, `MergeResult` in the entity**

In `src/entities/export.ts`:

Add `import type { JournalEntry } from './journal-entry';` near the top imports.

Update three types:

```ts
export type ExportSnapshot = {
  readonly wallets: Array<Wallet>;
  readonly userSettings: UserSettings | null;
  readonly fillsCache: Array<FillsCacheEntry>;
  readonly journalEntries: Array<JournalEntry>;
};
```

```ts
export type ExportData = {
  readonly wallets: Array<Wallet>;
  readonly userSettings: UserSettings | null;
  readonly fillsCache?: Array<FillsCacheEntry> | undefined;
  readonly journalEntries?: Array<JournalEntry> | undefined;
};
```

```ts
export type MergeResult = {
  readonly walletsToUpsert: Array<Wallet>;
  readonly userSettingsToOverwrite: UserSettings | null;
  readonly fillsCacheToUpsert: Array<FillsCacheEntry>;
  readonly journalEntriesToUpsert: Array<JournalEntry>;
  readonly summary: {
    readonly walletsAdded: number;
    readonly walletsUpdated: number;
    readonly userSettingsOverwritten: boolean;
    readonly fillsCacheEntries: number;
    readonly journalEntriesImported: number;
  };
};
```

- [ ] **Step 7.2: Extend `ExportFileSchema` in `src/lib/validation/export.ts`**

Near the existing schemas, add the `JournalEntrySchema`:

```ts
const MoodSchema = z.enum(['calm', 'confident', 'anxious', 'greedy', 'regretful']).nullable();

const JournalEntrySchema = z.object({
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

Update `ExportDataSchema`:

```ts
const ExportDataSchema = z.object({
  wallets: z.array(WalletSchema),
  userSettings: UserSettingsSchema,
  fillsCache: z.array(FillsCacheEntrySchema).optional(),
  journalEntries: z.array(JournalEntrySchema).optional(),
});
```

The `_schemaCheck` at the bottom stays unchanged — the one-way check still passes because we updated both the entity and the schema in lockstep.

- [ ] **Step 7.3: Extend `export.test.ts` with 2 new cases**

In `src/lib/validation/export.test.ts`, append to the `describe('ExportFileSchema', ...)` block:

```ts
  it('parses a file with journalEntries rows', () => {
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
            preTradeThesis: 't',
            postTradeReview: '',
            lessonLearned: '',
            mood: 'calm',
            planFollowed: true,
            stopLossUsed: null,
            provenance: 'observed',
          },
        ],
      },
    });
    expect(out.data.journalEntries).toHaveLength(1);
    expect(out.data.journalEntries![0]!.mood).toBe('calm');
  });

  it('rejects a journalEntries row with an invalid scope', () => {
    expect(() =>
      ExportFileSchema.parse({
        ...validFile,
        data: {
          ...validFile.data,
          journalEntries: [
            {
              id: 'e1',
              scope: 'weird',
              tradeId: 'BTC-1',
              createdAt: 1,
              updatedAt: 1,
              preTradeThesis: '',
              postTradeReview: '',
              lessonLearned: '',
              mood: null,
              planFollowed: null,
              stopLossUsed: null,
              provenance: 'observed',
            },
          ],
        },
      }),
    ).toThrow();
  });
```

- [ ] **Step 7.4: Extend `export-repo.ts` + test**

In `src/lib/storage/export-repo.ts`, extend `readSnapshot`:

```ts
    async readSnapshot() {
      const [wallets, userSettings, fillsCache, journalEntries] = await Promise.all([
        db.wallets.toArray(),
        db.userSettings.get('singleton'),
        db.fillsCache.toArray(),
        db.journalEntries.toArray(),
      ]);
      return {
        wallets,
        userSettings: userSettings ?? null,
        fillsCache,
        journalEntries,
      };
    },
```

In `src/lib/storage/export-repo.test.ts`, add one more case:

```ts
  it('readSnapshot returns all journalEntries rows', async () => {
    await db.journalEntries.put({
      id: 'e1',
      scope: 'trade',
      tradeId: 'BTC-1',
      createdAt: 1,
      updatedAt: 1,
      preTradeThesis: 't',
      postTradeReview: '',
      lessonLearned: '',
      mood: null,
      planFollowed: null,
      stopLossUsed: null,
      provenance: 'observed',
    });
    const repo = createExportRepo(db);
    const snap = await repo.readSnapshot();
    expect(snap.journalEntries).toHaveLength(1);
    expect(snap.journalEntries[0]!.preTradeThesis).toBe('t');
  });
```

- [ ] **Step 7.5: Extend `import-repo.ts` + test**

In `src/lib/storage/import-repo.ts`, extend `applyMerge`:

```ts
    async applyMerge(result) {
      await db.transaction(
        'rw',
        db.wallets,
        db.userSettings,
        db.fillsCache,
        db.journalEntries,
        async () => {
          if (result.walletsToUpsert.length > 0) {
            await db.wallets.bulkPut(result.walletsToUpsert.slice());
          }
          if (result.userSettingsToOverwrite !== null) {
            await db.userSettings.put(result.userSettingsToOverwrite);
          }
          if (result.fillsCacheToUpsert.length > 0) {
            await db.fillsCache.bulkPut(result.fillsCacheToUpsert.slice());
          }
          if (result.journalEntriesToUpsert.length > 0) {
            await db.journalEntries.bulkPut(result.journalEntriesToUpsert.slice());
          }
        },
      );
    },
```

In `src/lib/storage/import-repo.test.ts`:

- Update `emptyResult` to include the new fields:

```ts
const emptyResult: MergeResult = {
  walletsToUpsert: [],
  userSettingsToOverwrite: null,
  fillsCacheToUpsert: [],
  journalEntriesToUpsert: [],
  summary: {
    walletsAdded: 0,
    walletsUpdated: 0,
    userSettingsOverwritten: false,
    fillsCacheEntries: 0,
    journalEntriesImported: 0,
  },
};
```

- Add one new test case:

```ts
  it('applyMerge upserts journalEntries', async () => {
    const repo = createImportRepo(db);
    await repo.applyMerge({
      ...emptyResult,
      journalEntriesToUpsert: [
        {
          id: 'e1',
          scope: 'trade',
          tradeId: 'BTC-1',
          createdAt: 1,
          updatedAt: 1,
          preTradeThesis: 't',
          postTradeReview: '',
          lessonLearned: '',
          mood: null,
          planFollowed: null,
          stopLossUsed: null,
          provenance: 'observed',
        },
      ],
    });
    const row = await db.journalEntries.get('e1');
    expect(row?.preTradeThesis).toBe('t');
  });
```

- [ ] **Step 7.6: Extend `buildExport` + test**

In `src/domain/export/buildExport.ts`, update both branches to include `journalEntries`:

```ts
  const data: ExportData = options.includeCache
    ? {
        wallets: snapshot.wallets,
        userSettings: snapshot.userSettings,
        fillsCache: snapshot.fillsCache,
        journalEntries: snapshot.journalEntries,
      }
    : {
        wallets: snapshot.wallets,
        userSettings: snapshot.userSettings,
        journalEntries: snapshot.journalEntries,
      };
```

Journal entries are always included — unlike `fillsCache`, they're user-authored and small. If snapshot.journalEntries is an empty array, the key is still present (empty array, not undefined). That's fine — small and explicit.

In `src/domain/export/buildExport.test.ts`:

- Update `baseSnapshot` to include `journalEntries`:

```ts
const baseSnapshot: ExportSnapshot = {
  wallets: [{ address: ADDR, label: null, addedAt: 100 }],
  userSettings: { key: 'singleton', lastSelectedAddress: ADDR },
  fillsCache: [{ address: ADDR, fetchedAt: 200, fills: [] }],
  journalEntries: [],
};
```

- Add one new case:

```ts
  it('includes journalEntries unconditionally (both includeCache=true and =false)', () => {
    const snap: ExportSnapshot = {
      ...baseSnapshot,
      journalEntries: [
        {
          id: 'e1',
          scope: 'trade',
          tradeId: 'BTC-1',
          createdAt: 1,
          updatedAt: 1,
          preTradeThesis: 't',
          postTradeReview: '',
          lessonLearned: '',
          mood: null,
          planFollowed: null,
          stopLossUsed: null,
          provenance: 'observed',
        },
      ],
    };
    expect(buildExport(snap, { includeCache: true, now: 0 }).data.journalEntries).toHaveLength(1);
    expect(buildExport(snap, { includeCache: false, now: 0 }).data.journalEntries).toHaveLength(1);
  });
```

Also update existing test cases that construct `snap: ExportSnapshot` inline to include `journalEntries: []`.

- [ ] **Step 7.7: Extend `mergeImport` + test**

In `src/domain/export/mergeImport.ts`, extend the function to upsert journal entries:

```ts
export function mergeImport(
  existing: ExportSnapshot,
  incoming: ExportFile,
): MergeResult {
  const existingAddresses = new Set(existing.wallets.map((w) => w.address));
  const walletsToUpsert = incoming.data.wallets;

  let walletsAdded = 0;
  let walletsUpdated = 0;
  for (const w of walletsToUpsert) {
    if (existingAddresses.has(w.address)) {
      walletsUpdated += 1;
    } else {
      walletsAdded += 1;
    }
  }

  const userSettingsToOverwrite = incoming.data.userSettings;
  const userSettingsOverwritten = userSettingsToOverwrite !== null;

  const fillsCacheToUpsert = incoming.data.fillsCache ?? [];
  const journalEntriesToUpsert = incoming.data.journalEntries ?? [];

  return {
    walletsToUpsert,
    userSettingsToOverwrite,
    fillsCacheToUpsert,
    journalEntriesToUpsert,
    summary: {
      walletsAdded,
      walletsUpdated,
      userSettingsOverwritten,
      fillsCacheEntries: fillsCacheToUpsert.length,
      journalEntriesImported: journalEntriesToUpsert.length,
    },
  };
}
```

In `src/domain/export/mergeImport.test.ts`:

- Update `emptySnapshot` to include `journalEntries: []`:

```ts
const emptySnapshot: ExportSnapshot = {
  wallets: [],
  userSettings: null,
  fillsCache: [],
  journalEntries: [],
};
```

- Update `existing: ExportSnapshot` in any existing test that constructs one.

- Add two new test cases:

```ts
  it('passes journalEntries through from the file', () => {
    const file: ExportFile = {
      app: 'HyperJournal',
      formatVersion: 1,
      exportedAt: 0,
      data: {
        wallets: [],
        userSettings: null,
        journalEntries: [
          {
            id: 'e1',
            scope: 'trade',
            tradeId: 'BTC-1',
            createdAt: 1,
            updatedAt: 1,
            preTradeThesis: 't',
            postTradeReview: '',
            lessonLearned: '',
            mood: null,
            planFollowed: null,
            stopLossUsed: null,
            provenance: 'observed',
          },
        ],
      },
    };
    const result = mergeImport(emptySnapshot, file);
    expect(result.journalEntriesToUpsert).toHaveLength(1);
    expect(result.summary.journalEntriesImported).toBe(1);
  });

  it('emits an empty journalEntriesToUpsert when the file has no journalEntries key', () => {
    const file = makeFile();
    const result = mergeImport(emptySnapshot, file);
    expect(result.journalEntriesToUpsert).toEqual([]);
    expect(result.summary.journalEntriesImported).toBe(0);
  });
```

- [ ] **Step 7.8: Extend `ImportPanel` summary copy**

In `src/app/settings/ImportPanel.tsx`, the summary rendering around "Will import N wallets and M cache entries" — extend to include the journal count. Replace the existing summary paragraph:

```tsx
          <p className="text-fg-base">
            Will import{' '}
            <span className="font-medium">
              {state.result.summary.walletsAdded + state.result.summary.walletsUpdated} wallet
              {state.result.summary.walletsAdded + state.result.summary.walletsUpdated === 1
                ? ''
                : 's'}
            </span>
            {state.result.summary.fillsCacheEntries > 0 ? (
              <>
                {' '}
                and{' '}
                <span className="font-medium">
                  {state.result.summary.fillsCacheEntries} cache entr
                  {state.result.summary.fillsCacheEntries === 1 ? 'y' : 'ies'}
                </span>
              </>
            ) : null}
            {state.result.summary.journalEntriesImported > 0 ? (
              <>
                {' '}
                and{' '}
                <span className="font-medium">
                  {state.result.summary.journalEntriesImported} journal entr
                  {state.result.summary.journalEntriesImported === 1 ? 'y' : 'ies'}
                </span>
              </>
            ) : null}
            {state.result.summary.userSettingsOverwritten ? '. Settings will be overwritten.' : '.'}
          </p>
```

- [ ] **Step 7.9: Run all affected tests**

```bash
pnpm test src/lib/validation/export.test.ts src/lib/storage/export-repo.test.ts src/lib/storage/import-repo.test.ts src/domain/export/buildExport.test.ts src/domain/export/mergeImport.test.ts src/app/settings/ImportPanel.test.tsx
```

Expected: all green.

- [ ] **Step 7.10: Full gauntlet**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: green.

- [ ] **Step 7.11: Commit**

```bash
git add src/entities/export.ts \
        src/lib/validation/export.ts src/lib/validation/export.test.ts \
        src/lib/storage/export-repo.ts src/lib/storage/export-repo.test.ts \
        src/lib/storage/import-repo.ts src/lib/storage/import-repo.test.ts \
        src/domain/export/buildExport.ts src/domain/export/buildExport.test.ts \
        src/domain/export/mergeImport.ts src/domain/export/mergeImport.test.ts \
        src/app/settings/ImportPanel.tsx
git commit -m "$(cat <<'EOF'
feat(export): extend export/import to carry journal entries

Additive extension per CONVENTIONS §13 — no formatVersion bump.
ExportData gains an optional journalEntries array; buildExport writes
it unconditionally (unlike fillsCache which is gated by includeCache,
since journals are user-authored and not regenerable).

mergeImport upserts journal entries by id (incoming wins). import-repo
writes them inside the existing Dexie transaction so the import stays
atomic across all four tables. MergeResult.summary gains
journalEntriesImported, surfaced in the ImportPanel dry-run copy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Playwright E2E — journal round-trip

**Files:**
- Create: `e2e/journal-roundtrip.spec.ts`

- [ ] **Step 8.1: Write the test**

Create `e2e/journal-roundtrip.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { mockHyperliquid } from './fixtures/hyperliquid-route';

const TEST_ADDR = '0x0000000000000000000000000000000000000001';

test.describe('journal round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await mockHyperliquid(page);
  });

  test('types a note, blurs, reloads, and sees the note persist', async ({ page }) => {
    // 1. Land on /w/:address via the paste flow.
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}$`));

    // 2. Click the first trade-history row.
    const table = page.getByRole('table', { name: /trade history/i });
    await expect(table).toBeVisible();
    const firstRow = table.getByRole('row').nth(1); // index 0 is the header row
    await firstRow.click();

    // 3. Land on the trade-detail route.
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}/t/`));
    await expect(page.getByRole('heading', { name: /journal/i })).toBeVisible();

    // 4. Type into the post-trade-review textarea and blur.
    const postReview = page.getByLabel(/post-trade review/i);
    await postReview.fill('E2E journal test entry');
    await postReview.blur();
    await expect(page.getByText(/saved at/i)).toBeVisible();

    // 5. Reload the page.
    await page.reload();

    // 6. The textarea still carries the content.
    await expect(page.getByLabel(/post-trade review/i)).toHaveValue('E2E journal test entry');
  });

  test('pencil icon appears on the history row after a note is saved', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();

    // Seed a journal entry via the UI (not DB hack) to match real flow.
    const firstRow = page.getByRole('table', { name: /trade history/i }).getByRole('row').nth(1);
    await firstRow.click();
    await page.getByLabel(/post-trade review/i).fill('seed');
    await page.getByLabel(/post-trade review/i).blur();
    await expect(page.getByText(/saved at/i)).toBeVisible();

    // Back to the wallet view.
    await page.getByRole('link', { name: /back/i }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}$`));

    // Pencil icon should now show on that row.
    const rowWithNote = page
      .getByRole('table', { name: /trade history/i })
      .getByRole('row')
      .nth(1);
    await expect(rowWithNote.getByLabel(/has journal notes/i)).toBeVisible();
  });
});
```

- [ ] **Step 8.2: Run the test**

```bash
pnpm test:e2e e2e/journal-roundtrip.spec.ts
```

Expected: 2 tests pass.

- [ ] **Step 8.3: Fix any flake discovered**

Likely issues:
- `firstRow.click()` may not register as a navigation click because the row is an `<a>` — if Playwright's click on the `<a>` wrapper doesn't trigger navigation, try `firstRow.locator('..').click()` or the row's first child.
- "Trade history" heading shows up before rows render — the `.nth(1)` selector skips the header row; verify by running `--headed` if a row isn't found.

- [ ] **Step 8.4: Commit**

```bash
git add e2e/journal-roundtrip.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): add journal round-trip smoke

Two tests: (1) paste wallet → click first trade → type a journal note
→ blur → reload → note persists. (2) After saving a note, the pencil
icon appears on the row when navigating back to /w/:address.

Exercises the full trade-detail route + TradeJournalForm autosave +
useJournalEntryIds invalidation + Dexie persistence chain that unit
tests cannot verify end-to-end.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Close-out docs

**Files:**
- Modify: `docs/SESSION_LOG.md`
- Modify: `docs/BACKLOG.md`
- Modify: `docs/CONVENTIONS.md`

- [ ] **Step 9.1: Append Session 7a SESSION_LOG entry**

Append at the end of `docs/SESSION_LOG.md`, before the trailing `---`:

```markdown

## 2026-04-22 — Phase 1 Session 7a: Trade journal foundation

**Session goal:** Ship the first journaling surface. Trade-scoped entries stored locally in Dexie v2, edited on /w/:address/t/:tradeId with autosave-on-blur. Pencil icon marks trades with notes. Export/import extended to carry journal data.

**Done:**

- `src/entities/journal-entry.ts`: `JournalEntry` type + `Mood` enum (calm / confident / anxious / greedy / regretful; null = unset). Tri-state booleans for `planFollowed` and `stopLossUsed` (null = unanswered as a first-class value).
- Dexie schema v2 (additive): new `journalEntries` table keyed by `id`, indexed on `tradeId`, `scope`, `updatedAt`. No data migration needed; the v1 stores declaration stays in place.
- `src/lib/storage/journal-entries-repo.ts`: CRUD + `listAllTradeIds` for the trade-history pencil icon. [+6 integration tests]
- TanStack Query hooks in `src/features/journal/hooks/`:
  - `useTradeJournalEntry(tradeId)` — read/save/remove. Mutations invalidate both `['journal', 'trade', tradeId]` and `['journal', 'trade-ids']` so the history pencil updates immediately.
  - `useJournalEntryIds()` — returns `Set<tradeId>` for the pencil icon.
  - [+4 and +2 tests]
- `TriStateRadio` — reusable 3-option radio group (Yes / No / Unanswered). [+5 tests]
- `TradeJournalForm` — six fields (three textareas + mood select + two TriStateRadio groups). Autosave-on-blur with form-level status machine (clean / dirty / saving / saved / error) and "Saved at HH:MM" chip. `isDraftEmpty` skips writes when the form is entirely default, so users navigating through trades without typing never create dead rows. [+6 tests]
- `/w/:address/t/:tradeId` route with `TradeDetail.tsx` page — coin + side + status badges in the header, 8-cell trade summary grid (opened/closed dates, avgEntry/Exit, size, realized PnL, fees, hold time), journal form below. Invalid tradeId redirects to `/w/:address`. [+2 tests]
- `TradeHistoryList` — rows became `<Link>`s (role="row" on <a> is valid ARIA), preserving the existing rowgroup/columnheader/cell chain. Pencil icon renders inline with the coin cell when `useJournalEntryIds().has(tradeId)`. `aria-label="Has journal notes"` for screen readers. WalletView now passes the address prop through. [+2 tests on top of existing 7]
- Export/import extension (additive per CONVENTIONS §13):
  - `ExportData.journalEntries?: Array<JournalEntry> | undefined`
  - `MergeResult.summary.journalEntriesImported: number`
  - `ExportSnapshot.journalEntries: Array<JournalEntry>`
  - `buildExport` includes `journalEntries` in both includeCache branches (journals aren't regenerable like fillsCache; they always travel with the export).
  - `mergeImport` passes entries through with upsert-by-id semantics.
  - `createImportRepo.applyMerge` writes inside the existing Dexie transaction — all four tables now atomic.
  - `ImportPanel` summary copy extends with "N journal entries".
  - [+1 cases each across 5 test files]
- Playwright: `e2e/journal-roundtrip.spec.ts` — two tests covering type→blur→reload persistence and pencil-icon-after-save. [+2 E2E tests]
- End state: **[TODO fill in with final count]** unit tests, **5** E2E tests passing. Gauntlet clean.

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

**Gotchas for next session:**

- `JournalEntry.scope` is the discriminator for 7b/7c. When adding 'session' and 'strategy' scopes, update the Zod schema (literal 'trade' → enum) and extend the repo with scope-aware queries.
- `TradeHistoryList` rows are now `<Link>` elements. `role="row"` on an anchor is valid ARIA; keep that in mind if the virtualizer gets refactored.
- `useJournalEntryIds` invalidates on every save/remove. Cheap for Phase 1 data volumes (read-all-and-dedupe); revisit if entries hit the thousands.
- `ExportData.journalEntries` is always present in exports (empty array when the wallet has no journals). Only `fillsCache` is gated by the includeCache toggle. Phase 3+ journal scopes will ship in the same array keyed by `scope`.
- `TradeJournalForm` hydrates once on the first successful query, then treats its local `draft` as the source of truth. Multi-tab editing of the same entry will diverge silently — BACKLOG if it becomes a real problem.
- The empty-form-blur check (`isDraftEmpty && !hook.entry`) is load-bearing for "no dead rows." If a new field is added, extend `isDraftEmpty` to match.
- When typing and navigating away via `<Link>` click, the in-progress field's blur may not fire before unmount. Users need to see the "Saved at" chip to know their work is safe. BACKLOG.

**Invariants assumed:**

- One journal entry per trade (scope='trade'). Multi-entry per trade is not supported in Session 7a.
- Entry IDs are UUID v4 generated at first save via `crypto.randomUUID()`. Stable across reloads because the mutation reuses `hook.entry.id` once an entry exists.
- `createdAt` is set once at first save; `updatedAt` advances on every subsequent save. Both are Unix ms.
- `provenance` is always `'observed'` for user-authored entries. Future AI-generated journal content would carry `'inferred'`.
- Dexie schema v2 is a hard cutover — browsers that opened v1 upgrade on next open. Downgrade is NOT supported by Dexie.

---
```

Replace the `[TODO fill in with final count]` with the actual number from `pnpm test:coverage` after running it in Step 9.4.

- [ ] **Step 9.2: Append BACKLOG entries**

Append at the end of `docs/BACKLOG.md`:

```markdown

---

## Session 7a deferrals

- `[next]` Session/day journal scope — Session 7b. Extends `JournalEntry.scope` to include `'session'`. Keyed by date (YYYY-MM-DD) rather than tradeId. Fields per plan §11.8 Section B: market conditions, mindset, discipline score, mistakes, summary, what to repeat, what to avoid.
- `[next]` Strategy/setup journal scope + tags — Session 7c. Extends `JournalEntry.scope` to include `'strategy'`. Introduces a cross-cutting `tags` concept for linking trades to strategy names.
- `[next]` Screenshots/images for journal entries — Session 7d. Its own design: IndexedDB blob storage, thumbnail generation, quota handling. Fields per plan §11.8.
- `[maybe]` Edit history / versioning of journal entries. An append-only `journalEntryVersions` table keyed by `(entryId, updatedAt)` — every save creates a version row. "View history" drawer on the detail page.
- `[maybe]` Filter trade history by "has notes" / "no notes". Ties into the Phase 2 filter panel; low value before that lands.
- `[maybe]` Selective import of journal entries. Per-entry checkboxes in the ImportPanel dry-run summary. Useful for merging two partial exports without pulling in unwanted entries.
- `[later]` NanoGPT prompt generation from journal entries — Phase 4. Journal content is rich prompt material for AI review summaries.
- `[maybe]` Per-field save status on `TradeJournalForm`. Current form-level status may feel too coarse when the user has typed in multiple fields and only one save fails. Revisit if users report confusion.
- `[maybe]` Multi-entry per trade. Some journaling workflows treat notes as a log ("entry at 9:01 AM", "entry at 11:15 AM"). Extend from `findByTradeId` returning one entry to returning an array. Not useful until multiple users ask.
- `[maybe]` Unsaved-changes warning on navigation. `useBlocker` or `beforeunload` handler when the form status is `dirty`. Current behavior: blur-on-click-of-Link often doesn't fire before navigation, so the in-progress field's edit is lost.
- `[maybe]` Multi-tab editing conflict resolution. Two tabs open on the same trade-detail page would silently overwrite each other on save. A last-writer-wins broadcast channel or just a warning.
```

- [ ] **Step 9.3: Append CONVENTIONS §15 — Journaling**

Append at the end of `docs/CONVENTIONS.md`:

```markdown

---

## 15. Journaling

- **Scope discriminator.** `JournalEntry.scope` is the discriminator string on every entry. Session 7a uses only `'trade'`; 7b/7c extend the enum to `'session'` and `'strategy'`. Queries that target a specific scope MUST filter on the indexed `scope` field.
- **One-entry-per-trade.** For the `'trade'` scope, there is exactly one entry per tradeId. Saves overwrite by `id` (not append). Multi-entry is a BACKLOG item.
- **Autosave on blur.** Journal forms persist the draft to Dexie on every field's `onBlur` — no Save button. `isDraftEmpty` short-circuits writes when nothing has been typed, so navigating through trades without journaling never creates dead rows. Status machine on the form: `clean | dirty | saving | saved | error`. "Saved at HH:MM" chip communicates when the work is safe.
- **Tri-state booleans.** `planFollowed` and `stopLossUsed` are `boolean | null` — null means "unanswered" and is a first-class value. Forcing a yes/no up front pushes users toward whichever answer is less emotionally loaded.
- **Mood enum, not free text.** Mood is a five-value enum (`calm | confident | anxious | greedy | regretful`) plus null. Pattern detection and Phase 4 AI integration depend on a stable vocabulary; free-text moods would be unqueryable.
- **Entry IDs.** UUID v4 via `crypto.randomUUID()`, generated at first save. Native browser API — no runtime dependency.
- **Additive schema bumps.** New Dexie tables are added via `this.version(N).stores({...})` with the previous version's declaration kept in place. No `.upgrade()` callback is needed unless existing rows need transforming.
- **Journaling export.** Journal entries always travel with exports (unlike `fillsCache`, which is user-regenerable and gated by the `includeCache` toggle). Journals are user-authored and small.
- **Trade-history pencil icon.** `useJournalEntryIds` returns `Set<string>` of tradeIds with entries; `TradeHistoryList` consults it per render and renders a pencil SVG inline with the coin cell. `aria-label="Has journal notes"` for screen readers. Mutations on journal entries invalidate this query so the icon updates immediately.
```

- [ ] **Step 9.4: Final full gauntlet**

```bash
pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build && pnpm test:e2e
```

Expected: all green. Domain coverage ≥ 90%.

- [ ] **Step 9.5: Record final counts in SESSION_LOG**

Replace `[TODO fill in with final count]` in the SESSION_LOG entry with the actual number from the `pnpm test:coverage` run.

- [ ] **Step 9.6: Commit**

```bash
git add docs/SESSION_LOG.md docs/BACKLOG.md docs/CONVENTIONS.md
git commit -m "$(cat <<'EOF'
docs: record Session 7a session log, backlog, conventions

Captures the trade-journal foundation session: JournalEntry entity,
Dexie v2 schema, repo + hooks + TradeJournalForm with autosave-on-blur,
TradeDetail route, clickable history rows + pencil icon, export/import
extension, Playwright journal round-trip.

Adds CONVENTIONS §15 (Journaling) covering scope discriminator,
one-entry-per-trade, autosave semantics, tri-state booleans,
mood enum, UUID generation, additive schema bumps, and the pencil
icon pattern. Files 11 Session 7a BACKLOG entries, none of which
block v1 acceptance now that §24 #5 trade-notes surface ships.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9.7: Verify clean state**

```bash
git status && git log --oneline -25
```

Expected: working tree clean; Session 7a commits land from `1ccd950` onward.

---

## Success criteria (copy from spec §Acceptance)

1. `/w/:address/t/:tradeId` route renders the trade summary card + journal form. Invalid tradeId redirects to `/w/:address`.
2. Typing in any form field and blurring persists the entry. Reloading shows the data. Empty-form blurs do NOT create a row.
3. Trade-history rows with journal entries render a pencil icon; clicking navigates to the detail route.
4. Export (via `/settings`) includes `journalEntries` when present; importing into a fresh browser context restores them.
5. `pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build` green. Domain coverage ≥ 90%.
6. `pnpm test:e2e` — new journal round-trip + existing Session 6 specs all pass.
7. SESSION_LOG + BACKLOG + CONVENTIONS (+§15 Journaling) updated.
