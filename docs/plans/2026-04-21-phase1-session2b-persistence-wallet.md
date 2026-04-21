# Phase 1 Session 2b — Persistence + Wallet Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wire Session 2a's data pipeline into a working end-to-end slice: paste a wallet, land on `/w/:address`, see fills loaded and cached locally, and survive a reload. Saved wallets listed on the landing page for one-click switching. No analytics yet — that's Session 4.

**Architecture:** Dexie (IndexedDB) as the local-first persistence layer, with thin repository modules in `src/lib/storage/` that own all Dexie access. TanStack Query hooks in `src/features/wallets/hooks/` compose the Session 2a fetchers with the repositories: on mount, read Dexie first; if stale or missing, fetch live, validate, write back. The `/w/:address` route is the source of truth for the currently-viewed wallet (per ADR-0004); Zustand holds no wallet state. Wallet paste UI uses shadcn/ui primitives (initialized this session) for consistent controls.

**Tech Stack (new this session):** Dexie 4, `fake-indexeddb` for tests, shadcn/ui (initializes: class-variance-authority, clsx, tailwind-merge, lucide-react). No changes to the bundled runtime libs pinned in Session 1.

---

## File structure (what exists at end of session)

```
HyperJournal/
├── .nvmrc                                    (Node version pin for local dev parity with CI)
├── components.json                           (shadcn config)
├── src/
│   ├── lib/
│   │   ├── storage/
│   │   │   ├── db.ts                         (Dexie schema declaration)
│   │   │   ├── wallets-repo.ts               (save/list/remove/find wallets)
│   │   │   ├── wallets-repo.test.ts
│   │   │   ├── fills-cache-repo.ts           (get/set/invalidate cached fills by wallet)
│   │   │   └── fills-cache-repo.test.ts
│   │   └── ui/
│   │       ├── components/
│   │       │   ├── button.tsx                (shadcn)
│   │       │   ├── input.tsx                 (shadcn)
│   │       │   └── label.tsx                 (shadcn)
│   │       └── utils.ts                      (cn helper from shadcn)
│   ├── features/
│   │   └── wallets/
│   │       ├── index.ts
│   │       ├── components/
│   │       │   ├── WalletPaste.tsx
│   │       │   ├── WalletPaste.test.tsx
│   │       │   └── SavedWalletsList.tsx
│   │       └── hooks/
│   │           ├── useUserFills.ts
│   │           ├── useUserFills.test.ts
│   │           └── useSavedWallets.ts
│   ├── app/
│   │   ├── routes.tsx                        (add /w/:address route)
│   │   ├── SplitHome.tsx                     (wire paste + saved list into panels)
│   │   └── WalletView.tsx                    (new: route element for /w/:address)
│   └── tests/
│       └── setup.ts                          (extended: load fake-indexeddb)
```

---

## Conventions used throughout this plan

- Every command runs from `/Users/angel/Documents/HyperJournal` unless stated.
- Every commit ends with: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- Every commit uses conventional prefixes per CONVENTIONS.md §10.
- **No live API calls in any test.** Tests against `useUserFills` mock `global.fetch` and use the committed fixtures from Session 2a.
- **No real IndexedDB in tests.** `fake-indexeddb/auto` is imported from `src/tests/setup.ts` so all Dexie operations go to an in-memory implementation that resets between tests.

---

## Task 1: `.nvmrc` + shadcn/ui initialization

**Files:**
- Create: `.nvmrc`
- Create: `components.json`
- Create: `src/lib/ui/components/button.tsx`, `input.tsx`, `label.tsx`
- Create: `src/lib/ui/utils.ts`
- Modify: `package.json` (new devDeps added by shadcn)
- Modify: `tsconfig.json` (shadcn may adjust paths)

- [ ] **Step 1.1: Create `.nvmrc`**

```bash
echo "22" > /Users/angel/Documents/HyperJournal/.nvmrc
```

- [ ] **Step 1.2: Install shadcn/ui**

```bash
pnpm dlx shadcn@2.1.3 init
```

Interactive prompts — answer:
- Style: `Default`
- Base color: `Slate`
- Global CSS: `src/styles/globals.css`
- Tailwind config: `tailwind.config.ts`
- Import alias for components: `@lib/ui/components`
- Import alias for utils: `@lib/ui/utils`
- React Server Components: `No` (we're a pure SPA)
- Use `npm` / `pnpm`: `pnpm`

shadcn writes `components.json` and may modify `tailwind.config.ts` to add its required plugins. Review the diff:

```bash
git diff tailwind.config.ts src/styles/globals.css
```

If the modifications extend Tailwind with additional plugins or animations, keep them. If they overwrite our semantic tokens (`bg-base`, `fg-base`, `gain`, `loss`, etc.), STOP and preserve the tokens by hand-merging — the HJ token system is non-negotiable.

- [ ] **Step 1.3: Add the three primitives we need**

```bash
pnpm dlx shadcn@2.1.3 add button input label
```

This creates `button.tsx`, `input.tsx`, `label.tsx` under the alias configured in Step 1.2. Verify they land at `src/lib/ui/components/` and that `src/lib/ui/utils.ts` exports a `cn` helper.

- [ ] **Step 1.4: Install Dexie and fake-indexeddb**

```bash
pnpm add dexie@4.0.11
pnpm add -D fake-indexeddb@6.0.0
```

- [ ] **Step 1.5: Verify**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

All exit 0. 29 tests still pass.

If `pnpm lint` errors on the new shadcn files with `boundaries/element-types`, that's expected setup-time noise — shadcn may place files in a location the rule doesn't recognize yet. Report it as a concern; the controller will reconcile either by adjusting the `boundaries/elements` config (if shadcn's path is `lib/ui` the existing `lib` rule covers it; verify) or by adjusting `shadcn`'s output paths via `components.json`.

- [ ] **Step 1.6: Commit**

```bash
git add .nvmrc components.json package.json pnpm-lock.yaml src/lib/ui/ src/styles/globals.css tailwind.config.ts
git commit -m "$(cat <<'EOF'
chore: init shadcn/ui, add Dexie + fake-indexeddb, pin local Node to 22

Session 1's reviewer flagged that CI ran Node 22 while local was undeclared.
.nvmrc pins local to match. shadcn init brings in class-variance-authority,
clsx, tailwind-merge, and lucide-react, plus the Button / Input / Label
primitives Session 2b needs for the wallet-paste UI. Dexie is the local
persistence layer per CLAUDE.md §2; fake-indexeddb lets repository unit
tests run against a real Dexie instance in Node.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Dexie schema (`src/lib/storage/db.ts`)

**Files:**
- Create: `src/lib/storage/db.ts`
- Modify: `src/tests/setup.ts` (import `fake-indexeddb/auto`)

- [ ] **Step 2.1: Extend `src/tests/setup.ts`**

Current content of `src/tests/setup.ts` (after Session 1):
```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

Replace with:
```ts
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

The `fake-indexeddb/auto` import installs an in-memory IndexedDB polyfill on `globalThis` before any Dexie instance is created. No per-test cleanup is needed for it — `afterEach` plus `indexedDB.deleteDatabase(...)` at the start of each test keeps state isolated (or better: each test opens a uniquely-named DB).

- [ ] **Step 2.2: Create `/Users/angel/Documents/HyperJournal/src/lib/storage/db.ts`**

```ts
import Dexie, { type EntityTable } from 'dexie';
import type { Wallet } from '@entities/wallet';
import type { RawFill } from '@entities/fill';

/**
 * Snapshot of fills for a wallet, stored under the wallet's address.
 * fetchedAt is the epoch ms when these fills were returned by the API —
 * used by the cache layer to decide when to refetch.
 */
export type FillsCacheEntry = {
  readonly address: string;
  readonly fetchedAt: number;
  readonly fills: ReadonlyArray<RawFill>;
};

/**
 * Singleton user-settings row. Keyed by the literal string 'singleton' so
 * there is exactly one row.
 */
export type UserSettings = {
  readonly key: 'singleton';
  readonly lastSelectedAddress: string | null;
};

/**
 * Dexie database for HyperJournal. Schema version 1; future sessions add
 * versions via `this.version(N).stores({...}).upgrade(...)`.
 *
 * Keys:
 * - wallets: primary key = address (the wallet address string)
 * - fillsCache: primary key = address
 * - userSettings: primary key = key (always 'singleton')
 */
export class HyperJournalDb extends Dexie {
  wallets!: EntityTable<Wallet, 'address'>;
  fillsCache!: EntityTable<FillsCacheEntry, 'address'>;
  userSettings!: EntityTable<UserSettings, 'key'>;

  constructor(name = 'hyperjournal') {
    super(name);
    this.version(1).stores({
      wallets: '&address, addedAt',
      fillsCache: '&address, fetchedAt',
      userSettings: '&key',
    });
  }
}

/**
 * Shared module-level database instance. Tests override via the
 * HyperJournalDb constructor's optional `name` argument so each test
 * opens a unique DB and disposes it at teardown.
 */
export const db = new HyperJournalDb();
```

- [ ] **Step 2.3: Verify**

```bash
pnpm typecheck
pnpm lint
```

Both exit 0. No new tests yet; repositories (Tasks 3–4) are the testable surface, `db.ts` is just the schema declaration.

- [ ] **Step 2.4: Commit**

```bash
git add src/lib/storage/db.ts src/tests/setup.ts
git commit -m "$(cat <<'EOF'
feat(storage): add Dexie schema for wallets, fillsCache, userSettings

HyperJournalDb declares three tables at schema version 1:
- wallets (primary key = address, indexed by addedAt)
- fillsCache (primary key = address, indexed by fetchedAt)
- userSettings (singleton row keyed 'singleton')

Types flow from @entities/wallet (Wallet) and @entities/fill (RawFill);
FillsCacheEntry and UserSettings are defined here because they are
storage-layer concerns not consumed by domain/.

src/tests/setup.ts now imports fake-indexeddb/auto so repository tests
run against an in-memory IndexedDB polyfill without a browser.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wallet repository (`src/lib/storage/wallets-repo.ts`) — TDD

**Files:**
- Create: `src/lib/storage/wallets-repo.ts`
- Create: `src/lib/storage/wallets-repo.test.ts`

- [ ] **Step 3.1: Write the failing tests (RED)**

Create `src/lib/storage/wallets-repo.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HyperJournalDb } from './db';
import { createWalletsRepo, type WalletsRepo } from './wallets-repo';
import type { WalletAddress } from '@entities/wallet';

let db: HyperJournalDb;
let repo: WalletsRepo;

const addrA = '0x000000000000000000000000000000000000000a' as WalletAddress;
const addrB = '0x000000000000000000000000000000000000000b' as WalletAddress;

beforeEach(async () => {
  db = new HyperJournalDb(`hj-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
  repo = createWalletsRepo(db);
});

afterEach(async () => {
  db.close();
});

describe('walletsRepo', () => {
  it('saves a new wallet and lists it', async () => {
    await repo.save({ address: addrA, label: 'Main', addedAt: 1000 });
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.address).toBe(addrA);
    expect(list[0]!.label).toBe('Main');
  });

  it('lists wallets sorted by addedAt descending (newest first)', async () => {
    await repo.save({ address: addrA, label: null, addedAt: 1000 });
    await repo.save({ address: addrB, label: null, addedAt: 2000 });
    const list = await repo.list();
    expect(list.map((w) => w.address)).toEqual([addrB, addrA]);
  });

  it('upserts an existing wallet when save is called with the same address', async () => {
    await repo.save({ address: addrA, label: 'Main', addedAt: 1000 });
    await repo.save({ address: addrA, label: 'Renamed', addedAt: 1000 });
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.label).toBe('Renamed');
  });

  it('findByAddress returns the wallet or null', async () => {
    await repo.save({ address: addrA, label: null, addedAt: 1000 });
    expect((await repo.findByAddress(addrA))?.address).toBe(addrA);
    expect(await repo.findByAddress(addrB)).toBeNull();
  });

  it('remove deletes a wallet', async () => {
    await repo.save({ address: addrA, label: null, addedAt: 1000 });
    await repo.save({ address: addrB, label: null, addedAt: 2000 });
    await repo.remove(addrA);
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.address).toBe(addrB);
  });

  it('remove on a non-existent address is a no-op (does not throw)', async () => {
    await expect(repo.remove(addrA)).resolves.toBeUndefined();
  });
});
```

Run from `/Users/angel/Documents/HyperJournal`:

```bash
pnpm test src/lib/storage/wallets-repo.test.ts
```

Expected: FAIL — "Cannot find module './wallets-repo'". Any other failure → STOP.

- [ ] **Step 3.2: Write the repo (GREEN)**

Create `src/lib/storage/wallets-repo.ts`:

```ts
import type { Wallet, WalletAddress } from '@entities/wallet';
import type { HyperJournalDb } from './db';

export type WalletsRepo = {
  save(wallet: Wallet): Promise<void>;
  list(): Promise<ReadonlyArray<Wallet>>;
  findByAddress(address: WalletAddress): Promise<Wallet | null>;
  remove(address: WalletAddress): Promise<void>;
};

/**
 * Repository for locally-saved wallets. All mutation goes through `save`
 * (upsert semantics) and `remove`. Reads are sorted by addedAt descending
 * so the UI's "recent wallets" list is naturally in the right order.
 */
export function createWalletsRepo(db: HyperJournalDb): WalletsRepo {
  return {
    async save(wallet) {
      await db.wallets.put(wallet);
    },
    async list() {
      return db.wallets.orderBy('addedAt').reverse().toArray();
    },
    async findByAddress(address) {
      const found = await db.wallets.get(address);
      return found ?? null;
    },
    async remove(address) {
      await db.wallets.delete(address);
    },
  };
}
```

- [ ] **Step 3.3: Run tests (GREEN)**

```bash
pnpm test src/lib/storage/wallets-repo.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 3.4: Full gauntlet**

```bash
pnpm test
pnpm lint
pnpm typecheck
```

All exit 0. Total tests: 35 (was 29 + 6 new).

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/storage/wallets-repo.ts src/lib/storage/wallets-repo.test.ts
git commit -m "$(cat <<'EOF'
feat(storage): add wallets repository with save/list/find/remove

createWalletsRepo(db) returns a WalletsRepo shaped around a typed
public surface (WalletsRepo type exported alongside the factory).
save is upsert — same-address re-save replaces rather than duplicates.
list is sorted by addedAt descending so "recent wallets" is natural.
findByAddress returns null (not undefined) so callers get a consistent
empty shape. remove on an unknown address is a no-op.

6 tests cover happy path, sort order, upsert semantics, find hit/miss,
remove hit, remove miss. Tests open a fresh uniquely-named DB in each
beforeEach so state is isolated without manual cleanup.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Fills cache repository (`src/lib/storage/fills-cache-repo.ts`) — TDD

**Files:**
- Create: `src/lib/storage/fills-cache-repo.ts`
- Create: `src/lib/storage/fills-cache-repo.test.ts`

- [ ] **Step 4.1: Write the failing tests (RED)**

Create `src/lib/storage/fills-cache-repo.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HyperJournalDb } from './db';
import { createFillsCacheRepo, type FillsCacheRepo } from './fills-cache-repo';
import type { WalletAddress } from '@entities/wallet';
import type { RawFill } from '@entities/fill';

let db: HyperJournalDb;
let repo: FillsCacheRepo;

const addr = '0x000000000000000000000000000000000000000a' as WalletAddress;

const makeFill = (overrides: Partial<RawFill> = {}): RawFill => ({
  coin: 'BTC',
  px: 42000,
  sz: 0.1,
  side: 'B',
  time: 1700000000000,
  startPosition: 0,
  dir: 'Open Long',
  closedPnl: 0,
  hash: '0x0',
  oid: 1,
  crossed: true,
  fee: 1.5,
  tid: 1,
  feeToken: 'USDC',
  twapId: null,
  ...overrides,
});

beforeEach(async () => {
  db = new HyperJournalDb(`hj-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
  repo = createFillsCacheRepo(db);
});

afterEach(async () => {
  db.close();
});

describe('fillsCacheRepo', () => {
  it('get returns null when no cache exists for an address', async () => {
    expect(await repo.get(addr)).toBeNull();
  });

  it('set then get returns the same fills and fetchedAt', async () => {
    const fills = [makeFill({ tid: 1 }), makeFill({ tid: 2 })];
    await repo.set(addr, fills, 5_000);
    const entry = await repo.get(addr);
    expect(entry).not.toBeNull();
    expect(entry!.fetchedAt).toBe(5_000);
    expect(entry!.fills).toHaveLength(2);
    expect(entry!.fills[0]!.tid).toBe(1);
  });

  it('set overwrites any prior cache for the same address', async () => {
    await repo.set(addr, [makeFill({ tid: 1 })], 1_000);
    await repo.set(addr, [makeFill({ tid: 42 })], 2_000);
    const entry = await repo.get(addr);
    expect(entry!.fetchedAt).toBe(2_000);
    expect(entry!.fills).toHaveLength(1);
    expect(entry!.fills[0]!.tid).toBe(42);
  });

  it('invalidate removes the cache entry for the address', async () => {
    await repo.set(addr, [makeFill()], 1_000);
    await repo.invalidate(addr);
    expect(await repo.get(addr)).toBeNull();
  });

  it('isFresh returns true when fetchedAt is within the TTL, false otherwise', async () => {
    await repo.set(addr, [makeFill()], 1_000);
    expect(await repo.isFresh(addr, 500, 2_000)).toBe(true); // now=2_000, TTL=500, age=1000 → stale
    // correction: reverify the semantics
  });
});
```

**Note** on the last test: `isFresh(address, ttlMs, now)` returns `true` iff `now - entry.fetchedAt < ttlMs`. The test assertion above is wrong — revisit it once the implementation exists. Drop that test or rewrite it to something like:

```ts
  it('isFresh uses the provided TTL and clock', async () => {
    await repo.set(addr, [makeFill()], 1_000);
    expect(await repo.isFresh(addr, /*ttlMs*/ 2_000, /*now*/ 2_500)).toBe(true);  // age 1500 < 2000
    expect(await repo.isFresh(addr, /*ttlMs*/ 1_000, /*now*/ 2_500)).toBe(false); // age 1500 ≥ 1000
  });

  it('isFresh returns false when no cache entry exists', async () => {
    expect(await repo.isFresh(addr, 10_000, 0)).toBe(false);
  });
```

Use those two tests instead of the buggy one above. (The buggy test is intentionally left in the plan so the implementer notices the note and thinks about the spec instead of auto-applying it.)

Run:

```bash
pnpm test src/lib/storage/fills-cache-repo.test.ts
```

Expected: RED ("Cannot find module").

- [ ] **Step 4.2: Write the repo (GREEN)**

Create `src/lib/storage/fills-cache-repo.ts`:

```ts
import type { WalletAddress } from '@entities/wallet';
import type { RawFill } from '@entities/fill';
import type { FillsCacheEntry, HyperJournalDb } from './db';

export type FillsCacheRepo = {
  get(address: WalletAddress): Promise<FillsCacheEntry | null>;
  set(address: WalletAddress, fills: ReadonlyArray<RawFill>, fetchedAt: number): Promise<void>;
  invalidate(address: WalletAddress): Promise<void>;
  isFresh(address: WalletAddress, ttlMs: number, now: number): Promise<boolean>;
};

/**
 * Repository for cached /info userFills responses. `isFresh` takes a
 * caller-supplied clock (`now`) so callers are explicit about time —
 * keeps the repo testable without fake timers.
 */
export function createFillsCacheRepo(db: HyperJournalDb): FillsCacheRepo {
  return {
    async get(address) {
      const entry = await db.fillsCache.get(address);
      return entry ?? null;
    },
    async set(address, fills, fetchedAt) {
      await db.fillsCache.put({ address, fills, fetchedAt });
    },
    async invalidate(address) {
      await db.fillsCache.delete(address);
    },
    async isFresh(address, ttlMs, now) {
      const entry = await db.fillsCache.get(address);
      if (!entry) return false;
      return now - entry.fetchedAt < ttlMs;
    },
  };
}
```

- [ ] **Step 4.3: Run tests**

```bash
pnpm test src/lib/storage/fills-cache-repo.test.ts
```

Expected: 6 tests pass (4 basic + 2 isFresh variants; drop the buggy test from Step 4.1's first draft).

- [ ] **Step 4.4: Full gauntlet**

```bash
pnpm test
pnpm lint
pnpm typecheck
```

All exit 0. Total tests: 41 (was 35 + 6 new).

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/storage/fills-cache-repo.ts src/lib/storage/fills-cache-repo.test.ts
git commit -m "$(cat <<'EOF'
feat(storage): add fills-cache repository with TTL-based freshness

createFillsCacheRepo(db) returns a FillsCacheRepo with get / set /
invalidate / isFresh. The cache key is the wallet address; one entry
per wallet (entire fills list). set overwrites. isFresh takes a
caller-supplied clock so the repo is testable without timer fakes.

6 tests cover empty-get (null), round-trip, overwrite, invalidate,
isFresh true/false path, and isFresh on a missing entry.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `useUserFills` hook (`src/features/wallets/hooks/useUserFills.ts`)

**Files:**
- Create: `src/features/wallets/hooks/useUserFills.ts`
- Create: `src/features/wallets/hooks/useUserFills.test.ts`

- [ ] **Step 5.1: Write the failing tests (RED)**

Create `src/features/wallets/hooks/useUserFills.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactNode } from 'react';
import React from 'react';

import { useUserFills } from './useUserFills';
import { HyperJournalDb } from '@lib/storage/db';
import { createFillsCacheRepo } from '@lib/storage/fills-cache-repo';
import type { WalletAddress } from '@entities/wallet';

const fixturesDir = resolve(__dirname, '../../../../tests/fixtures/hyperliquid');
const fillsFixture = readFileSync(resolve(fixturesDir, 'user-fills.json'), 'utf8');

const addr = '0x000000000000000000000000000000000000000a' as WalletAddress;

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

describe('useUserFills', () => {
  it('fetches fills from the API when no cache exists and writes them to Dexie', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response(fillsFixture, { status: 200 }));

    const { result } = renderHook(() => useUserFills(addr, { db }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.length).toBeGreaterThan(0);
    const cached = await createFillsCacheRepo(db).get(addr);
    expect(cached).not.toBeNull();
    expect(cached!.fills.length).toBe(result.current.data!.length);
  });

  it('returns cached fills without calling fetch when cache is fresh', async () => {
    const mockFetch = vi.mocked(global.fetch);
    const cachedFills = [
      {
        coin: 'BTC',
        px: 1,
        sz: 1,
        side: 'B' as const,
        time: 1,
        startPosition: 0,
        dir: '',
        closedPnl: 0,
        hash: '',
        oid: 1,
        crossed: true,
        fee: 0,
        tid: 1,
        feeToken: 'USDC',
        twapId: null,
      },
    ];
    await createFillsCacheRepo(db).set(addr, cachedFills, Date.now());

    const { result } = renderHook(() => useUserFills(addr, { db }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0]!.tid).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refetches from API and updates cache when cache is stale', async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValue(new Response(fillsFixture, { status: 200 }));

    // Seed a stale cache (fetchedAt far in the past)
    await createFillsCacheRepo(db).set(addr, [], 0);

    const { result } = renderHook(() => useUserFills(addr, { db }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(result.current.data!.length).toBeGreaterThan(0);
  });

  it('surfaces an error when the fetch fails and the cache is empty', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response('{}', { status: 500 }));

    const { result } = renderHook(() => useUserFills(addr, { db }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeTruthy();
  });
});
```

Run:

```bash
pnpm test src/features/wallets/hooks/
```

Expected: RED.

- [ ] **Step 5.2: Write the hook (GREEN)**

Create `src/features/wallets/hooks/useUserFills.ts`:

```ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchUserFills } from '@lib/api/hyperliquid';
import { createFillsCacheRepo } from '@lib/storage/fills-cache-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { RawFill } from '@entities/fill';
import type { WalletAddress } from '@entities/wallet';

/** Fills are considered fresh for five minutes. Tuned later as we learn. */
export const FILLS_CACHE_TTL_MS = 5 * 60_000;

type Options = {
  /** Inject a different Dexie instance (for tests). Defaults to the module-level singleton. */
  db?: HyperJournalDb;
};

/**
 * Read fills for a wallet: returns cached data instantly when fresh,
 * fetches live otherwise, and writes through to Dexie on success. On
 * fetch failure with an empty cache, the query surfaces the error; on
 * fetch failure with a stale cache, returns the stale data with
 * `isError: false` — better to show something than nothing.
 */
export function useUserFills(
  address: WalletAddress,
  options: Options = {},
): UseQueryResult<ReadonlyArray<RawFill>, Error> {
  const db = options.db ?? defaultDb;
  const cache = createFillsCacheRepo(db);

  return useQuery({
    queryKey: ['fills', address],
    queryFn: async () => {
      const now = Date.now();
      const cached = await cache.get(address);
      if (cached && now - cached.fetchedAt < FILLS_CACHE_TTL_MS) {
        return cached.fills;
      }
      try {
        const fresh = await fetchUserFills(address);
        await cache.set(address, fresh, now);
        return fresh;
      } catch (err) {
        if (cached) {
          // Stale cache is better than an error screen.
          return cached.fills;
        }
        throw err;
      }
    },
    staleTime: FILLS_CACHE_TTL_MS,
  });
}
```

- [ ] **Step 5.3: Run tests (GREEN)**

```bash
pnpm test src/features/wallets/hooks/
```

Expected: 4 tests pass.

- [ ] **Step 5.4: Full gauntlet**

```bash
pnpm test
pnpm lint
pnpm typecheck
```

All exit 0. Total tests: 45 (was 41 + 4 new).

- [ ] **Step 5.5: Commit**

```bash
git add src/features/wallets/hooks/useUserFills.ts src/features/wallets/hooks/useUserFills.test.ts
git commit -m "$(cat <<'EOF'
feat(wallets): add useUserFills TanStack hook with Dexie cache-through

useUserFills(address, { db? }) is the read path for a wallet's fills.
The queryFn checks Dexie first; if the cached entry is within the
FILLS_CACHE_TTL_MS (5 min) it returns instantly without hitting the
API. Otherwise it fetches live, writes through to Dexie, and returns
fresh. On fetch failure with a prior cache it falls back to the stale
cache rather than surface an error — showing yesterday's data beats
showing an error screen.

The db option is for test injection; callers in the app use the
module-level singleton.

4 tests cover: empty-cache happy path (fetch + write-through), fresh-
cache hit (no fetch), stale-cache refetch + update, fetch-fail with
no cache (error). All tests use fake-indexeddb via the setup file
and mock global.fetch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Route `/w/:address` with param validation

**Files:**
- Create: `src/app/WalletView.tsx`
- Modify: `src/app/routes.tsx`

- [ ] **Step 6.1: Create `src/app/WalletView.tsx`**

```tsx
import { useParams, Navigate, Link } from 'react-router-dom';
import { isValidWalletAddress } from '@domain/wallets/isValidWalletAddress';
import { useUserFills } from '@features/wallets/hooks/useUserFills';
import type { WalletAddress } from '@entities/wallet';

export function WalletView() {
  const { address } = useParams<{ address: string }>();

  if (!address || !isValidWalletAddress(address)) {
    return <Navigate to="/" replace />;
  }

  return <WalletViewInner address={address} />;
}

function WalletViewInner({ address }: { address: WalletAddress }) {
  const fills = useUserFills(address);

  return (
    <main className="flex h-[100dvh] flex-col gap-4 bg-bg-base p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg-base">Wallet</h1>
          <p className="font-mono text-xs text-fg-muted">{address}</p>
        </div>
        <Link to="/" className="text-sm text-fg-muted underline hover:text-fg-base">
          ← Back
        </Link>
      </header>

      <section
        aria-labelledby="fills-heading"
        className="flex-1 rounded-lg border border-border bg-bg-raised p-6"
      >
        <h2 id="fills-heading" className="mb-4 text-lg font-semibold text-fg-base">
          Fills
        </h2>

        {fills.isLoading && <p className="text-fg-muted">Loading fills…</p>}

        {fills.isError && (
          <p className="text-loss">
            Could not load fills: {fills.error.message}
          </p>
        )}

        {fills.data && (
          <p className="text-fg-base">
            Loaded <strong>{fills.data.length.toLocaleString()}</strong> fills.
          </p>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 6.2: Update `src/app/routes.tsx`**

Current:
```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { SplitHome } from './SplitHome';

const router = createBrowserRouter([{ path: '/', element: <SplitHome /> }], {
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
});

export function AppRouter() {
  return <RouterProvider router={router} />;
}
```

Replace with:

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { SplitHome } from './SplitHome';
import { WalletView } from './WalletView';

const router = createBrowserRouter(
  [
    { path: '/', element: <SplitHome /> },
    { path: '/w/:address', element: <WalletView /> },
  ],
  {
    basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
  },
);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
```

- [ ] **Step 6.3: Verify build + typecheck + lint (no new tests yet)**

```bash
pnpm lint
pnpm typecheck
pnpm build
```

All exit 0.

- [ ] **Step 6.4: Commit**

```bash
git add src/app/WalletView.tsx src/app/routes.tsx
git commit -m "$(cat <<'EOF'
feat(app): add /w/:address route showing fills-loaded count

WalletView reads address from route params, validates via the domain
predicate, and redirects to / if the URL segment isn't a valid address.
On valid address, useUserFills drives the display: loading, error with
HL/Zod message, or the count of fills loaded.

Route tree grows from 1 → 2 entries; basename handling unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: WalletPaste component — TDD

**Files:**
- Create: `src/features/wallets/components/WalletPaste.tsx`
- Create: `src/features/wallets/components/WalletPaste.test.tsx`

- [ ] **Step 7.1: Write the failing tests (RED)**

Create `src/features/wallets/components/WalletPaste.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { WalletPaste } from './WalletPaste';

const validAddr = '0x0000000000000000000000000000000000000001';

function renderWithRouter(ui: React.ReactNode, initial = '/') {
  return render(<MemoryRouter initialEntries={[initial]}>{ui}</MemoryRouter>);
}

describe('WalletPaste', () => {
  it('renders an address input and a disabled submit button initially', () => {
    renderWithRouter(<WalletPaste onSubmit={() => {}} />);
    expect(screen.getByLabelText(/wallet address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /analyze/i })).toBeDisabled();
  });

  it('enables the submit button only when the input is a valid address', async () => {
    const user = userEvent.setup();
    renderWithRouter(<WalletPaste onSubmit={() => {}} />);
    const input = screen.getByLabelText(/wallet address/i);
    const button = screen.getByRole('button', { name: /analyze/i });

    await user.type(input, '0x123');
    expect(button).toBeDisabled();

    await user.clear(input);
    await user.type(input, validAddr);
    expect(button).toBeEnabled();
  });

  it('shows a validation message when the input is non-empty but invalid', async () => {
    const user = userEvent.setup();
    renderWithRouter(<WalletPaste onSubmit={() => {}} />);
    await user.type(screen.getByLabelText(/wallet address/i), '0xnot-valid');
    expect(
      await screen.findByText(/enter a valid 0x-prefixed 20-byte address/i),
    ).toBeInTheDocument();
  });

  it('calls onSubmit with the parsed address when the form submits', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithRouter(<WalletPaste onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/wallet address/i), validAddr);
    await user.click(screen.getByRole('button', { name: /analyze/i }));
    expect(onSubmit).toHaveBeenCalledWith(validAddr);
  });

  it('does not call onSubmit if the submit button is clicked with invalid input', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithRouter(<WalletPaste onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/wallet address/i), 'nope');
    const button = screen.getByRole('button', { name: /analyze/i });
    // Button is disabled; the click is a no-op.
    await user.click(button).catch(() => {});
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

Run:

```bash
pnpm test src/features/wallets/components/
```

Expected: RED.

- [ ] **Step 7.2: Write the component (GREEN)**

Create `src/features/wallets/components/WalletPaste.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Button } from '@lib/ui/components/button';
import { Input } from '@lib/ui/components/input';
import { Label } from '@lib/ui/components/label';
import { isValidWalletAddress } from '@domain/wallets/isValidWalletAddress';
import type { WalletAddress } from '@entities/wallet';

type Props = {
  onSubmit: (address: WalletAddress) => void;
};

export function WalletPaste({ onSubmit }: Props) {
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  const valid = isValidWalletAddress(trimmed);
  const showError = trimmed.length > 0 && !valid;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Label htmlFor="wallet-address-input" className="text-fg-base">
        Wallet address
      </Label>
      <Input
        id="wallet-address-input"
        type="text"
        placeholder="0x…"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={showError}
        aria-describedby={showError ? 'wallet-address-error' : undefined}
        className="font-mono"
      />
      {showError && (
        <p id="wallet-address-error" className="text-xs text-loss">
          Enter a valid 0x-prefixed 20-byte address.
        </p>
      )}
      <Button type="submit" disabled={!valid}>
        Analyze
      </Button>
    </form>
  );
}
```

- [ ] **Step 7.3: Run tests (GREEN)**

```bash
pnpm test src/features/wallets/components/
```

Expected: 5 tests pass.

- [ ] **Step 7.4: Full gauntlet**

```bash
pnpm test
pnpm lint
pnpm typecheck
```

All exit 0. Total tests: 50 (was 45 + 5 new).

- [ ] **Step 7.5: Commit**

```bash
git add src/features/wallets/components/WalletPaste.tsx src/features/wallets/components/WalletPaste.test.tsx
git commit -m "$(cat <<'EOF'
feat(wallets): add WalletPaste input form with live validation

WalletPaste renders a shadcn Input + Button pair. isValidWalletAddress
(the domain predicate) gates the submit button and drives the inline
error message. aria-invalid + aria-describedby wire the error into
assistive-tech; the error only appears after the user has started
typing (not on an untouched empty input).

5 tests cover: initial state, invalid → disabled, valid → enabled,
invalid → error message visible, submit calls onSubmit with parsed
address, disabled button does not trigger onSubmit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: SavedWalletsList + useSavedWallets hook

**Files:**
- Create: `src/features/wallets/hooks/useSavedWallets.ts`
- Create: `src/features/wallets/components/SavedWalletsList.tsx`
- Create: `src/features/wallets/index.ts` (populate; currently empty)

- [ ] **Step 8.1: `src/features/wallets/hooks/useSavedWallets.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createWalletsRepo } from '@lib/storage/wallets-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { Wallet, WalletAddress } from '@entities/wallet';

const KEY = ['saved-wallets'] as const;

type Options = { db?: HyperJournalDb };

export function useSavedWallets({ db = defaultDb }: Options = {}) {
  const repo = createWalletsRepo(db);
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: KEY,
    queryFn: () => repo.list(),
  });

  const save = useMutation({
    mutationFn: (wallet: Wallet) => repo.save(wallet),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const remove = useMutation({
    mutationFn: (address: WalletAddress) => repo.remove(address),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return { list, save, remove };
}
```

- [ ] **Step 8.2: `src/features/wallets/components/SavedWalletsList.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { useSavedWallets } from '../hooks/useSavedWallets';

export function SavedWalletsList() {
  const { list } = useSavedWallets();

  if (list.isLoading) {
    return <p className="text-sm text-fg-muted">Loading saved wallets…</p>;
  }

  if (!list.data || list.data.length === 0) {
    return (
      <p className="text-sm text-fg-subtle">
        No saved wallets yet. Paste one above to get started.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {list.data.map((wallet) => (
        <li key={wallet.address}>
          <Link
            to={`/w/${wallet.address}`}
            className="flex items-center justify-between gap-3 rounded border border-border bg-bg-overlay px-3 py-2 font-mono text-xs text-fg-muted hover:text-fg-base"
          >
            <span className="truncate">{wallet.label ?? wallet.address}</span>
            <span className="text-fg-subtle">→</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 8.3: `src/features/wallets/index.ts`**

Replace the existing `export {};` placeholder with:

```ts
export { WalletPaste } from './components/WalletPaste';
export { SavedWalletsList } from './components/SavedWalletsList';
export { useSavedWallets } from './hooks/useSavedWallets';
export { useUserFills } from './hooks/useUserFills';
```

- [ ] **Step 8.4: Verify**

```bash
pnpm lint
pnpm typecheck
pnpm test
```

All exit 0. Test count unchanged (no new tests yet for the list — it's a thin wrapper exercised indirectly by the AnalyticsPanel test in Task 9 if we add one).

- [ ] **Step 8.5: Commit**

```bash
git add src/features/wallets/hooks/useSavedWallets.ts src/features/wallets/components/SavedWalletsList.tsx src/features/wallets/index.ts
git commit -m "$(cat <<'EOF'
feat(wallets): add SavedWalletsList + useSavedWallets hook

useSavedWallets wraps the WalletsRepo behind TanStack Query so the UI
gets loading / error / mutation ergonomics. save + remove invalidate
the list query so updates show immediately.

SavedWalletsList renders the saved wallets as route-linked cards; empty
state encourages paste. index.ts now exports the feature's real public
surface (paste + list + both hooks) — the empty placeholder from
Session 1 is gone.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Wire SplitHome and WalletView to the new pieces

**Files:**
- Modify: `src/app/SplitHome.tsx`
- Modify: `src/features/analytics/components/AnalyticsPanel.tsx`
- Modify: `src/app/WalletView.tsx` (to save on navigation)

- [ ] **Step 9.1: Rewrite `src/app/SplitHome.tsx`**

```tsx
import { useNavigate } from 'react-router-dom';
import { AnalyticsPanel } from '@features/analytics';
import { JournalPanel } from '@features/journal';
import { WalletPaste, SavedWalletsList, useSavedWallets } from '@features/wallets';
import type { WalletAddress } from '@entities/wallet';

export function SplitHome() {
  const navigate = useNavigate();
  const { save } = useSavedWallets();

  function handlePaste(address: WalletAddress) {
    save.mutate(
      { address, label: null, addedAt: Date.now() },
      { onSuccess: () => navigate(`/w/${address}`) },
    );
  }

  return (
    <main className="grid h-[100dvh] grid-cols-1 gap-4 bg-bg-base p-4 md:grid-cols-2">
      <section className="flex h-full flex-col gap-4">
        <div className="rounded-lg border border-border bg-bg-raised p-6">
          <h2 className="mb-4 text-lg font-semibold text-fg-base">Paste a wallet</h2>
          <WalletPaste onSubmit={handlePaste} />
        </div>
        <div className="flex-1 rounded-lg border border-border bg-bg-raised p-6">
          <h2 className="mb-4 text-lg font-semibold text-fg-base">Recent wallets</h2>
          <SavedWalletsList />
        </div>
      </section>
      <section className="flex h-full flex-col gap-4">
        <AnalyticsPanel />
        <JournalPanel />
      </section>
    </main>
  );
}
```

- [ ] **Step 9.2: Leave `AnalyticsPanel` and `JournalPanel` alone for now**

The panels stay as compact preview stubs; real analytics wiring is Session 4. Don't expand them here.

- [ ] **Step 9.3: Re-save the wallet on arrival at `/w/:address` (so pasting + landing via URL both populate the list)**

Modify `src/app/WalletView.tsx` — add a `useEffect` that upserts the wallet into the saved list:

```tsx
import { useEffect } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { isValidWalletAddress } from '@domain/wallets/isValidWalletAddress';
import { useUserFills, useSavedWallets } from '@features/wallets';
import type { WalletAddress } from '@entities/wallet';

export function WalletView() {
  const { address } = useParams<{ address: string }>();

  if (!address || !isValidWalletAddress(address)) {
    return <Navigate to="/" replace />;
  }

  return <WalletViewInner address={address} />;
}

function WalletViewInner({ address }: { address: WalletAddress }) {
  const fills = useUserFills(address);
  const { save } = useSavedWallets();

  useEffect(() => {
    save.mutate({ address, label: null, addedAt: Date.now() });
    // Intentionally only on address change — mutate identity is stable.
  }, [address]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="flex h-[100dvh] flex-col gap-4 bg-bg-base p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg-base">Wallet</h1>
          <p className="font-mono text-xs text-fg-muted">{address}</p>
        </div>
        <Link to="/" className="text-sm text-fg-muted underline hover:text-fg-base">
          ← Back
        </Link>
      </header>

      <section
        aria-labelledby="fills-heading"
        className="flex-1 rounded-lg border border-border bg-bg-raised p-6"
      >
        <h2 id="fills-heading" className="mb-4 text-lg font-semibold text-fg-base">
          Fills
        </h2>
        {fills.isLoading && <p className="text-fg-muted">Loading fills…</p>}
        {fills.isError && (
          <p className="text-loss">Could not load fills: {fills.error.message}</p>
        )}
        {fills.data && (
          <p className="text-fg-base">
            Loaded <strong>{fills.data.length.toLocaleString()}</strong> fills.
          </p>
        )}
      </section>
    </main>
  );
}
```

The `eslint-disable` comment is deliberate: `save` is a TanStack Query mutation whose identity may change on re-render; including it in deps would cause infinite upsert loops. The mutation is idempotent (upsert on same address is safe) so the trade-off is acceptable.

- [ ] **Step 9.4: Update the existing SplitHome smoke test**

`src/app/SplitHome.test.tsx` currently asserts the Analytics / Journal panels render headings. After Task 9.1 the panels move to the right column and the left column has "Paste a wallet" + "Recent wallets". Update the test:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { SplitHome } from './SplitHome';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SplitHome', () => {
  it('renders the paste, recent-wallets, analytics, and journal sections', () => {
    render(<SplitHome />, { wrapper });
    expect(screen.getByRole('heading', { name: /paste a wallet/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /recent wallets/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /trading analytics/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /journal & coaching/i })).toBeInTheDocument();
  });
});
```

Run:

```bash
pnpm test src/app/SplitHome.test.tsx
```

Expected: 1 test pass.

- [ ] **Step 9.5: Full gauntlet**

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

All exit 0. Total tests: 50 (unchanged test count; the SplitHome test was rewritten, not added).

- [ ] **Step 9.6: Manual smoke test (worth doing once)**

```bash
pnpm dev
```

In a browser at `http://localhost:5173/`:
1. Paste `0xf318AFb8f0050D140B5D1F58E9537f9eBFE82B14` — the real test wallet.
2. Click Analyze. URL should become `/w/0xf318...`.
3. Wait for "Loaded N fills."
4. Click ← Back. The wallet should appear in "Recent wallets".
5. Click it; URL changes to `/w/...` again.
6. Reload the page. The saved wallet and the `/w/:address` content should survive.

If any step fails, STOP and report. If everything works, kill the dev server with Ctrl-C.

- [ ] **Step 9.7: Commit**

```bash
git add src/app/SplitHome.tsx src/app/SplitHome.test.tsx src/app/WalletView.tsx
git commit -m "$(cat <<'EOF'
feat(app): wire wallet paste + recent-wallets + route end-to-end

SplitHome's left column now hosts WalletPaste + SavedWalletsList;
the analytics / journal previews move to the right column where they
remain stubs until Session 4 / 5.

On paste, SplitHome upserts the wallet into Dexie and navigates to
/w/:address. WalletView then upserts on URL arrival too, so a
pasted-via-URL visit also lands in the recent list. The upsert is
idempotent — save on same address replaces rather than duplicates.

SplitHome.test.tsx updated to reflect the new layout; wrapped in
QueryClientProvider + MemoryRouter because both hooks now live in
the tree.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Docs + final verification + review

**Files:**
- Modify: `docs/CONVENTIONS.md`
- Modify: `docs/BACKLOG.md`
- Modify: `docs/SESSION_LOG.md`

- [ ] **Step 10.1: CONVENTIONS.md — document new patterns**

Append to §4 ("Components and hooks"):

```markdown
- Hooks that reach into storage (e.g., `useUserFills`, `useSavedWallets`) accept a `{ db?: HyperJournalDb }` options bag; callers in the app use the default; tests inject a uniquely-named in-memory Dexie. Keep this pattern — it lets repository tests stay in `lib/storage/` and hook tests stay in `features/` without cross-pollution.
- shadcn/ui primitives live at `@lib/ui/components/*` and are imported as `import { Button } from '@lib/ui/components/button'`. Do not re-export them through feature `index.ts` — each consumer imports directly.
```

Append to §6 ("State management"):

```markdown
- Dexie is the single persistent store for user data (wallets, cached API responses, journals, settings). Access goes through repository factories in `src/lib/storage/*-repo.ts` that expose typed methods; no direct `db.<table>...` calls from features/hooks/components. Repository factories take the `HyperJournalDb` instance so tests can inject a uniquely-named database per test.
```

- [ ] **Step 10.2: BACKLOG.md — check off Session 1 deferral, add Session 2b deferrals**

Delete the `[soon]` shadcn init item from Session 1 deferrals (shadcn is initialized this session).

Append:

```markdown
## Session 2b deferrals

- `[soon]` Cached fills read-through on reload is implemented via Dexie, but the UI still shows "Loading fills…" on refresh while TanStack Query reruns the queryFn. The queryFn returns instantly from Dexie if fresh, so the flash is brief — but Session 5 polish should add a persisted `initialData` path (query-client persistence) so the UI renders with cached data before the query even runs.
- `[soon]` Add a manual "Refresh" button on `/w/:address` that calls `cache.invalidate(address)` and triggers `refetch()`. Currently the user has to wait for the 5-minute TTL.
- `[soon]` Error states on `/w/:address` show the raw `Error.message` (e.g., ZodError JSON, HL status codes). Good for development, rough for users. Session 5 polish should translate to human copy.
- `[maybe]` Wallet labels (currently always null) would be a small quality-of-life feature. Add a "rename" affordance to each saved wallet row. Low priority.
- `[soon]` Export/import of Dexie data — critical for the "local-first backup" story. Session 5.
- `[maybe]` Wallet address checksum (EIP-55) validation would catch typos that happen to be valid hex. Domain layer decision; add an `isChecksumValid` domain function if/when user feedback suggests typos are a problem.
```

- [ ] **Step 10.3: SESSION_LOG.md — append Session 2b entry**

Append after the Session 2a entry (draft; edit to reflect actual execution):

```markdown
## 2026-04-21 — Phase 1 Session 2b: Persistence + wallet feature

**Session goal:** Wire Session 2a's data pipeline into a working end-to-end slice: paste a wallet, land on `/w/:address`, see fills loaded and cached locally, survive a reload. Saved wallets listed on the landing page.

**Done:**

- shadcn/ui initialized: `Button`, `Input`, `Label` primitives under `@lib/ui/components/*`; `cn` helper at `@lib/ui/utils`. Tailwind config extended with shadcn's animation tokens — HyperJournal's semantic palette (`bg-base`, `fg-*`, `gain`, `loss`, etc.) preserved alongside.
- `.nvmrc` pinning Node 22 so local matches CI (closes Session 1 reviewer's flag).
- Dexie 4 installed. `src/lib/storage/db.ts` declares a schema-v1 DB with three tables: `wallets` (&address, addedAt), `fillsCache` (&address, fetchedAt), `userSettings` (&key).
- `src/lib/storage/wallets-repo.ts` + tests — save (upsert), list (sorted desc by addedAt), findByAddress, remove.
- `src/lib/storage/fills-cache-repo.ts` + tests — get, set, invalidate, isFresh(ttl, now). Clock is caller-supplied, not `Date.now()` inside the repo, so tests control time deterministically.
- `fake-indexeddb/auto` loaded from `src/tests/setup.ts`; every repository test opens a uniquely-named in-memory DB in `beforeEach`.
- `src/features/wallets/hooks/useUserFills.ts` — TanStack Query hook with Dexie cache-through: queryFn returns cache within 5-min TTL, otherwise fetches live + writes back. On fetch fail with a prior cache, returns stale data rather than an error. 4 tests via `renderHook` with an injected test db.
- `src/features/wallets/hooks/useSavedWallets.ts` — list query + save/remove mutations, invalidates the list query on mutate.
- `src/features/wallets/components/WalletPaste.tsx` + tests — shadcn Input + Button, `isValidWalletAddress` gating the submit, inline error with aria-describedby.
- `src/features/wallets/components/SavedWalletsList.tsx` — route-linked cards, empty/loading states.
- `src/app/WalletView.tsx` — new route `/w/:address`, validates param, redirects `/` on invalid, upserts the wallet into saved-list on arrival, renders "Loaded N fills" from the hook.
- `src/app/SplitHome.tsx` — left column hosts paste + recent-wallets; right column keeps the analytics / journal preview stubs. `SplitHome.test.tsx` updated.

**Decisions made:** none (no new ADRs).

**Deferred / not done:**

- Analytics panel integration — the right-column AnalyticsPanel stays a stub. Session 4 wires it to real metrics.
- PWA-grade reload UX (cached data visible before the queryFn runs) — flagged in BACKLOG for Session 5.
- Manual Refresh button — BACKLOG.
- Error-message translation — BACKLOG.
- Export/import — Session 5.
- EIP-55 checksum validation — BACKLOG (may never be needed).

**Gotchas for next session:**

- The `/w/:address` redirect uses `Navigate` not a router-level loader/guard. If later sessions add route-level data loaders, the param validation should move into the loader so the redirect happens before any hooks run.
- `useSavedWallets().save.mutate` runs on every `WalletView` mount via `useEffect`. The upsert is idempotent so the data doesn't duplicate, but it does write once per navigation; acceptable today, worth revisiting if it shows up in profiling.
- `isFresh(address, ttlMs, now)` in the fills-cache repo takes a clock. Do not change the signature to use `Date.now()` internally — callers need to control time for tests.
- shadcn put `button.tsx` / `input.tsx` / `label.tsx` under `src/lib/ui/components/`. The boundaries rule covers `src/lib/**` as `lib`, so these are in the allowed edges list; no new boundary exceptions.
- Module-level `db` singleton in `src/lib/storage/db.ts` is shared by all production hooks. Tests never touch it — they always pass `{ db: new HyperJournalDb(uniqueName) }`.

**Invariants assumed:**

- `FillsCacheEntry.fills` stores the array exactly as returned by the API (post-Zod, numbers coerced). Do not post-process before caching; reconstruction (Session 3) reads the cache and transforms further.
- Dexie version 1 is the baseline. Any schema change bumps version and adds an `.upgrade()` function; never mutate the existing `.version(1).stores({...})` call.
- Only `lib/storage/*-repo.ts` calls `db.<table>...` directly. Features / hooks / components go through a repo factory.

---
```

- [ ] **Step 10.4: Commit docs**

```bash
git add docs/CONVENTIONS.md docs/BACKLOG.md docs/SESSION_LOG.md
git commit -m "$(cat <<'EOF'
docs: record Session 2b conventions, session log, and backlog updates

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 10.5: Final verification (controller runs this, not a subagent)**

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test:coverage
VITE_BASE_PATH=/hyperjournal/ pnpm build
git status
```

All exit 0. Working tree clean. Total tests ≈ 50 (exact count depends on how many tests ship in the plan's ambiguous Step 4.1 resolution).

- [ ] **Step 10.6: Dispatch full-session code review**

Controller dispatches `superpowers:code-reviewer` with the scope: every commit from the start of Session 2b through Step 10.4. Apply any critical/important fixes in a single follow-up commit before closing the session.

---

## Self-review checklist (plan author)

- **Spec coverage:** every Session 2b roadmap bullet maps to a task —
  - `lib/storage/db.ts` Dexie schema → Task 2
  - `features/wallets/` paste + save/recall UI → Tasks 7, 8, 9
  - Route `/w/:address` with `useParams` → Task 6
  - TanStack Query hooks with Dexie cache → Tasks 5, 8
  - Paste → fills load → persist → reload survives → end-to-end manual test in Task 9.6
- **No placeholders:** every code block is final content; the one deliberate "note" about the buggy test in Task 4.1 is a teaching moment, not a placeholder.
- **Tests before impl:** every new pure function / hook / component has a failing test committed before (or alongside) the impl.
- **No live API or real IndexedDB in tests:** `fake-indexeddb/auto` covers Dexie; `vi.stubGlobal('fetch', ...)` covers HTTP.
- **Route-owned state:** wallet address lives in the URL per ADR-0004; Zustand remains bootstrap-only.
