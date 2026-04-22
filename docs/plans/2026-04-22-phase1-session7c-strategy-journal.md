# Phase 1 Session 7c — Strategy/setup Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the strategy/setup journal scope as the third variant on the `JournalEntry` discriminated union. New `/strategies` list + `/s/:id` detail routes. Trade + session journals from 7a/7b untouched.

**Architecture:** Same pattern as Sessions 7a/7b. No Dexie bump (v3's `scope + updatedAt` indexes already cover strategy listing). Zod discriminated union grows a third branch. Strategies are wallet-agnostic like sessions (trader-level reference material).

**Tech Stack:** No new dependencies. React/Router, Dexie, TanStack Query, Zod, Playwright.

---

## File structure (at end of session)

```
HyperJournal/
├── src/
│   ├── entities/
│   │   └── journal-entry.ts                           MODIFY (+StrategyJournalEntry variant)
│   ├── lib/
│   │   ├── storage/
│   │   │   ├── journal-entries-repo.ts                MODIFY (+findStrategyById, +listStrategies)
│   │   │   └── journal-entries-repo.test.ts           MODIFY (+cases)
│   │   └── validation/
│   │       ├── export.ts                              MODIFY (+StrategyJournalEntrySchema in union)
│   │       └── export.test.ts                         MODIFY (+cases)
│   ├── features/
│   │   └── journal/
│   │       ├── hooks/
│   │       │   ├── useStrategyEntry.ts                NEW
│   │       │   ├── useStrategyEntry.test.tsx          NEW
│   │       │   ├── useStrategies.ts                   NEW
│   │       │   ├── useStrategies.test.tsx             NEW
│   │       │   ├── useCreateStrategy.ts               NEW
│   │       │   └── useCreateStrategy.test.tsx         NEW
│   │       ├── components/
│   │       │   ├── StrategyJournalForm.tsx            NEW
│   │       │   ├── StrategyJournalForm.test.tsx       NEW
│   │       │   ├── JournalPanel.tsx                   MODIFY (+Strategies link)
│   │       │   └── JournalPanel.test.tsx              MODIFY (+1 case)
│   │       └── index.ts                               MODIFY (+exports)
│   └── app/
│       ├── routes.tsx                                 MODIFY (+/strategies, +/s/:id)
│       ├── Strategies.tsx                             NEW — list page
│       ├── Strategies.test.tsx                        NEW
│       ├── StrategyDetail.tsx                         NEW — detail page
│       └── StrategyDetail.test.tsx                    NEW
├── e2e/
│   └── strategy-journal-roundtrip.spec.ts             NEW
└── docs/
    ├── SESSION_LOG.md                                 MODIFY (+Session 7c entry)
    ├── BACKLOG.md                                     MODIFY (+8 entries)
    └── CONVENTIONS.md                                 MODIFY (§15 amended)
```

---

## Conventions (for every task)

- Commands from `/Users/angel/Documents/HyperJournal`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- TDD for repo + hooks. Component tests via RTL. Final E2E via Playwright.
- Gauntlet after every code task: `pnpm typecheck && pnpm lint && pnpm test`. Final full gauntlet + E2E at Task 11.

---

## Task 1: Entity — add `StrategyJournalEntry` variant

**Files:**
- Modify: `src/entities/journal-entry.ts`

- [ ] **Step 1.1: Append the variant and extend the union**

Read `src/entities/journal-entry.ts`, then append after `SessionJournalEntry` (before the `JournalEntry` union):

```ts
/**
 * Strategy/setup-scoped journal entry. Introduced in Session 7c.
 * Wallet-agnostic (trader-level reference material — the setup belongs
 * to the trader, not to a specific wallet). Keyed by UUID so renaming
 * doesn't break any future cross-references.
 *
 * `name` is a regular content field the user can edit at any time. The
 * detail page heading reads the live name; blank names render as
 * "Untitled" but remain valid data.
 */
export type StrategyJournalEntry = {
  readonly id: string;
  readonly scope: 'strategy';
  readonly createdAt: number;
  readonly updatedAt: number;

  readonly name: string;
  readonly conditions: string;
  readonly invalidation: string;
  readonly idealRR: string; // free-form: "2:1", "2-3:1", "3R min"
  readonly examples: string;
  readonly recurringMistakes: string;
  readonly notes: string;

  readonly provenance: Provenance;
};
```

Replace the existing `JournalEntry` type at the bottom of the file:

```ts
export type JournalEntry =
  | TradeJournalEntry
  | SessionJournalEntry
  | StrategyJournalEntry;
```

- [ ] **Step 1.2: Typecheck — expect cascading errors**

```bash
pnpm typecheck 2>&1 | head -30
```

Expected: typecheck errors surface in callers that destructure or access union fields without scope narrowing. These get fixed in Task 2. Don't commit yet.

---

## Task 2: Repo extensions + caller fixes

Add `findStrategyById` + `listStrategies`. Verify no trade/session repo method leaks strategy rows.

**Files:**
- Modify: `src/lib/storage/journal-entries-repo.ts`
- Modify: `src/lib/storage/journal-entries-repo.test.ts`

- [ ] **Step 2.1: Extend the repo**

Rewrite the exported `JournalEntriesRepo` type and add the two new methods in `src/lib/storage/journal-entries-repo.ts`:

```ts
import type {
  JournalEntry,
  SessionJournalEntry,
  StrategyJournalEntry,
  TradeJournalEntry,
} from '@entities/journal-entry';
import type { HyperJournalDb } from './db';

export type JournalEntriesRepo = {
  findByTradeId(tradeId: string): Promise<TradeJournalEntry | null>;
  findByDate(date: string): Promise<SessionJournalEntry | null>;
  findStrategyById(id: string): Promise<StrategyJournalEntry | null>;
  upsert(entry: JournalEntry): Promise<void>;
  remove(id: string): Promise<void>;
  listAll(): Promise<ReadonlyArray<JournalEntry>>;
  listAllTradeIds(): Promise<Set<string>>;
  listSessionEntries(limit?: number): Promise<ReadonlyArray<SessionJournalEntry>>;
  listStrategies(limit?: number): Promise<ReadonlyArray<StrategyJournalEntry>>;
};

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
    async findStrategyById(id) {
      const entry = await db.journalEntries.get(id);
      if (!entry || entry.scope !== 'strategy') return null;
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
      return new Set(rows.map((r) => (r as TradeJournalEntry).tradeId));
    },
    async listSessionEntries(limit = 7) {
      const rows = await db.journalEntries
        .where('scope')
        .equals('session')
        .toArray();
      const sessions = rows as SessionJournalEntry[];
      sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      return sessions.slice(0, limit);
    },
    async listStrategies(limit) {
      const rows = await db.journalEntries
        .where('scope')
        .equals('strategy')
        .toArray();
      const strategies = rows as StrategyJournalEntry[];
      strategies.sort((a, b) => b.updatedAt - a.updatedAt);
      return limit === undefined ? strategies : strategies.slice(0, limit);
    },
  };
}
```

- [ ] **Step 2.2: Extend the repo tests**

In `src/lib/storage/journal-entries-repo.test.ts`, add a `makeStrategyEntry` factory and three new tests.

Near the existing `makeSessionEntry`, add:

```ts
function makeStrategyEntry(overrides: Partial<StrategyJournalEntry> = {}): JournalEntry {
  return {
    id: 'strat-1',
    scope: 'strategy',
    createdAt: 100,
    updatedAt: 100,
    name: '',
    conditions: '',
    invalidation: '',
    idealRR: '',
    examples: '',
    recurringMistakes: '',
    notes: '',
    provenance: 'observed',
    ...overrides,
  } as JournalEntry;
}
```

Update the import line at the top:

```ts
import type {
  JournalEntry,
  SessionJournalEntry,
  StrategyJournalEntry,
} from '@entities/journal-entry';
```

Append new test cases at the end of the `describe('createJournalEntriesRepo', ...)` block:

```ts
  it('findStrategyById returns the strategy entry when one exists', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeStrategyEntry({ id: 's1', name: 'Breakout' }));
    const found = await repo.findStrategyById('s1');
    expect(found?.name).toBe('Breakout');
    expect(found?.scope).toBe('strategy');
  });

  it('findStrategyById returns null when the id is a different scope', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeTradeEntry({ id: 'x' }));
    expect(await repo.findStrategyById('x')).toBeNull();
  });

  it('listStrategies returns strategy-scope rows ordered by updatedAt desc', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeStrategyEntry({ id: 'old', name: 'A', updatedAt: 100 }));
    await repo.upsert(makeStrategyEntry({ id: 'new', name: 'B', updatedAt: 300 }));
    await repo.upsert(makeSessionEntry({ id: 'sess', updatedAt: 200 }));
    const result = await repo.listStrategies();
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('new');
    expect(result[1]!.id).toBe('old');
  });

  it('listStrategies respects the limit arg', async () => {
    const repo = createJournalEntriesRepo(db);
    for (let i = 0; i < 4; i++) {
      await repo.upsert(
        makeStrategyEntry({ id: `s${i}`, name: `S${i}`, updatedAt: i }),
      );
    }
    expect(await repo.listStrategies(2)).toHaveLength(2);
  });

  it('listSessionEntries + listAllTradeIds do not leak strategy rows', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeStrategyEntry({ id: 's1', name: 'Breakout' }));
    expect(await repo.listSessionEntries()).toEqual([]);
    expect((await repo.listAllTradeIds()).size).toBe(0);
  });
```

- [ ] **Step 2.3: Gauntlet**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green. If any older test hits a narrowing error from the widened union, add a `scope !== 'strategy'` guard or hoist an inline literal to a typed variable (see the CONVENTIONS §15 note on Dexie union-shape literals).

- [ ] **Step 2.4: Commit Task 1 + Task 2 together**

```bash
git add src/entities/journal-entry.ts \
        src/lib/storage/journal-entries-repo.ts \
        src/lib/storage/journal-entries-repo.test.ts
git commit -m "$(cat <<'EOF'
feat(journal): add StrategyJournalEntry variant + repo methods

Third branch on the JournalEntry discriminated union. Seven fields
(name, conditions, invalidation, idealRR free-text, examples,
recurringMistakes, notes) per plan §11.8 Section C. Wallet-agnostic
like session entries — the setup describes the trader's repertoire,
not a specific wallet.

Repo gains findStrategyById (scope-gated via scope !== 'strategy' guard)
and listStrategies (scope-filtered, in-memory sort by updatedAt desc,
optional limit). listSessionEntries + listAllTradeIds already scope-gate
so strategy rows can't leak into session or trade consumers.

No Dexie schema bump — v3's scope + updatedAt indexes cover strategy
listing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `useStrategyEntry` hook

Read + save + remove for a single strategy by id.

**Files:**
- Create: `src/features/journal/hooks/useStrategyEntry.ts`
- Create: `src/features/journal/hooks/useStrategyEntry.test.tsx`
- Modify: `src/features/journal/index.ts`

- [ ] **Step 3.1: Write the failing test (RED)**

Create `src/features/journal/hooks/useStrategyEntry.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useStrategyEntry } from './useStrategyEntry';
import { HyperJournalDb } from '@lib/storage/db';
import type { StrategyJournalEntry } from '@entities/journal-entry';

let db: HyperJournalDb;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  db = new HyperJournalDb(`hj-strategy-hook-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

function makeEntry(overrides: Partial<StrategyJournalEntry> = {}): StrategyJournalEntry {
  return {
    id: 's1',
    scope: 'strategy',
    createdAt: 100,
    updatedAt: 100,
    name: '',
    conditions: '',
    invalidation: '',
    idealRR: '',
    examples: '',
    recurringMistakes: '',
    notes: '',
    provenance: 'observed',
    ...overrides,
  };
}

describe('useStrategyEntry', () => {
  it('returns null when no entry exists for the id', async () => {
    const { result } = renderHook(() => useStrategyEntry('s1', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entry).toBeNull();
  });

  it('returns the entry when one exists', async () => {
    await db.journalEntries.put(makeEntry({ name: 'Breakout' }));
    const { result } = renderHook(() => useStrategyEntry('s1', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entry?.name).toBe('Breakout');
  });

  it('save() upserts and refreshes the query', async () => {
    const { result } = renderHook(() => useStrategyEntry('s1', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.save(makeEntry({ name: 'new' }));
    });
    await waitFor(() => expect(result.current.entry?.name).toBe('new'));
  });
});
```

- [ ] **Step 3.2: Run — confirm RED**

```bash
pnpm test src/features/journal/hooks/useStrategyEntry.test.tsx
```

Expected: "Cannot find module './useStrategyEntry'".

- [ ] **Step 3.3: Implement `src/features/journal/hooks/useStrategyEntry.ts`**

```ts
import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createJournalEntriesRepo } from '@lib/storage/journal-entries-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { StrategyJournalEntry } from '@entities/journal-entry';

type Options = { db?: HyperJournalDb };

export type UseStrategyEntryResult = {
  entry: StrategyJournalEntry | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  save: (entry: StrategyJournalEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

/**
 * Read/write the strategy journal entry for a given id (UUID).
 * Mutations invalidate this query + the strategies listing query so
 * the /strategies list updates immediately.
 */
export function useStrategyEntry(
  id: string,
  options: Options = {},
): UseStrategyEntryResult {
  const db = options.db ?? defaultDb;
  const repo = useMemo(() => createJournalEntriesRepo(db), [db]);
  const queryClient = useQueryClient();

  const query = useQuery<StrategyJournalEntry | null>({
    queryKey: ['journal', 'strategy', id],
    queryFn: () => repo.findStrategyById(id),
  });

  const saveMutation = useMutation({
    mutationFn: (entry: StrategyJournalEntry) => repo.upsert(entry),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['journal', 'strategy', id] });
      await queryClient.invalidateQueries({ queryKey: ['journal', 'strategies'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (rid: string) => repo.remove(rid),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['journal', 'strategy', id] });
      await queryClient.invalidateQueries({ queryKey: ['journal', 'strategies'] });
    },
  });

  const save = useCallback(
    async (entry: StrategyJournalEntry) => {
      await saveMutation.mutateAsync(entry);
    },
    [saveMutation],
  );

  const remove = useCallback(
    async (rid: string) => {
      await removeMutation.mutateAsync(rid);
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

- [ ] **Step 3.4: Export from feature index**

In `src/features/journal/index.ts`, add:

```ts
export { useStrategyEntry } from './hooks/useStrategyEntry';
```

- [ ] **Step 3.5: Run — confirm GREEN + gauntlet**

```bash
pnpm test src/features/journal/hooks/useStrategyEntry.test.tsx && pnpm typecheck && pnpm lint
```

Expected: 3 tests pass.

- [ ] **Step 3.6: Commit**

```bash
git add src/features/journal/hooks/useStrategyEntry.ts \
        src/features/journal/hooks/useStrategyEntry.test.tsx \
        src/features/journal/index.ts
git commit -m "$(cat <<'EOF'
feat(journal): add useStrategyEntry hook

Parallel to useTradeJournalEntry and useSessionJournalEntry but keyed
on a UUID id. Mutations invalidate both the per-id query and the
['journal', 'strategies'] listing so /strategies updates after saves.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `useStrategies` + `useCreateStrategy` hooks

Listing + creation.

**Files:**
- Create: `src/features/journal/hooks/useStrategies.ts`
- Create: `src/features/journal/hooks/useStrategies.test.tsx`
- Create: `src/features/journal/hooks/useCreateStrategy.ts`
- Create: `src/features/journal/hooks/useCreateStrategy.test.tsx`
- Modify: `src/features/journal/index.ts`

- [ ] **Step 4.1: Write failing tests for `useStrategies` (RED)**

Create `src/features/journal/hooks/useStrategies.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useStrategies } from './useStrategies';
import { HyperJournalDb } from '@lib/storage/db';
import type { StrategyJournalEntry } from '@entities/journal-entry';

let db: HyperJournalDb;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  db = new HyperJournalDb(`hj-strategies-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

function makeStrategy(overrides: Partial<StrategyJournalEntry>): StrategyJournalEntry {
  return {
    id: 's',
    scope: 'strategy',
    createdAt: 0,
    updatedAt: 0,
    name: '',
    conditions: '',
    invalidation: '',
    idealRR: '',
    examples: '',
    recurringMistakes: '',
    notes: '',
    provenance: 'observed',
    ...overrides,
  };
}

describe('useStrategies', () => {
  it('returns an empty array when no strategies exist', async () => {
    const { result } = renderHook(() => useStrategies({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries).toEqual([]);
  });

  it('returns strategies sorted by updatedAt desc', async () => {
    await db.journalEntries.put(
      makeStrategy({ id: 'old', name: 'Old', updatedAt: 100 }),
    );
    await db.journalEntries.put(
      makeStrategy({ id: 'new', name: 'New', updatedAt: 300 }),
    );
    const { result } = renderHook(() => useStrategies({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries[0]!.id).toBe('new');
  });
});
```

- [ ] **Step 4.2: Run — confirm RED**

```bash
pnpm test src/features/journal/hooks/useStrategies.test.tsx
```

Expected: "Cannot find module './useStrategies'".

- [ ] **Step 4.3: Implement `src/features/journal/hooks/useStrategies.ts`**

```ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createJournalEntriesRepo } from '@lib/storage/journal-entries-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { StrategyJournalEntry } from '@entities/journal-entry';

type Options = { db?: HyperJournalDb; limit?: number };

export type UseStrategiesResult = {
  entries: ReadonlyArray<StrategyJournalEntry>;
  isLoading: boolean;
};

const EMPTY_LIST: ReadonlyArray<StrategyJournalEntry> = Object.freeze([]);

/**
 * Returns every strategy ordered by updatedAt desc. Default: no limit.
 * Consumed by the /strategies list page.
 */
export function useStrategies(options: Options = {}): UseStrategiesResult {
  const db = options.db ?? defaultDb;
  const limit = options.limit;
  const repo = useMemo(() => createJournalEntriesRepo(db), [db]);

  const query = useQuery<ReadonlyArray<StrategyJournalEntry>>({
    queryKey: ['journal', 'strategies', limit ?? 'all'],
    queryFn: () => repo.listStrategies(limit),
  });

  return {
    entries: query.data ?? EMPTY_LIST,
    isLoading: query.isLoading,
  };
}
```

- [ ] **Step 4.4: Write failing tests for `useCreateStrategy` (RED)**

Create `src/features/journal/hooks/useCreateStrategy.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useCreateStrategy } from './useCreateStrategy';
import { useStrategies } from './useStrategies';
import { HyperJournalDb } from '@lib/storage/db';

let db: HyperJournalDb;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  db = new HyperJournalDb(`hj-createstrat-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

describe('useCreateStrategy', () => {
  it('creates a row with a UUID id and scope=strategy', async () => {
    const { result } = renderHook(() => useCreateStrategy({ db }), { wrapper });
    let newId = '';
    await act(async () => {
      newId = await result.current.create('Breakout');
    });
    expect(newId).toMatch(/^[0-9a-f-]{36}$/i);
    const row = await db.journalEntries.get(newId);
    expect(row?.scope).toBe('strategy');
    if (row?.scope !== 'strategy') throw new Error('expected strategy');
    expect(row.name).toBe('Breakout');
    expect(row.conditions).toBe('');
  });

  it('invalidates the strategies listing query', async () => {
    const listResult = renderHook(() => useStrategies({ db }), { wrapper });
    await waitFor(() => expect(listResult.result.current.isLoading).toBe(false));
    expect(listResult.result.current.entries).toHaveLength(0);

    // Re-render inside the same client so the create + list share cache
    // isn't possible here (separate wrapper = separate client). Instead,
    // verify that after create, a fresh useStrategies sees the row via the
    // repo (bypassing react-query's cache in a separate test scope).
    const createResult = renderHook(() => useCreateStrategy({ db }), { wrapper });
    await act(async () => {
      await createResult.result.current.create('X');
    });
    const rows = await db.journalEntries.toArray();
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 4.5: Run — confirm RED**

```bash
pnpm test src/features/journal/hooks/useCreateStrategy.test.tsx
```

Expected: "Cannot find module './useCreateStrategy'".

- [ ] **Step 4.6: Implement `src/features/journal/hooks/useCreateStrategy.ts`**

```ts
import { useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createJournalEntriesRepo } from '@lib/storage/journal-entries-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { StrategyJournalEntry } from '@entities/journal-entry';

type Options = { db?: HyperJournalDb };

export type UseCreateStrategyResult = {
  create: (name: string) => Promise<string>;
  isLoading: boolean;
};

/**
 * Creates a new strategy journal entry with the given name. Other
 * content fields start empty. Returns the new id (UUID v4) so the
 * caller can navigate to /s/:id immediately.
 */
export function useCreateStrategy(options: Options = {}): UseCreateStrategyResult {
  const db = options.db ?? defaultDb;
  const repo = useMemo(() => createJournalEntriesRepo(db), [db]);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (name: string) => {
      const now = Date.now();
      const id = crypto.randomUUID();
      const entry: StrategyJournalEntry = {
        id,
        scope: 'strategy',
        createdAt: now,
        updatedAt: now,
        name,
        conditions: '',
        invalidation: '',
        idealRR: '',
        examples: '',
        recurringMistakes: '',
        notes: '',
        provenance: 'observed',
      };
      await repo.upsert(entry);
      return id;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['journal', 'strategies'] });
    },
  });

  const create = useCallback(
    async (name: string) => mutation.mutateAsync(name),
    [mutation],
  );

  return {
    create,
    isLoading: mutation.isPending,
  };
}
```

- [ ] **Step 4.7: Export both from feature index**

In `src/features/journal/index.ts`, add:

```ts
export { useStrategies } from './hooks/useStrategies';
export { useCreateStrategy } from './hooks/useCreateStrategy';
```

- [ ] **Step 4.8: Run — confirm GREEN + gauntlet**

```bash
pnpm test src/features/journal/hooks/ && pnpm typecheck && pnpm lint
```

Expected: green.

- [ ] **Step 4.9: Commit**

```bash
git add src/features/journal/hooks/useStrategies.ts \
        src/features/journal/hooks/useStrategies.test.tsx \
        src/features/journal/hooks/useCreateStrategy.ts \
        src/features/journal/hooks/useCreateStrategy.test.tsx \
        src/features/journal/index.ts
git commit -m "$(cat <<'EOF'
feat(journal): add useStrategies + useCreateStrategy hooks

useStrategies lists all strategy entries ordered by updatedAt desc;
cheap to compute for Phase 1 data volumes (read-all, in-memory sort).
Default no limit — the /strategies page can cap if UX proves slow.

useCreateStrategy generates a UUID, writes an empty-content row with
the given name, and returns the id so the caller can navigate to
/s/:id for immediate editing. Invalidates ['journal', 'strategies']
on success.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `StrategyJournalForm` component

Seven-field form with autosave-on-blur. Pattern mirrors `TradeJournalForm` and `SessionJournalForm`.

**Files:**
- Create: `src/features/journal/components/StrategyJournalForm.tsx`
- Create: `src/features/journal/components/StrategyJournalForm.test.tsx`
- Modify: `src/features/journal/index.ts`

- [ ] **Step 5.1: Write failing tests (RED)**

Create `src/features/journal/components/StrategyJournalForm.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrategyJournalForm } from './StrategyJournalForm';
import { HyperJournalDb } from '@lib/storage/db';
import type { StrategyJournalEntry } from '@entities/journal-entry';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`hj-strat-form-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

async function seed(entry: Partial<StrategyJournalEntry>) {
  const full: StrategyJournalEntry = {
    id: 's1',
    scope: 'strategy',
    createdAt: 100,
    updatedAt: 100,
    name: '',
    conditions: '',
    invalidation: '',
    idealRR: '',
    examples: '',
    recurringMistakes: '',
    notes: '',
    provenance: 'observed',
    ...entry,
  };
  await db.journalEntries.put(full);
}

function renderForm(id = 's1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StrategyJournalForm id={id} db={db} />
    </QueryClientProvider>,
  );
}

describe('StrategyJournalForm', () => {
  it('renders the seven fields', async () => {
    await seed({ id: 's1' });
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/conditions/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/invalidation/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ideal r:r/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/examples/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/recurring mistakes/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^notes$/i)).toBeInTheDocument();
  });

  it('pre-populates from an existing entry', async () => {
    await seed({ id: 's1', name: 'Breakout', idealRR: '2:1' });
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/^name$/i)).toHaveValue('Breakout'));
    expect(screen.getByLabelText(/ideal r:r/i)).toHaveValue('2:1');
  });

  it('saves name changes on blur', async () => {
    await seed({ id: 's1', name: 'Original' });
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/^name$/i)).toHaveValue('Original'));
    const field = screen.getByLabelText(/^name$/i);
    fireEvent.change(field, { target: { value: 'Renamed' } });
    fireEvent.blur(field);
    await waitFor(() => expect(screen.getByText(/saved at/i)).toBeInTheDocument());
    const row = await db.journalEntries.get('s1');
    if (!row || row.scope !== 'strategy') throw new Error('expected strategy');
    expect(row.name).toBe('Renamed');
  });

  it('saves conditions on blur', async () => {
    await seed({ id: 's1', name: 'Breakout' });
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/conditions/i)).toBeInTheDocument());
    const field = screen.getByLabelText(/conditions/i);
    fireEvent.change(field, { target: { value: 'clear resistance break' } });
    fireEvent.blur(field);
    await waitFor(async () => {
      const row = await db.journalEntries.get('s1');
      if (!row || row.scope !== 'strategy') throw new Error('expected strategy');
      expect(row.conditions).toBe('clear resistance break');
    });
  });

  it('redirects the user gracefully when the entry does not exist', async () => {
    // The form renders with id that doesn't exist in Dexie. Since this is
    // a component-level concern (not routing), the form simply shows no
    // pre-populated data and does nothing on blur (isDraftEmpty + !entry).
    renderForm('does-not-exist');
    await waitFor(() =>
      expect(screen.getByLabelText(/^name$/i)).toHaveValue(''),
    );
    fireEvent.blur(screen.getByLabelText(/^name$/i));
    await new Promise((r) => setTimeout(r, 50));
    // Empty-form blur with no existing entry should NOT create a row.
    expect(await db.journalEntries.count()).toBe(0);
  });
});
```

- [ ] **Step 5.2: Run — confirm RED**

```bash
pnpm test src/features/journal/components/StrategyJournalForm.test.tsx
```

Expected: "Cannot find module './StrategyJournalForm'".

- [ ] **Step 5.3: Implement `src/features/journal/components/StrategyJournalForm.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useStrategyEntry } from '../hooks/useStrategyEntry';
import { Input } from '@lib/ui/components/input';
import { Label } from '@lib/ui/components/label';
import { cn } from '@lib/ui/utils';
import type { StrategyJournalEntry } from '@entities/journal-entry';
import type { HyperJournalDb } from '@lib/storage/db';

type Props = {
  id: string;
  db?: HyperJournalDb;
};

type DraftState = {
  name: string;
  conditions: string;
  invalidation: string;
  idealRR: string;
  examples: string;
  recurringMistakes: string;
  notes: string;
};

type Status =
  | { kind: 'clean' }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string };

const EMPTY_DRAFT: DraftState = {
  name: '',
  conditions: '',
  invalidation: '',
  idealRR: '',
  examples: '',
  recurringMistakes: '',
  notes: '',
};

function isDraftEmpty(d: DraftState): boolean {
  return (
    d.name.trim() === '' &&
    d.conditions.trim() === '' &&
    d.invalidation.trim() === '' &&
    d.idealRR.trim() === '' &&
    d.examples.trim() === '' &&
    d.recurringMistakes.trim() === '' &&
    d.notes.trim() === ''
  );
}

function entryToDraft(entry: StrategyJournalEntry | null): DraftState {
  if (!entry) return { ...EMPTY_DRAFT };
  return {
    name: entry.name,
    conditions: entry.conditions,
    invalidation: entry.invalidation,
    idealRR: entry.idealRR,
    examples: entry.examples,
    recurringMistakes: entry.recurringMistakes,
    notes: entry.notes,
  };
}

function formatSavedAt(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function StrategyJournalForm({ id, db }: Props) {
  const hook = useStrategyEntry(id, db ? { db } : {});
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
    const entry: StrategyJournalEntry = {
      id: hook.entry?.id ?? id,
      scope: 'strategy',
      createdAt: hook.entry?.createdAt ?? now,
      updatedAt: now,
      name: next.name,
      conditions: next.conditions,
      invalidation: next.invalidation,
      idealRR: next.idealRR,
      examples: next.examples,
      recurringMistakes: next.recurringMistakes,
      notes: next.notes,
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
      aria-labelledby="strategy-journal-heading"
      className="flex flex-col gap-4 rounded-lg border border-border bg-bg-raised p-6"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="strategy-journal-heading" className="text-lg font-semibold text-fg-base">
          Strategy
        </h2>
        <StatusIndicator status={status} onRetry={onBlurCommit} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={draft.name}
          onChange={(e) => change('name', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="A short label for this setup"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="conditions">Conditions</Label>
        <textarea
          id="conditions"
          value={draft.conditions}
          onChange={(e) => change('conditions', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="What needs to be true in the market for this setup?"
          rows={3}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="invalidation">Invalidation</Label>
        <textarea
          id="invalidation"
          value={draft.invalidation}
          onChange={(e) => change('invalidation', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="What makes the setup wrong or the thesis dead?"
          rows={3}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="idealRR">Ideal R:R</Label>
        <Input
          id="idealRR"
          value={draft.idealRR}
          onChange={(e) => change('idealRR', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="2:1, 2-3:1, 3R min..."
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="examples">Examples</Label>
        <textarea
          id="examples"
          value={draft.examples}
          onChange={(e) => change('examples', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="Past trades or scenarios that fit this setup."
          rows={3}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="recurringMistakes">Recurring mistakes</Label>
        <textarea
          id="recurringMistakes"
          value={draft.recurringMistakes}
          onChange={(e) => change('recurringMistakes', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="What you keep doing wrong when this setup appears."
          rows={3}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          value={draft.notes}
          onChange={(e) => change('notes', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="Anything else — links to trades, evolving rules, questions."
          rows={4}
          className={textareaClass}
        />
      </div>
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

- [ ] **Step 5.4: Export from feature index**

In `src/features/journal/index.ts`, add:

```ts
export { StrategyJournalForm } from './components/StrategyJournalForm';
```

- [ ] **Step 5.5: Run — confirm GREEN + gauntlet**

```bash
pnpm test src/features/journal/components/StrategyJournalForm.test.tsx && pnpm typecheck && pnpm lint
```

Expected: 5 tests pass.

- [ ] **Step 5.6: Commit**

```bash
git add src/features/journal/components/StrategyJournalForm.tsx \
        src/features/journal/components/StrategyJournalForm.test.tsx \
        src/features/journal/index.ts
git commit -m "$(cat <<'EOF'
feat(journal): StrategyJournalForm with autosave-on-blur

Seven fields per spec: Input for name + idealRR (short), four
textareas for conditions / invalidation / examples / recurringMistakes,
one wider textarea for notes. Inherits the draftRef / hydration-guard /
isDraftEmpty / form-level status pattern from TradeJournalForm and
SessionJournalForm. "Saved at HH:MM" chip on success; loss-tone +
Retry on failure.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `/strategies` list page

**Files:**
- Create: `src/app/Strategies.tsx`
- Create: `src/app/Strategies.test.tsx`
- Modify: `src/app/routes.tsx`

- [ ] **Step 6.1: Write failing tests (RED)**

Create `src/app/Strategies.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Strategies } from './Strategies';
import { HyperJournalDb } from '@lib/storage/db';
import type { StrategyJournalEntry } from '@entities/journal-entry';

afterEach(() => cleanup());

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`hj-strats-page-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

function renderAt(path = '/strategies') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<div data-testid="home">home</div>} />
          <Route path="/strategies" element={<Strategies db={db} />} />
          <Route path="/s/:id" element={<div data-testid="detail">detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Strategies', () => {
  it('renders the page heading and Back link', () => {
    renderAt();
    expect(screen.getByRole('heading', { name: /^strategies$/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '/');
  });

  it('shows the empty state when no strategies exist', async () => {
    renderAt();
    await waitFor(() =>
      expect(screen.getByText(/no strategies yet/i)).toBeInTheDocument(),
    );
  });

  it('lists existing strategies with names and teasers', async () => {
    const entry: StrategyJournalEntry = {
      id: 'abc',
      scope: 'strategy',
      createdAt: 0,
      updatedAt: 100,
      name: 'Breakout',
      conditions: 'clear resistance break',
      invalidation: '',
      idealRR: '',
      examples: '',
      recurringMistakes: '',
      notes: '',
      provenance: 'observed',
    };
    await db.journalEntries.put(entry);
    renderAt();
    await waitFor(() => expect(screen.getByText(/breakout/i)).toBeInTheDocument());
    expect(screen.getByText(/clear resistance break/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /breakout/i })).toHaveAttribute('href', '/s/abc');
  });

  it('shows an inline error when submitting an empty name', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(screen.getByText(/give the strategy a name/i)).toBeInTheDocument();
  });

  it('creates a strategy on valid submit and navigates to /s/:id', async () => {
    renderAt();
    const input = await screen.findByLabelText(/new strategy name/i);
    fireEvent.change(input, { target: { value: 'Breakout' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => expect(screen.getByTestId('detail')).toBeInTheDocument());
    const rows = await db.journalEntries.toArray();
    expect(rows).toHaveLength(1);
    if (rows[0]!.scope !== 'strategy') throw new Error('expected strategy');
    expect(rows[0]!.name).toBe('Breakout');
  });
});
```

- [ ] **Step 6.2: Run — confirm RED**

```bash
pnpm test src/app/Strategies.test.tsx
```

Expected: "Cannot find module './Strategies'".

- [ ] **Step 6.3: Implement `src/app/Strategies.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCreateStrategy, useStrategies } from '@features/journal';
import { Button } from '@lib/ui/components/button';
import { Input } from '@lib/ui/components/input';
import { Label } from '@lib/ui/components/label';
import type { HyperJournalDb } from '@lib/storage/db';
import type { StrategyJournalEntry } from '@entities/journal-entry';

type Props = { db?: HyperJournalDb };

export function Strategies({ db }: Props) {
  const { entries, isLoading } = useStrategies(db ? { db } : {});
  const { create, isLoading: isCreating } = useCreateStrategy(db ? { db } : {});
  const navigate = useNavigate();

  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = draft.trim();
    if (name === '') {
      setError('Give the strategy a name.');
      return;
    }
    const id = await create(name);
    setDraft('');
    setError(null);
    navigate(`/s/${id}`);
  }

  return (
    <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-fg-base">Strategies</h1>
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

      <section
        aria-labelledby="new-strategy-heading"
        className="flex flex-col gap-3 rounded-lg border border-border bg-bg-raised p-6"
      >
        <h2 id="new-strategy-heading" className="sr-only">
          New strategy
        </h2>
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <Label htmlFor="new-strategy-name">New strategy name</Label>
          <div className="flex gap-2">
            <Input
              id="new-strategy-name"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Breakout, Mean-reversion, Trend follow"
              className="flex-1"
            />
            <Button type="submit" disabled={isCreating}>
              Create
            </Button>
          </div>
          {error && <p className="text-xs text-loss">{error}</p>}
        </form>
      </section>

      <section
        aria-labelledby="strategies-list-heading"
        className="flex flex-col gap-3 rounded-lg border border-border bg-bg-raised p-6"
      >
        <h2
          id="strategies-list-heading"
          className="text-lg font-semibold text-fg-base"
        >
          Your strategies
        </h2>

        {isLoading ? (
          <p className="text-sm text-fg-muted">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-fg-subtle">No strategies yet. Name one above to start.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((e) => (
              <li key={e.id}>
                <Link
                  to={`/s/${e.id}`}
                  className="flex flex-col gap-1 rounded-md border border-border bg-bg-overlay p-3 text-sm ring-offset-bg-base hover:bg-bg-overlay/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  <span className="font-semibold text-fg-base">
                    {e.name.trim() === '' ? 'Untitled' : e.name}
                  </span>
                  <span className="text-xs text-fg-muted">
                    Updated {formatShortDate(e.updatedAt)}
                  </span>
                  <span className="line-clamp-1 text-fg-base">{teaser(e)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function teaser(entry: StrategyJournalEntry): string {
  const priority = [
    entry.conditions,
    entry.invalidation,
    entry.notes,
    entry.recurringMistakes,
    entry.examples,
    entry.idealRR,
  ];
  for (const field of priority) {
    const first = field.split('\n')[0]?.trim();
    if (first) {
      return first.length > 60 ? `${first.slice(0, 59)}…` : first;
    }
  }
  return 'Empty content';
}
```

- [ ] **Step 6.4: Register the route**

In `src/app/routes.tsx`, add after `/d/:date` and before `/settings`:

```tsx
import { Strategies } from './Strategies';
// ...
    { path: '/d/:date', element: <DayDetail /> },
    { path: '/strategies', element: <Strategies /> },
    { path: '/settings', element: <Settings /> },
```

- [ ] **Step 6.5: Run — confirm GREEN + gauntlet**

```bash
pnpm test src/app/Strategies.test.tsx && pnpm typecheck && pnpm lint
```

Expected: 5 tests pass.

- [ ] **Step 6.6: Commit**

```bash
git add src/app/Strategies.tsx src/app/Strategies.test.tsx src/app/routes.tsx
git commit -m "$(cat <<'EOF'
feat(app): add /strategies list page

Header with Back + Settings links. Inline "+ New strategy" form with
name validation (empty submit shows inline loss-tone error). Valid
submit creates the row via useCreateStrategy and navigates to /s/:id
for immediate editing. Below: list of existing strategies ordered by
updatedAt desc — each row shows name (fallback "Untitled"), update
date, and a teaser from the first non-empty content field.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `/s/:id` detail page

**Files:**
- Create: `src/app/StrategyDetail.tsx`
- Create: `src/app/StrategyDetail.test.tsx`
- Modify: `src/app/routes.tsx`

- [ ] **Step 7.1: Write failing tests (RED)**

Create `src/app/StrategyDetail.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrategyDetail } from './StrategyDetail';
import { HyperJournalDb } from '@lib/storage/db';
import type { StrategyJournalEntry } from '@entities/journal-entry';

afterEach(() => cleanup());

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`hj-strat-detail-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

async function seed(entry: Partial<StrategyJournalEntry> & { id: string }) {
  const full: StrategyJournalEntry = {
    scope: 'strategy',
    createdAt: 100,
    updatedAt: 100,
    name: '',
    conditions: '',
    invalidation: '',
    idealRR: '',
    examples: '',
    recurringMistakes: '',
    notes: '',
    provenance: 'observed',
    ...entry,
  };
  await db.journalEntries.put(full);
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/strategies" element={<div data-testid="strategies-list">list</div>} />
          <Route path="/s/:id" element={<StrategyDetail db={db} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StrategyDetail', () => {
  it('redirects to /strategies when the id does not exist', async () => {
    renderAt('/s/does-not-exist');
    await waitFor(() => expect(screen.getByTestId('strategies-list')).toBeInTheDocument());
  });

  it('renders the strategy name as the heading and a form', async () => {
    await seed({ id: 'abc', name: 'Breakout' });
    renderAt('/s/abc');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/breakout/i);
    expect(screen.getByRole('heading', { level: 2, name: /^strategy$/i })).toBeInTheDocument();
  });

  it('shows "Untitled" when the name is blank', async () => {
    await seed({ id: 'abc', name: '' });
    renderAt('/s/abc');
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/untitled/i),
    );
  });
});
```

- [ ] **Step 7.2: Run — confirm RED**

```bash
pnpm test src/app/StrategyDetail.test.tsx
```

Expected: "Cannot find module './StrategyDetail'".

- [ ] **Step 7.3: Implement `src/app/StrategyDetail.tsx`**

```tsx
import { useParams, Navigate, Link } from 'react-router-dom';
import { StrategyJournalForm, useStrategyEntry } from '@features/journal';
import type { HyperJournalDb } from '@lib/storage/db';

type Props = { db?: HyperJournalDb };

export function StrategyDetail({ db }: Props) {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return <Navigate to="/strategies" replace />;
  }

  return <StrategyDetailInner id={id} db={db} />;
}

function StrategyDetailInner({ id, db }: { id: string; db?: HyperJournalDb }) {
  const hook = useStrategyEntry(id, db ? { db } : {});

  if (hook.isLoading) {
    return (
      <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
        <p className="text-fg-muted">Loading strategy…</p>
      </main>
    );
  }

  if (!hook.entry) {
    return <Navigate to="/strategies" replace />;
  }

  const headingName = hook.entry.name.trim() === '' ? 'Untitled' : hook.entry.name;

  return (
    <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-fg-base">{headingName}</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/settings"
            className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            Settings
          </Link>
          <Link
            to="/strategies"
            className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            ← Back
          </Link>
        </div>
      </header>

      <StrategyJournalForm id={id} {...(db ? { db } : {})} />
    </main>
  );
}
```

- [ ] **Step 7.4: Register the route**

In `src/app/routes.tsx`, add after `/strategies` and before `/settings`:

```tsx
import { StrategyDetail } from './StrategyDetail';
// ...
    { path: '/strategies', element: <Strategies /> },
    { path: '/s/:id', element: <StrategyDetail /> },
    { path: '/settings', element: <Settings /> },
```

- [ ] **Step 7.5: Run — confirm GREEN + gauntlet**

```bash
pnpm test src/app/StrategyDetail.test.tsx && pnpm typecheck && pnpm lint
```

Expected: 3 tests pass.

- [ ] **Step 7.6: Commit**

```bash
git add src/app/StrategyDetail.tsx src/app/StrategyDetail.test.tsx src/app/routes.tsx
git commit -m "$(cat <<'EOF'
feat(app): add /s/:id StrategyDetail page

Header shows the live strategy name (updates immediately as the user
renames in the form because useStrategyEntry invalidates and re-fetches).
Blank names render as "Untitled". Settings + Back links. Unknown ids
redirect to /strategies. StrategyJournalForm mounts below.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: JournalPanel "Strategies →" link

**Files:**
- Modify: `src/features/journal/components/JournalPanel.tsx`
- Modify: `src/features/journal/components/JournalPanel.test.tsx`

- [ ] **Step 8.1: Add the link**

In `src/features/journal/components/JournalPanel.tsx`, find the header block:

```tsx
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
```

Replace with:

```tsx
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="journal-panel-heading" className="text-lg font-semibold text-fg-base">
          Journal
        </h2>
        <div className="flex items-center gap-2">
          <Link to={`/d/${today}`}>
            <Button variant="default" size="sm">
              + Today's journal
            </Button>
          </Link>
          <Link
            to="/strategies"
            className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            Strategies →
          </Link>
        </div>
      </header>
```

- [ ] **Step 8.2: Add a test case**

In `src/features/journal/components/JournalPanel.test.tsx`, append to the `describe('JournalPanel', ...)` block:

```ts
  it('renders a "Strategies →" link to /strategies', () => {
    renderPanel();
    const link = screen.getByRole('link', { name: /strategies/i });
    expect(link).toHaveAttribute('href', '/strategies');
  });
```

- [ ] **Step 8.3: Run — confirm GREEN + gauntlet**

```bash
pnpm test src/features/journal/components/JournalPanel.test.tsx && pnpm typecheck && pnpm lint
```

Expected: green (5 tests now).

- [ ] **Step 8.4: Commit**

```bash
git add src/features/journal/components/JournalPanel.tsx \
        src/features/journal/components/JournalPanel.test.tsx
git commit -m "$(cat <<'EOF'
feat(journal): add Strategies → link to JournalPanel

Small underlined link next to the "+ Today's journal" CTA. No listing
of strategies inside the panel — /strategies owns that surface. Header
flex-wraps so the two affordances don't crowd each other on narrow
viewports.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Zod discriminated union — add strategy branch

**Files:**
- Modify: `src/lib/validation/export.ts`
- Modify: `src/lib/validation/export.test.ts`

- [ ] **Step 9.1: Extend the Zod schema**

In `src/lib/validation/export.ts`, find the `SessionJournalEntrySchema` and the `JournalEntrySchema` discriminated union. After `SessionJournalEntrySchema`, add `StrategyJournalEntrySchema`:

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

Update the discriminated union:

```ts
const JournalEntrySchema = z.discriminatedUnion('scope', [
  TradeJournalEntrySchema,
  SessionJournalEntrySchema,
  StrategyJournalEntrySchema,
]);
```

- [ ] **Step 9.2: Append validation tests**

In `src/lib/validation/export.test.ts`, after the existing session-entry tests, append:

```ts
  it('parses a file with a strategy journalEntries row', () => {
    const out = ExportFileSchema.parse({
      ...validFile,
      data: {
        ...validFile.data,
        journalEntries: [
          {
            id: 'strat-1',
            scope: 'strategy',
            createdAt: 1,
            updatedAt: 1,
            name: 'Breakout',
            conditions: 'clear resistance break',
            invalidation: '',
            idealRR: '2:1',
            examples: '',
            recurringMistakes: '',
            notes: '',
            provenance: 'observed',
          },
        ],
      },
    });
    expect(out.data.journalEntries).toHaveLength(1);
    expect(out.data.journalEntries![0]!.scope).toBe('strategy');
  });

  it('rejects a strategy entry missing the name field', () => {
    expect(() =>
      ExportFileSchema.parse({
        ...validFile,
        data: {
          ...validFile.data,
          journalEntries: [
            {
              id: 'strat-1',
              scope: 'strategy',
              createdAt: 1,
              updatedAt: 1,
              // no name
              conditions: '',
              invalidation: '',
              idealRR: '',
              examples: '',
              recurringMistakes: '',
              notes: '',
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

Expected: green.

- [ ] **Step 9.4: Commit**

```bash
git add src/lib/validation/export.ts src/lib/validation/export.test.ts
git commit -m "$(cat <<'EOF'
feat(validation): add StrategyJournalEntrySchema to the union

Third branch on the z.discriminatedUnion('scope', [...]) — joins trade
and session. Fields: id, scope literal 'strategy', createdAt,
updatedAt, name (required string), six content strings (conditions,
invalidation, idealRR, examples, recurringMistakes, notes), provenance
enum. No formatVersion bump; adding a discriminated-union branch is
additive per CONVENTIONS §13.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Playwright E2E — strategy round-trip

**Files:**
- Create: `e2e/strategy-journal-roundtrip.spec.ts`

- [ ] **Step 10.1: Write the test**

Create `e2e/strategy-journal-roundtrip.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { mockHyperliquid } from './fixtures/hyperliquid-route';

test.describe('strategy journal round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await mockHyperliquid(page);
  });

  test('create → navigate to /s/:id → edit → blur → reload → persist', async ({ page }) => {
    await page.goto('/');

    // 1. Navigate to /strategies via the JournalPanel link.
    await page.getByRole('link', { name: /strategies/i }).click();
    await expect(page).toHaveURL(/\/strategies$/);

    // 2. Create a new strategy.
    await page.getByLabel(/new strategy name/i).fill('E2E Breakout');
    await page.getByRole('button', { name: /create/i }).click();

    // 3. Land on /s/:id.
    await expect(page).toHaveURL(/\/s\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('E2E Breakout');

    // 4. Fill conditions + blur.
    const conditions = page.getByLabel(/conditions/i);
    await conditions.fill('clear resistance break with volume');
    await conditions.blur();
    await expect(page.getByText(/saved at/i)).toBeVisible();

    // 5. Reload the page.
    await page.reload();

    // 6. Content persists.
    await expect(page.getByLabel(/conditions/i)).toHaveValue('clear resistance break with volume');
  });

  test('new strategy appears in the /strategies list', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /strategies/i }).click();

    await page.getByLabel(/new strategy name/i).fill('Mean Reversion');
    await page.getByRole('button', { name: /create/i }).click();

    await expect(page).toHaveURL(/\/s\/[0-9a-f-]{36}$/);
    await page.getByRole('link', { name: /back/i }).click();

    await expect(page).toHaveURL(/\/strategies$/);
    await expect(page.getByText(/mean reversion/i)).toBeVisible();
  });
});
```

- [ ] **Step 10.2: Run the E2E**

```bash
pnpm test:e2e e2e/strategy-journal-roundtrip.spec.ts
```

Expected: 2 tests pass.

- [ ] **Step 10.3: Commit**

```bash
git add e2e/strategy-journal-roundtrip.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): add strategy-journal round-trip

Two tests: (1) JournalPanel → /strategies → create → land on
/s/:id → type conditions → blur → reload → content persists.
(2) After creating, navigate back to /strategies and verify the
new strategy shows up in the list.

Exercises the full JournalPanel → Strategies → useCreateStrategy
→ /s/:id → StrategyJournalForm → useStrategyEntry chain
end-to-end.

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

- [ ] **Step 11.1: Append Session 7c entry to SESSION_LOG.md**

Read the bottom of `docs/SESSION_LOG.md`, then append (matching the oldest-first convention used throughout):

```markdown

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
- End state: **[TODO final count]** unit tests, **9** E2E tests (was 7; +2), gauntlet clean.

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
```

Replace `[TODO final count]` with the actual count from `pnpm test:coverage` after Step 11.4.

- [ ] **Step 11.2: Append Session 7c BACKLOG entries**

At the end of `docs/BACKLOG.md`:

```markdown

---

## Session 7c deferrals

- `[next]` Tags + trade↔strategy linking — Session 7d. `tags: string[]` on all journal variants; trades reference strategies by id. Autocomplete from existing tags. Normalization decisions (case sensitivity, whitespace).
- `[next]` Screenshots/images — Session 7e. IndexedDB blob storage.
- `[maybe]` Strategy delete. Soft (archive) or hard with confirmation dialog. Depends on which BACKLOG item above (archive/status) lands first.
- `[maybe]` Strategy archive/status. Active / retired / paused. Filter on the list.
- `[maybe]` Per-strategy analytics on `/w/:address` (e.g., win rate of trades tagged with strategy X). Blocked on tags + trade↔strategy linking.
- `[maybe]` Duplicate-name warnings. Soft UX nudge when creating a strategy with an existing name.
- `[maybe]` Reorder strategies. Drag-to-reorder on `/strategies`; needs a per-row `sortKey` or an explicit ordering array.
- `[maybe]` Full-text search across strategy content. Once a user has 10+ strategies, finding "the one with invalidation below 200-day MA" by memory gets slow.
- `[maybe]` Strategy-specific templates. Preset strategies (breakout, mean-reversion, trend-follow) that the user can clone with pre-filled conditions.
```

- [ ] **Step 11.3: Amend CONVENTIONS §15**

Open `docs/CONVENTIONS.md`, find `## 15. Journaling`, and append:

```markdown
- **Three-variant discriminated union.** `JournalEntry` now carries `trade` | `session` | `strategy` variants. Consumers narrow on `scope` before accessing variant fields. Repo methods return narrowed variant types (e.g., `findStrategyById: Promise<StrategyJournalEntry | null>`).
- **Wallet-agnostic strategy routes.** Strategies live at `/strategies` (list) + `/s/:id` (detail), outside the `/w/:address` tree. Same reasoning as session journals — strategies describe the trader's repertoire, not a specific wallet.
- **"+ Create" flow pattern.** List pages with a create CTA (Strategies is the first) use an inline form on the list page itself; valid submit generates a UUID, writes an empty-content row, and navigates to the detail page for immediate editing. Empty-name submits show an inline loss-tone error. Pattern ready for Session 7d tags if they get their own create flow.
- **Blank-name fallback.** UI renders the literal string `"Untitled"` when a user-authored name is blank, but storage preserves the empty string. `name.trim() === ''` is the check.
```

- [ ] **Step 11.4: Final full gauntlet**

```bash
pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build && pnpm test:e2e
```

Expected: all green. Domain coverage ≥ 90%.

- [ ] **Step 11.5: Replace `[TODO final count]` in SESSION_LOG.md with the actual `pnpm test:coverage` total.**

- [ ] **Step 11.6: Commit**

```bash
git add docs/SESSION_LOG.md docs/BACKLOG.md docs/CONVENTIONS.md
git commit -m "$(cat <<'EOF'
docs: record Session 7c session log, backlog, conventions

Captures the strategy/setup journal session: StrategyJournalEntry
as the third variant, repo + three new hooks + StrategyJournalForm,
/strategies list page with inline create flow, /s/:id detail page
with live-name heading, JournalPanel entry-point link, Zod
discriminated-union extension, Playwright round-trip.

Amends CONVENTIONS §15 with four new sub-rules covering the
three-variant union, wallet-agnostic strategy routes, the list-page
"+ Create" flow pattern, and the blank-name Untitled fallback. Files
nine Session 7c BACKLOG entries; none block v1 acceptance.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Success criteria (copy from spec §Acceptance)

1. `/strategies` list renders + accepts new strategies via inline form. Empty state shows. Duplicate names allowed.
2. `/s/:id` renders form for a valid id; invalid id redirects to `/strategies`.
3. Typing + blur on any form field (including `name`) persists to Dexie. Reload preserves.
4. Export via `/settings` includes strategy entries when present; import restores them.
5. `JournalPanel` on `/` carries a "Strategies →" link.
6. `pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build` green. Domain coverage ≥ 90%.
7. `pnpm test:e2e` — new strategy round-trip + all existing specs pass.
8. SESSION_LOG, BACKLOG, CONVENTIONS updated.
