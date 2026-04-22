# Phase 1 Session 6 — Export / Import + Playwright E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship a `/settings` route with export (optional cache include) + import (merge-by-upsert) of all Dexie-stored user data, plus the project's first Playwright E2E: paste-flow smoke and an export → import round-trip.

**Architecture:** Three layers, each testable in isolation. Pure-domain functions at `src/domain/export/` own the transform math (build the file shape, merge incoming into existing). Thin repositories at `src/lib/storage/{export,import}-repo.ts` adapt those transforms to Dexie reads/writes. A new `src/app/Settings.tsx` route composes both behind a small UI. Playwright exercises the composed whole end-to-end.

**Tech Stack (new this session):** `@playwright/test@1.47.2` (devDep; no other dependencies added). Re-uses existing `zod`, `dexie`, React/Router stack.

---

## File structure (at end of session)

```
HyperJournal/
├── package.json                                          MODIFY (+test:e2e, +@playwright/test devDep)
├── .gitignore                                            MODIFY (+test-results, +playwright-report, +playwright/.cache)
├── playwright.config.ts                                  NEW
├── e2e/
│   ├── fixtures/
│   │   └── hyperliquid-route.ts                          NEW — shared page.route() helper for HL interception
│   ├── paste-flow.spec.ts                                NEW — Test 1: smoke the paste → /w/:address flow
│   └── export-import.spec.ts                             NEW — Test 2: round-trip export → fresh context → import
├── src/
│   ├── entities/
│   │   ├── user-settings.ts                              NEW — promoted from lib/storage/db.ts
│   │   ├── fills-cache.ts                                NEW — promoted from lib/storage/db.ts
│   │   └── export.ts                                     NEW — ExportFile / ExportSnapshot / MergeResult types
│   ├── domain/
│   │   └── export/
│   │       ├── buildExport.ts                            NEW — pure: snapshot + options → ExportFile
│   │       ├── buildExport.test.ts                       NEW
│   │       ├── mergeImport.ts                            NEW — pure: (existing, incoming) → MergeResult
│   │       └── mergeImport.test.ts                       NEW
│   ├── lib/
│   │   ├── storage/
│   │   │   ├── db.ts                                     MODIFY (re-export promoted entities)
│   │   │   ├── export-repo.ts                            NEW — snapshot reader
│   │   │   ├── export-repo.test.ts                       NEW
│   │   │   ├── import-repo.ts                            NEW — bulk writer under a transaction
│   │   │   └── import-repo.test.ts                       NEW
│   │   └── validation/
│   │       ├── export.ts                                 NEW — ExportFileSchema + _schemaCheck
│   │       └── export.test.ts                            NEW
│   ├── features/
│   │   └── wallets/
│   │       └── components/
│   │           └── WalletHeader.tsx                      MODIFY (+Settings link)
│   └── app/
│       ├── routes.tsx                                    MODIFY (+/settings route)
│       ├── SplitHome.tsx                                 MODIFY (+Settings footer link)
│       ├── Settings.tsx                                  NEW — page shell, mounts ExportPanel + ImportPanel
│       ├── Settings.test.tsx                             NEW
│       ├── settings/
│       │   ├── ExportPanel.tsx                           NEW — includeCache checkbox + Export button
│       │   ├── ExportPanel.test.tsx                      NEW
│       │   ├── ImportPanel.tsx                           NEW — file input + dry-run summary + confirm/cancel
│       │   ├── ImportPanel.test.tsx                      NEW
│       │   └── import-errors.ts                          NEW — pure: Error → human copy map
│       │                                                    (co-located because it's Settings-specific)
└── docs/
    ├── SESSION_LOG.md                                    MODIFY (+Session 6 entry)
    ├── BACKLOG.md                                        MODIFY (+6 entries)
    └── CONVENTIONS.md                                    MODIFY (+§13 Export format, +§14 Playwright E2E)
```

---

## Conventions (for every task)

- Commands from `/Users/angel/Documents/HyperJournal`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- TDD for every file under `src/domain/**`. RED → confirm failure → GREEN → commit. For `lib/storage/**` repos, integration tests with `fake-indexeddb` (already wired via `src/tests/setup.ts`). For UI panels, component tests with RTL.
- Gauntlet after every code task: `pnpm typecheck && pnpm lint && pnpm test`. The final `pnpm build` runs at Task 13.
- The authorized test wallet `0xf318AFb8f0050D140B5D1F58E9537f9eBFE82B14` stays in controller memory only. Fixtures and E2E use the placeholder `0x0000000000000000000000000000000000000001`.
- The existing committed fixture at `tests/fixtures/hyperliquid/user-fills.json` has 100 fills, all anonymized to the placeholder address. Playwright tests read it directly.

---

## Task 1: Promote shared types to entities

The export file format references `Wallet` (already an entity), `UserSettings` (currently in `lib/storage/db.ts`), and `FillsCacheEntry` (ditto). `src/domain/export/` must import these types, and the boundaries rule forbids `domain → lib`. Promote `UserSettings` and `FillsCacheEntry` to entities first — thin move with no behavior change.

**Files:**
- Create: `src/entities/user-settings.ts`
- Create: `src/entities/fills-cache.ts`
- Modify: `src/lib/storage/db.ts` (re-export from entities)

- [ ] **Step 1.1: Create `src/entities/user-settings.ts`**

```ts
/**
 * Singleton user-settings row. Keyed by the literal string 'singleton' so
 * there is exactly one row. Domain and feature layers import this type
 * from @entities — the Dexie schema in @lib/storage/db references the
 * same shape so persistence and usage stay in lockstep.
 */
export type UserSettings = {
  readonly key: 'singleton';
  readonly lastSelectedAddress: string | null;
};
```

- [ ] **Step 1.2: Create `src/entities/fills-cache.ts`**

```ts
import type { RawFill } from './fill';
import type { WalletAddress } from './wallet';

/**
 * Snapshot of fills for a wallet, stored under the wallet's address.
 * fetchedAt is the epoch ms when these fills were returned by the API —
 * used by the cache layer to decide when to refetch.
 */
export type FillsCacheEntry = {
  readonly address: WalletAddress;
  readonly fetchedAt: number;
  readonly fills: ReadonlyArray<RawFill>;
};
```

- [ ] **Step 1.3: Update `src/lib/storage/db.ts` to re-export**

Replace the `FillsCacheEntry` and `UserSettings` declarations in `src/lib/storage/db.ts` with re-exports:

```ts
import Dexie, { type EntityTable } from 'dexie';
import type { Wallet, WalletAddress } from '@entities/wallet';
import type { FillsCacheEntry } from '@entities/fills-cache';
import type { UserSettings } from '@entities/user-settings';

// Re-exported for callers that already import from @lib/storage/db.
// New call sites should prefer @entities/* directly.
export type { FillsCacheEntry } from '@entities/fills-cache';
export type { UserSettings } from '@entities/user-settings';

// The rest of the file (HyperJournalDb class, module-level db) stays the
// same — only the inline type declarations move out.
```

Keep the rest of `db.ts` (the `HyperJournalDb` class and the `db` singleton) unchanged. Delete ONLY the two inline type declarations that used to be in this file.

- [ ] **Step 1.4: Run gauntlet**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green. No test changes needed — `import { FillsCacheEntry } from '@lib/storage/db'` still works through the re-export.

- [ ] **Step 1.5: Commit**

```bash
git add src/entities/user-settings.ts src/entities/fills-cache.ts src/lib/storage/db.ts
git commit -m "$(cat <<'EOF'
refactor(entities): promote UserSettings and FillsCacheEntry from lib/storage

Session 6's export domain imports these shapes, and the boundaries rule
forbids domain → lib. Types move to src/entities with no behavior
change; db.ts re-exports for existing callers while new call sites use
@entities/* directly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Define `ExportFile` entity types

The file-format contract lives at `src/entities/export.ts` — plain TypeScript. The Zod schema in Task 3 verifies mutual assignability with the `_schemaCheck` pattern.

**Files:**
- Create: `src/entities/export.ts`

- [ ] **Step 2.1: Create `src/entities/export.ts`**

```ts
import type { Wallet } from './wallet';
import type { UserSettings } from './user-settings';
import type { FillsCacheEntry } from './fills-cache';

/**
 * A full exportable snapshot of the Dexie-stored user data. Domain
 * consumers receive this shape (not a Dexie handle) so they stay pure.
 */
export type ExportSnapshot = {
  readonly wallets: ReadonlyArray<Wallet>;
  readonly userSettings: UserSettings | null;
  readonly fillsCache: ReadonlyArray<FillsCacheEntry>;
};

/**
 * Options controlling what ends up in the exported file.
 */
export type BuildExportOptions = {
  /** When true, serialize the fillsCache rows; when false, omit the key. */
  readonly includeCache: boolean;
  /** Injectable clock for testing. Defaults to Date.now() at the caller site. */
  readonly now: number;
};

/**
 * The `data` payload of an ExportFile. `fillsCache` is optional — when
 * the user exports without the "Include cached market data" checkbox,
 * this key is omitted entirely (not `null`, not `[]`).
 */
export type ExportData = {
  readonly wallets: ReadonlyArray<Wallet>;
  readonly userSettings: UserSettings | null;
  readonly fillsCache?: ReadonlyArray<FillsCacheEntry>;
};

/**
 * The JSON file format. formatVersion is the contract — breaking changes
 * bump it; additive changes under `data` do not. `app` lets us reject
 * foreign-origin files with a clear error before the heavier Zod check.
 */
export type ExportFile = {
  readonly app: 'HyperJournal';
  readonly formatVersion: 1;
  readonly exportedAt: number;
  readonly data: ExportData;
};

/**
 * Result of merging an incoming ExportFile into the existing Dexie state.
 * A `MergeResult` is exactly the set of writes the import-repo will
 * apply inside a single transaction; `summary` is the human-readable
 * breakdown the UI shows before committing.
 */
export type MergeResult = {
  readonly walletsToUpsert: ReadonlyArray<Wallet>;
  readonly userSettingsToOverwrite: UserSettings | null;
  readonly fillsCacheToUpsert: ReadonlyArray<FillsCacheEntry>;
  readonly summary: {
    readonly walletsAdded: number;
    readonly walletsUpdated: number;
    readonly userSettingsOverwritten: boolean;
    readonly fillsCacheEntries: number;
  };
};
```

- [ ] **Step 2.2: Run gauntlet**

```bash
pnpm typecheck && pnpm lint
```

Expected: green. Nothing imports from `@entities/export` yet, so no test changes.

- [ ] **Step 2.3: Commit**

```bash
git add src/entities/export.ts
git commit -m "$(cat <<'EOF'
feat(entities): add ExportFile / ExportSnapshot / MergeResult types

Session 6's export-domain contract. ExportFile is the JSON file format
(formatVersion 1, app-identity "HyperJournal", extensible data envelope
with optional fillsCache). ExportSnapshot is the buildExport input
shape (always contains all three tables); BuildExportOptions carries
the includeCache flag and an injectable clock. MergeResult is the set
of writes the import-repo applies plus a UI-ready summary.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `ExportFileSchema` + `parseExport` (Zod validation)

**Files:**
- Create: `src/lib/validation/export.ts`
- Create: `src/lib/validation/export.test.ts`

- [ ] **Step 3.1: Write failing tests (RED)**

Create `src/lib/validation/export.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ExportFileSchema, parseExport } from './export';

const validFile = {
  app: 'HyperJournal',
  formatVersion: 1,
  exportedAt: 1714000000000,
  data: {
    wallets: [
      { address: '0x0000000000000000000000000000000000000001', label: null, addedAt: 1713000000000 },
    ],
    userSettings: null,
  },
};

describe('ExportFileSchema', () => {
  it('parses a minimal valid file (no fillsCache)', () => {
    const out = ExportFileSchema.parse(validFile);
    expect(out.data.wallets).toHaveLength(1);
    expect(out.data.fillsCache).toBeUndefined();
    expect(out.data.userSettings).toBeNull();
  });

  it('parses a file with userSettings singleton', () => {
    const out = ExportFileSchema.parse({
      ...validFile,
      data: {
        ...validFile.data,
        userSettings: { key: 'singleton', lastSelectedAddress: '0x0000000000000000000000000000000000000001' },
      },
    });
    expect(out.data.userSettings).toEqual({
      key: 'singleton',
      lastSelectedAddress: '0x0000000000000000000000000000000000000001',
    });
  });

  it('parses a file with fillsCache rows', () => {
    const out = ExportFileSchema.parse({
      ...validFile,
      data: {
        ...validFile.data,
        fillsCache: [
          { address: '0x0000000000000000000000000000000000000001', fetchedAt: 1714000000000, fills: [] },
        ],
      },
    });
    expect(out.data.fillsCache).toHaveLength(1);
  });

  it('rejects a file with app !== "HyperJournal"', () => {
    expect(() => ExportFileSchema.parse({ ...validFile, app: 'SomethingElse' })).toThrow();
  });

  it('rejects a file with formatVersion !== 1', () => {
    expect(() => ExportFileSchema.parse({ ...validFile, formatVersion: 2 })).toThrow();
  });

  it('rejects a file with missing required fields', () => {
    expect(() => ExportFileSchema.parse({})).toThrow();
  });

  it('rejects a wallets row with a non-hex address', () => {
    expect(() =>
      ExportFileSchema.parse({
        ...validFile,
        data: {
          ...validFile.data,
          wallets: [{ address: 'not-a-hex', label: null, addedAt: 1 }],
        },
      }),
    ).toThrow();
  });
});

describe('parseExport', () => {
  it('returns the parsed file on valid input', () => {
    expect(parseExport(validFile).formatVersion).toBe(1);
  });

  it('throws ZodError on invalid input', () => {
    expect(() => parseExport({ nope: true })).toThrow();
  });
});
```

- [ ] **Step 3.2: Run — confirm RED**

```bash
pnpm test src/lib/validation/export.test.ts
```

Expected: fails with "Cannot find module './export'".

- [ ] **Step 3.3: Implement `src/lib/validation/export.ts`**

```ts
import { z } from 'zod';
import type { ExportFile } from '@entities/export';

const WalletAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'expected 0x-prefixed 40-hex-char address');

const WalletSchema = z.object({
  address: WalletAddressSchema,
  label: z.string().nullable(),
  addedAt: z.number().int().nonnegative(),
});

const UserSettingsSchema = z
  .object({
    key: z.literal('singleton'),
    lastSelectedAddress: z.string().nullable(),
  })
  .nullable();

// RawFill here mirrors the shape from tests/fixtures/hyperliquid/user-fills.json.
// We accept numbers (post-coerce) because our own exports write post-coerce.
// Numeric-string tolerance would be needed if we ever imported a raw HL response
// directly — we don't.
const RawFillExportedSchema = z.object({
  coin: z.string().min(1),
  px: z.number(),
  sz: z.number(),
  side: z.enum(['B', 'A']),
  time: z.number().int().positive(),
  startPosition: z.number(),
  dir: z.string(),
  closedPnl: z.number(),
  hash: z.string(),
  oid: z.number().int().nonnegative(),
  crossed: z.boolean(),
  fee: z.number(),
  tid: z.number().int().nonnegative(),
  feeToken: z.string().min(1),
  twapId: z.number().int().nonnegative().nullable(),
});

const FillsCacheEntrySchema = z.object({
  address: WalletAddressSchema,
  fetchedAt: z.number().int().nonnegative(),
  fills: z.array(RawFillExportedSchema),
});

const ExportDataSchema = z.object({
  wallets: z.array(WalletSchema),
  userSettings: UserSettingsSchema,
  fillsCache: z.array(FillsCacheEntrySchema).optional(),
});

export const ExportFileSchema = z.object({
  app: z.literal('HyperJournal'),
  formatVersion: z.literal(1),
  exportedAt: z.number().int().nonnegative(),
  data: ExportDataSchema,
});

/**
 * Parse a raw `unknown` (typically `JSON.parse` of a file's text) into a
 * typed ExportFile. Throws ZodError on any shape mismatch. Callers wrap
 * this in the Settings UI error-copy mapping.
 */
export function parseExport(raw: unknown) {
  return ExportFileSchema.parse(raw);
}

/**
 * Compile-time assertion: the Zod schema's output shape must be mutually
 * assignable with the stable ExportFile type at @entities/export. If the
 * schema widens (new field) or the entity narrows (field removed) without
 * the other also updating, tsc --noEmit fails at this line.
 */
type _SchemaMatchesEntity = z.infer<typeof ExportFileSchema> extends ExportFile
  ? ExportFile extends z.infer<typeof ExportFileSchema>
    ? true
    : 'ExportFileSchema is missing a field that ExportFile declares'
  : 'ExportFileSchema produces a field that ExportFile does not declare';
const _schemaCheck: _SchemaMatchesEntity = true;
void _schemaCheck;
```

- [ ] **Step 3.4: Run — confirm GREEN**

```bash
pnpm test src/lib/validation/export.test.ts && pnpm typecheck
```

Expected: 9 tests pass; typecheck clean.

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/validation/export.ts src/lib/validation/export.test.ts
git commit -m "$(cat <<'EOF'
feat(validation): add ExportFileSchema + parseExport

Zod validation of the Session 6 export file format. Literal-checks on
app ("HyperJournal") and formatVersion (1) so foreign-origin and
newer-version files fail fast with actionable Zod errors. RawFill
fields inside fillsCache are typed as numbers (our own exports write
post-coerce) — we do not import raw HL JSON directly. Mirrors the
_schemaCheck pattern from hyperliquid.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `buildExport` pure-domain function

**Files:**
- Create: `src/domain/export/buildExport.ts`
- Create: `src/domain/export/buildExport.test.ts`

- [ ] **Step 4.1: Write failing tests (RED)**

Create `src/domain/export/buildExport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildExport } from './buildExport';
import type { ExportSnapshot } from '@entities/export';
import type { WalletAddress } from '@entities/wallet';

const ADDR = '0x0000000000000000000000000000000000000001' as WalletAddress;

const baseSnapshot: ExportSnapshot = {
  wallets: [{ address: ADDR, label: null, addedAt: 100 }],
  userSettings: { key: 'singleton', lastSelectedAddress: ADDR },
  fillsCache: [{ address: ADDR, fetchedAt: 200, fills: [] }],
};

describe('buildExport', () => {
  it('returns a file with the expected envelope fields', () => {
    const file = buildExport(baseSnapshot, { includeCache: false, now: 1714000000000 });
    expect(file.app).toBe('HyperJournal');
    expect(file.formatVersion).toBe(1);
    expect(file.exportedAt).toBe(1714000000000);
  });

  it('always includes wallets and userSettings in data', () => {
    const file = buildExport(baseSnapshot, { includeCache: false, now: 0 });
    expect(file.data.wallets).toHaveLength(1);
    expect(file.data.userSettings).toEqual({
      key: 'singleton',
      lastSelectedAddress: ADDR,
    });
  });

  it('omits fillsCache entirely when includeCache is false', () => {
    const file = buildExport(baseSnapshot, { includeCache: false, now: 0 });
    expect(file.data.fillsCache).toBeUndefined();
    expect('fillsCache' in file.data).toBe(false);
  });

  it('includes fillsCache when includeCache is true', () => {
    const file = buildExport(baseSnapshot, { includeCache: true, now: 0 });
    expect(file.data.fillsCache).toHaveLength(1);
  });

  it('emits userSettings: null when the snapshot has none', () => {
    const snap: ExportSnapshot = { ...baseSnapshot, userSettings: null };
    const file = buildExport(snap, { includeCache: false, now: 0 });
    expect(file.data.userSettings).toBeNull();
  });

  it('is deterministic for the same input', () => {
    const a = buildExport(baseSnapshot, { includeCache: true, now: 100 });
    const b = buildExport(baseSnapshot, { includeCache: true, now: 100 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('does not mutate the input snapshot', () => {
    const snap: ExportSnapshot = {
      wallets: [{ address: ADDR, label: null, addedAt: 100 }],
      userSettings: null,
      fillsCache: [],
    };
    const walletsBefore = snap.wallets;
    buildExport(snap, { includeCache: true, now: 0 });
    expect(snap.wallets).toBe(walletsBefore);
  });
});
```

- [ ] **Step 4.2: Run — confirm RED**

```bash
pnpm test src/domain/export/buildExport.test.ts
```

Expected: "Cannot find module './buildExport'".

- [ ] **Step 4.3: Implement `src/domain/export/buildExport.ts`**

```ts
import type {
  BuildExportOptions,
  ExportData,
  ExportFile,
  ExportSnapshot,
} from '@entities/export';

/**
 * Pure. Produces the file-format shape from a Dexie snapshot + export
 * options. fillsCache is omitted (not null, not []) when includeCache is
 * false so the resulting JSON has no fillsCache key at all — stays in
 * lockstep with ExportFileSchema's `.optional()`.
 */
export function buildExport(
  snapshot: ExportSnapshot,
  options: BuildExportOptions,
): ExportFile {
  const data: ExportData = options.includeCache
    ? {
        wallets: snapshot.wallets,
        userSettings: snapshot.userSettings,
        fillsCache: snapshot.fillsCache,
      }
    : {
        wallets: snapshot.wallets,
        userSettings: snapshot.userSettings,
      };

  return {
    app: 'HyperJournal',
    formatVersion: 1,
    exportedAt: options.now,
    data,
  };
}
```

- [ ] **Step 4.4: Run — confirm GREEN**

```bash
pnpm test src/domain/export/buildExport.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add src/domain/export/buildExport.ts src/domain/export/buildExport.test.ts
git commit -m "$(cat <<'EOF'
feat(export): add buildExport pure-domain function

Produces the ExportFile shape from an ExportSnapshot + options.
Deterministic, clock-injected via options.now. Omits the fillsCache
key entirely (not empty array, not null) when includeCache is false,
matching ExportFileSchema's .optional() shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `mergeImport` pure-domain function

**Files:**
- Create: `src/domain/export/mergeImport.ts`
- Create: `src/domain/export/mergeImport.test.ts`

- [ ] **Step 5.1: Write failing tests (RED)**

Create `src/domain/export/mergeImport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mergeImport } from './mergeImport';
import type { ExportFile, ExportSnapshot } from '@entities/export';
import type { WalletAddress } from '@entities/wallet';

const A = '0x000000000000000000000000000000000000000A' as WalletAddress;
const B = '0x000000000000000000000000000000000000000B' as WalletAddress;

const emptySnapshot: ExportSnapshot = {
  wallets: [],
  userSettings: null,
  fillsCache: [],
};

function makeFile(overrides: Partial<ExportFile['data']> = {}): ExportFile {
  return {
    app: 'HyperJournal',
    formatVersion: 1,
    exportedAt: 1714000000000,
    data: {
      wallets: [],
      userSettings: null,
      ...overrides,
    },
  };
}

describe('mergeImport', () => {
  it('adds new wallets when the existing state is empty', () => {
    const file = makeFile({
      wallets: [{ address: A, label: null, addedAt: 1 }],
    });
    const result = mergeImport(emptySnapshot, file);
    expect(result.walletsToUpsert).toHaveLength(1);
    expect(result.summary.walletsAdded).toBe(1);
    expect(result.summary.walletsUpdated).toBe(0);
  });

  it('upserts (incoming wins) when a wallet already exists by address', () => {
    const existing: ExportSnapshot = {
      wallets: [{ address: A, label: 'old', addedAt: 100 }],
      userSettings: null,
      fillsCache: [],
    };
    const file = makeFile({
      wallets: [{ address: A, label: 'new', addedAt: 200 }],
    });
    const result = mergeImport(existing, file);
    expect(result.walletsToUpsert).toEqual([{ address: A, label: 'new', addedAt: 200 }]);
    expect(result.summary.walletsAdded).toBe(0);
    expect(result.summary.walletsUpdated).toBe(1);
  });

  it('distinguishes added vs updated walletsToUpsert when mixed', () => {
    const existing: ExportSnapshot = {
      wallets: [{ address: A, label: 'old', addedAt: 100 }],
      userSettings: null,
      fillsCache: [],
    };
    const file = makeFile({
      wallets: [
        { address: A, label: 'new', addedAt: 200 },
        { address: B, label: null, addedAt: 300 },
      ],
    });
    const result = mergeImport(existing, file);
    expect(result.walletsToUpsert).toHaveLength(2);
    expect(result.summary.walletsAdded).toBe(1);
    expect(result.summary.walletsUpdated).toBe(1);
  });

  it('overwrites userSettings when the file carries one', () => {
    const file = makeFile({
      userSettings: { key: 'singleton', lastSelectedAddress: A },
    });
    const result = mergeImport(emptySnapshot, file);
    expect(result.userSettingsToOverwrite).toEqual({
      key: 'singleton',
      lastSelectedAddress: A,
    });
    expect(result.summary.userSettingsOverwritten).toBe(true);
  });

  it('does not overwrite userSettings when the file carries null', () => {
    const existing: ExportSnapshot = {
      wallets: [],
      userSettings: { key: 'singleton', lastSelectedAddress: A },
      fillsCache: [],
    };
    const file = makeFile({ userSettings: null });
    const result = mergeImport(existing, file);
    expect(result.userSettingsToOverwrite).toBeNull();
    expect(result.summary.userSettingsOverwritten).toBe(false);
  });

  it('upserts fillsCache entries when present in the file', () => {
    const file: ExportFile = {
      app: 'HyperJournal',
      formatVersion: 1,
      exportedAt: 0,
      data: {
        wallets: [],
        userSettings: null,
        fillsCache: [{ address: A, fetchedAt: 0, fills: [] }],
      },
    };
    const result = mergeImport(emptySnapshot, file);
    expect(result.fillsCacheToUpsert).toHaveLength(1);
    expect(result.summary.fillsCacheEntries).toBe(1);
  });

  it('emits an empty fillsCacheToUpsert when the file has no fillsCache key', () => {
    const file = makeFile(); // no fillsCache
    const result = mergeImport(emptySnapshot, file);
    expect(result.fillsCacheToUpsert).toEqual([]);
    expect(result.summary.fillsCacheEntries).toBe(0);
  });
});
```

- [ ] **Step 5.2: Run — confirm RED**

```bash
pnpm test src/domain/export/mergeImport.test.ts
```

Expected: "Cannot find module './mergeImport'".

- [ ] **Step 5.3: Implement `src/domain/export/mergeImport.ts`**

```ts
import type { ExportFile, ExportSnapshot, MergeResult } from '@entities/export';

/**
 * Pure. Computes the set of writes to apply to Dexie given an existing
 * snapshot and an incoming ExportFile. Strategy for v1:
 *
 *   - wallets: upsert by address. Incoming wins on conflict.
 *   - userSettings: overwrite (singleton row, latest wins). null in the
 *     file means "don't overwrite" — no explicit delete path today.
 *   - fillsCache: upsert by address IFF the file carries a fillsCache key.
 *
 * The `summary` breakdown is what the Settings UI shows before the user
 * confirms the import; the three writes lists are consumed by import-repo
 * as a single Dexie transaction.
 */
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

  return {
    walletsToUpsert,
    userSettingsToOverwrite,
    fillsCacheToUpsert,
    summary: {
      walletsAdded,
      walletsUpdated,
      userSettingsOverwritten,
      fillsCacheEntries: fillsCacheToUpsert.length,
    },
  };
}
```

- [ ] **Step 5.4: Run — confirm GREEN**

```bash
pnpm test src/domain/export/mergeImport.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5.5: Commit**

```bash
git add src/domain/export/mergeImport.ts src/domain/export/mergeImport.test.ts
git commit -m "$(cat <<'EOF'
feat(export): add mergeImport pure-domain function

Computes the write set (walletsToUpsert, userSettingsToOverwrite,
fillsCacheToUpsert) plus a human-readable summary from an existing
Dexie snapshot and an incoming ExportFile. Fixed upsert strategy
for v1: wallets by address (incoming wins), userSettings overwrite
on non-null, fillsCache by address when present in the file. No
deletion path — journaling deletions will be a Session 7+ concern
if/when they're needed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Snapshot-reader repo

**Files:**
- Create: `src/lib/storage/export-repo.ts`
- Create: `src/lib/storage/export-repo.test.ts`

- [ ] **Step 6.1: Write failing tests (RED)**

Create `src/lib/storage/export-repo.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HyperJournalDb } from './db';
import { createExportRepo } from './export-repo';
import type { WalletAddress } from '@entities/wallet';

const ADDR = '0x0000000000000000000000000000000000000001' as WalletAddress;

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`export-repo-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

describe('createExportRepo', () => {
  it('readSnapshot returns empty tables when Dexie is fresh', async () => {
    const repo = createExportRepo(db);
    const snap = await repo.readSnapshot();
    expect(snap.wallets).toEqual([]);
    expect(snap.userSettings).toBeNull();
    expect(snap.fillsCache).toEqual([]);
  });

  it('readSnapshot returns all wallet rows', async () => {
    await db.wallets.put({ address: ADDR, label: null, addedAt: 1 });
    const repo = createExportRepo(db);
    const snap = await repo.readSnapshot();
    expect(snap.wallets).toHaveLength(1);
    expect(snap.wallets[0]!.address).toBe(ADDR);
  });

  it('readSnapshot returns the userSettings singleton when present', async () => {
    await db.userSettings.put({ key: 'singleton', lastSelectedAddress: ADDR });
    const repo = createExportRepo(db);
    const snap = await repo.readSnapshot();
    expect(snap.userSettings).toEqual({
      key: 'singleton',
      lastSelectedAddress: ADDR,
    });
  });

  it('readSnapshot returns all fillsCache rows', async () => {
    await db.fillsCache.put({ address: ADDR, fetchedAt: 42, fills: [] });
    const repo = createExportRepo(db);
    const snap = await repo.readSnapshot();
    expect(snap.fillsCache).toHaveLength(1);
    expect(snap.fillsCache[0]!.fetchedAt).toBe(42);
  });
});
```

- [ ] **Step 6.2: Run — confirm RED**

```bash
pnpm test src/lib/storage/export-repo.test.ts
```

Expected: "Cannot find module './export-repo'".

- [ ] **Step 6.3: Implement `src/lib/storage/export-repo.ts`**

```ts
import type { ExportSnapshot } from '@entities/export';
import type { HyperJournalDb } from './db';

export type ExportRepo = {
  readSnapshot(): Promise<ExportSnapshot>;
};

/**
 * One-shot reader that pulls every row from every Dexie table into a
 * plain ExportSnapshot. No transformations — the domain layer decides
 * what ends up in the exported file.
 */
export function createExportRepo(db: HyperJournalDb): ExportRepo {
  return {
    async readSnapshot() {
      const [wallets, userSettings, fillsCache] = await Promise.all([
        db.wallets.toArray(),
        db.userSettings.get('singleton'),
        db.fillsCache.toArray(),
      ]);
      return {
        wallets,
        userSettings: userSettings ?? null,
        fillsCache,
      };
    },
  };
}
```

- [ ] **Step 6.4: Run — confirm GREEN**

```bash
pnpm test src/lib/storage/export-repo.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 6.5: Commit**

```bash
git add src/lib/storage/export-repo.ts src/lib/storage/export-repo.test.ts
git commit -m "$(cat <<'EOF'
feat(storage): add createExportRepo snapshot reader

Reads every row from every Dexie table into an ExportSnapshot in a
single Promise.all. No transformations — buildExport decides what
ends up in the file. Mirrors the existing createWalletsRepo factory
pattern.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Import writer repo

**Files:**
- Create: `src/lib/storage/import-repo.ts`
- Create: `src/lib/storage/import-repo.test.ts`

- [ ] **Step 7.1: Write failing tests (RED)**

Create `src/lib/storage/import-repo.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HyperJournalDb } from './db';
import { createImportRepo } from './import-repo';
import type { MergeResult } from '@entities/export';
import type { WalletAddress } from '@entities/wallet';

const A = '0x000000000000000000000000000000000000000A' as WalletAddress;
const B = '0x000000000000000000000000000000000000000B' as WalletAddress;

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`import-repo-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

const emptyResult: MergeResult = {
  walletsToUpsert: [],
  userSettingsToOverwrite: null,
  fillsCacheToUpsert: [],
  summary: {
    walletsAdded: 0,
    walletsUpdated: 0,
    userSettingsOverwritten: false,
    fillsCacheEntries: 0,
  },
};

describe('createImportRepo', () => {
  it('applyMerge with an empty result is a no-op', async () => {
    const repo = createImportRepo(db);
    await repo.applyMerge(emptyResult);
    expect(await db.wallets.count()).toBe(0);
  });

  it('applyMerge upserts wallets, incoming wins on conflict', async () => {
    await db.wallets.put({ address: A, label: 'old', addedAt: 1 });
    const repo = createImportRepo(db);
    await repo.applyMerge({
      ...emptyResult,
      walletsToUpsert: [
        { address: A, label: 'new', addedAt: 2 },
        { address: B, label: null, addedAt: 3 },
      ],
    });
    const all = await db.wallets.toArray();
    expect(all).toHaveLength(2);
    const byAddr = Object.fromEntries(all.map((w) => [w.address, w]));
    expect(byAddr[A]!.label).toBe('new');
    expect(byAddr[A]!.addedAt).toBe(2);
    expect(byAddr[B]!.label).toBeNull();
  });

  it('applyMerge overwrites userSettings when non-null', async () => {
    const repo = createImportRepo(db);
    await repo.applyMerge({
      ...emptyResult,
      userSettingsToOverwrite: { key: 'singleton', lastSelectedAddress: A },
    });
    expect(await db.userSettings.get('singleton')).toEqual({
      key: 'singleton',
      lastSelectedAddress: A,
    });
  });

  it('applyMerge does NOT touch userSettings when the overwrite is null', async () => {
    await db.userSettings.put({ key: 'singleton', lastSelectedAddress: A });
    const repo = createImportRepo(db);
    await repo.applyMerge(emptyResult);
    expect(await db.userSettings.get('singleton')).toEqual({
      key: 'singleton',
      lastSelectedAddress: A,
    });
  });

  it('applyMerge upserts fillsCache entries', async () => {
    const repo = createImportRepo(db);
    await repo.applyMerge({
      ...emptyResult,
      fillsCacheToUpsert: [{ address: A, fetchedAt: 42, fills: [] }],
    });
    const row = await db.fillsCache.get(A);
    expect(row?.fetchedAt).toBe(42);
  });
});
```

- [ ] **Step 7.2: Run — confirm RED**

```bash
pnpm test src/lib/storage/import-repo.test.ts
```

Expected: "Cannot find module './import-repo'".

- [ ] **Step 7.3: Implement `src/lib/storage/import-repo.ts`**

```ts
import type { MergeResult } from '@entities/export';
import type { HyperJournalDb } from './db';

export type ImportRepo = {
  applyMerge(result: MergeResult): Promise<void>;
};

/**
 * Applies a MergeResult to Dexie inside a single transaction. All three
 * tables are declared in the transaction scope so rollback is atomic if
 * any one write fails — matters less today (all puts are independent)
 * but matters a lot when journaling tables join in Phase 3.
 */
export function createImportRepo(db: HyperJournalDb): ImportRepo {
  return {
    async applyMerge(result) {
      await db.transaction('rw', db.wallets, db.userSettings, db.fillsCache, async () => {
        if (result.walletsToUpsert.length > 0) {
          await db.wallets.bulkPut(result.walletsToUpsert.slice());
        }
        if (result.userSettingsToOverwrite !== null) {
          await db.userSettings.put(result.userSettingsToOverwrite);
        }
        if (result.fillsCacheToUpsert.length > 0) {
          await db.fillsCache.bulkPut(result.fillsCacheToUpsert.slice());
        }
      });
    },
  };
}
```

- [ ] **Step 7.4: Run — confirm GREEN**

```bash
pnpm test src/lib/storage/import-repo.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 7.5: Commit**

```bash
git add src/lib/storage/import-repo.ts src/lib/storage/import-repo.test.ts
git commit -m "$(cat <<'EOF'
feat(storage): add createImportRepo that applies MergeResult atomically

Single Dexie transaction across wallets, userSettings, and fillsCache.
Only writes non-empty arrays and non-null userSettings so applying an
empty merge is a no-op. .slice() on readonly arrays before bulkPut
because Dexie mutates the input array when assigning auto-increment
IDs (not relevant for our & primary keys but defensive).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Import error-copy mapping

**Files:**
- Create: `src/app/settings/import-errors.ts`
- Create: `src/app/settings/import-errors.test.ts`

- [ ] **Step 8.1: Write failing tests (RED)**

Create `src/app/settings/import-errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ZodError, z } from 'zod';
import { importErrorCopyFor } from './import-errors';

describe('importErrorCopyFor', () => {
  it('returns the JSON-parse message for SyntaxError', () => {
    const copy = importErrorCopyFor(new SyntaxError('Unexpected token'));
    expect(copy.heading).toMatch(/valid JSON/i);
  });

  it('returns the foreign-app message when the Zod issue points at the app field', () => {
    const schema = z.object({ app: z.literal('HyperJournal') });
    try {
      schema.parse({ app: 'SomethingElse' });
    } catch (err) {
      const copy = importErrorCopyFor(err as ZodError);
      expect(copy.heading).toMatch(/different application/i);
      return;
    }
    throw new Error('expected ZodError');
  });

  it('returns the newer-version message when a formatVersion issue has a value > 1', () => {
    const schema = z.object({ formatVersion: z.literal(1) });
    try {
      schema.parse({ formatVersion: 2 });
    } catch (err) {
      const copy = importErrorCopyFor(err as ZodError);
      expect(copy.heading).toMatch(/newer version/i);
      return;
    }
    throw new Error('expected ZodError');
  });

  it('returns a generic shape-mismatch message for other ZodErrors', () => {
    const schema = z.object({ somethingElse: z.string() });
    try {
      schema.parse({});
    } catch (err) {
      const copy = importErrorCopyFor(err as ZodError);
      expect(copy.heading).toMatch(/doesn.t match/i);
    }
  });

  it('returns a generic fallback for an unknown error', () => {
    const copy = importErrorCopyFor(new Error('boom'));
    expect(copy.heading).toMatch(/something went wrong/i);
  });
});
```

- [ ] **Step 8.2: Run — confirm RED**

```bash
pnpm test src/app/settings/import-errors.test.ts
```

Expected: "Cannot find module './import-errors'".

- [ ] **Step 8.3: Implement `src/app/settings/import-errors.ts`**

```ts
import { ZodError } from 'zod';

export type ImportErrorCopy = {
  readonly heading: string;
};

/**
 * Map a parse/validate/commit error from the import pipeline to human
 * copy per CONVENTIONS §12. Recognizes:
 *   - SyntaxError → JSON parse failure
 *   - ZodError with app-path issue → foreign-origin file
 *   - ZodError with formatVersion-path issue and value > 1 → newer version
 *   - Other ZodError → generic shape mismatch
 *   - Other Error → generic fallback
 */
export function importErrorCopyFor(error: unknown): ImportErrorCopy {
  if (error instanceof SyntaxError) {
    return {
      heading:
        "That file doesn't look like a HyperJournal export. Check the file is valid JSON.",
    };
  }
  if (error instanceof ZodError) {
    for (const issue of error.issues) {
      if (issue.path[0] === 'app') {
        return { heading: 'That file was exported from a different application.' };
      }
      if (issue.path[0] === 'formatVersion') {
        const received = issue.code === 'invalid_literal' ? issue.received : undefined;
        if (typeof received === 'number' && received > 1) {
          return {
            heading:
              'That file was exported from a newer version of HyperJournal. Update and try again.',
          };
        }
      }
    }
    return {
      heading:
        "That file is a HyperJournal export but the data doesn't match what this version understands. Please report this.",
    };
  }
  return { heading: 'Something went wrong. Try again.' };
}
```

- [ ] **Step 8.4: Run — confirm GREEN**

```bash
pnpm test src/app/settings/import-errors.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 8.5: Commit**

```bash
git add src/app/settings/import-errors.ts src/app/settings/import-errors.test.ts
git commit -m "$(cat <<'EOF'
feat(settings): map import errors to human copy per CONVENTIONS §12

Five error branches: JSON parse failure, ZodError pointing at the app
field (foreign origin), ZodError with formatVersion > 1 (newer
version), other ZodError (generic shape mismatch), generic fallback.
Each returns a one-line heading the ImportPanel renders with a
recovery action.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `/settings` route + `Settings` shell + nav links

**Files:**
- Create: `src/app/Settings.tsx`
- Create: `src/app/Settings.test.tsx`
- Modify: `src/app/routes.tsx`
- Modify: `src/features/wallets/components/WalletHeader.tsx`
- Modify: `src/app/SplitHome.tsx`

- [ ] **Step 9.1: Write failing test for the page shell (RED)**

Create `src/app/Settings.test.tsx`:

```tsx
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Settings } from './Settings';

afterEach(() => cleanup());

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Settings', () => {
  it('renders a heading', () => {
    renderSettings();
    expect(screen.getByRole('heading', { name: /settings/i, level: 1 })).toBeInTheDocument();
  });

  it('has a Data section landmark', () => {
    renderSettings();
    expect(screen.getByRole('region', { name: /data/i })).toBeInTheDocument();
  });

  it('renders a Back link to /', () => {
    renderSettings();
    const back = screen.getByRole('link', { name: /back/i });
    expect(back).toHaveAttribute('href', '/');
  });
});
```

- [ ] **Step 9.2: Run — confirm RED**

```bash
pnpm test src/app/Settings.test.tsx
```

Expected: "Cannot find module './Settings'".

- [ ] **Step 9.3: Create `src/app/Settings.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { ExportPanel } from './settings/ExportPanel';
import { ImportPanel } from './settings/ImportPanel';

export function Settings() {
  return (
    <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-fg-base">Settings</h1>
        <Link
          to="/"
          className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          ← Back
        </Link>
      </header>

      <section
        aria-labelledby="settings-data-heading"
        className="flex flex-col gap-4 rounded-lg border border-border bg-bg-raised p-6"
      >
        <h2
          id="settings-data-heading"
          className="text-lg font-semibold text-fg-base"
        >
          Data
        </h2>
        <ExportPanel />
        <ImportPanel />
      </section>
    </main>
  );
}
```

- [ ] **Step 9.4: Create stub `ExportPanel` and `ImportPanel` to satisfy the shell test**

Create `src/app/settings/ExportPanel.tsx`:

```tsx
export function ExportPanel() {
  return <div data-testid="export-panel">Export (placeholder)</div>;
}
```

Create `src/app/settings/ImportPanel.tsx`:

```tsx
export function ImportPanel() {
  return <div data-testid="import-panel">Import (placeholder)</div>;
}
```

These stubs get fleshed out in Tasks 10 and 11. They exist now so `Settings.test.tsx` renders without import failure.

- [ ] **Step 9.5: Run — confirm GREEN**

```bash
pnpm test src/app/Settings.test.tsx
```

Expected: 3 tests pass.

- [ ] **Step 9.6: Register the route**

Modify `src/app/routes.tsx`:

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { SplitHome } from './SplitHome';
import { WalletView } from './WalletView';
import { Settings } from './Settings';

const router = createBrowserRouter(
  [
    { path: '/', element: <SplitHome /> },
    { path: '/w/:address', element: <WalletView /> },
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

- [ ] **Step 9.7: Add Settings link to WalletHeader**

In `src/features/wallets/components/WalletHeader.tsx`, add a second link next to the Back link:

```tsx
        <Link
          to="/settings"
          className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Settings
        </Link>
```

Place it BEFORE the existing Back link (so visual order is Refresh → Settings → Back).

- [ ] **Step 9.8: Add Settings link to SplitHome**

In `src/app/SplitHome.tsx`, add a footer link to the `<main>`:

At the very bottom of the main grid, after the two columns, insert:

```tsx
      <footer className="col-span-full flex justify-end pt-2">
        <Link
          to="/settings"
          className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Settings
        </Link>
      </footer>
```

`Link` is not currently imported in `SplitHome.tsx` — add it to the existing `react-router-dom` import so the line becomes `import { useNavigate, Link } from 'react-router-dom';`.

- [ ] **Step 9.9: Run full gauntlet**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green. WalletHeader.test.tsx and SplitHome.test.tsx do not assert on the Settings link yet, so they still pass.

- [ ] **Step 9.10: Commit**

```bash
git add src/app/Settings.tsx \
        src/app/Settings.test.tsx \
        src/app/settings/ExportPanel.tsx \
        src/app/settings/ImportPanel.tsx \
        src/app/routes.tsx \
        src/features/wallets/components/WalletHeader.tsx \
        src/app/SplitHome.tsx
git commit -m "$(cat <<'EOF'
feat(app): add /settings route with Settings shell and nav links

Shell carries a Data section landmark plus a Back link; ExportPanel
and ImportPanel are placeholder stubs fleshed out in the next two
commits. Navigation: Settings link sits between Refresh and Back in
WalletHeader; a footer-right link on SplitHome. Both use the standard
focus-visible ring string.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `ExportPanel` — includeCache checkbox + Export button

**Files:**
- Modify: `src/app/settings/ExportPanel.tsx`
- Create: `src/app/settings/ExportPanel.test.tsx`

- [ ] **Step 10.1: Write failing tests (RED)**

Create `src/app/settings/ExportPanel.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExportPanel } from './ExportPanel';
import { HyperJournalDb } from '@lib/storage/db';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`export-panel-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExportPanel db={db} />
    </QueryClientProvider>,
  );
}

describe('ExportPanel', () => {
  it('renders the include-cache checkbox, unchecked by default', () => {
    renderPanel();
    const cb = screen.getByRole('checkbox', { name: /include cached market data/i });
    expect(cb).not.toBeChecked();
  });

  it('renders the Export button', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /export data/i })).toBeInTheDocument();
  });

  it('clicking Export creates an object URL and triggers a download', async () => {
    await db.wallets.put({
      address: '0x0000000000000000000000000000000000000001' as never,
      label: null,
      addedAt: 1,
    });
    const createObjectURL = vi.fn().mockReturnValue('blob:test-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /export data/i }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());

    // The blob passed to createObjectURL should be JSON with
    // app:"HyperJournal" and formatVersion:1.
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(parsed.app).toBe('HyperJournal');
    expect(parsed.formatVersion).toBe(1);
    expect(parsed.data.wallets).toHaveLength(1);
    // fillsCache key absent when the box is unchecked
    expect(parsed.data.fillsCache).toBeUndefined();
  });

  it('checking include-cache produces a file with a fillsCache key', async () => {
    await db.fillsCache.put({
      address: '0x0000000000000000000000000000000000000001' as never,
      fetchedAt: 1,
      fills: [],
    });
    const createObjectURL = vi.fn().mockReturnValue('blob:test-url');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });

    renderPanel();
    fireEvent.click(screen.getByRole('checkbox', { name: /include cached market data/i }));
    fireEvent.click(screen.getByRole('button', { name: /export data/i }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());

    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    const parsed = JSON.parse(await blob.text());
    expect(parsed.data.fillsCache).toHaveLength(1);
  });
});
```

- [ ] **Step 10.2: Run — confirm RED**

```bash
pnpm test src/app/settings/ExportPanel.test.tsx
```

Expected: 4 tests fail. Either "checkbox not found" (because the stub renders a plain div) or missing prop for `db`.

- [ ] **Step 10.3: Implement `ExportPanel`**

Replace `src/app/settings/ExportPanel.tsx`:

```tsx
import { useState } from 'react';
import { buildExport } from '@domain/export/buildExport';
import { createExportRepo } from '@lib/storage/export-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import { Button } from '@lib/ui/components/button';

type Props = { db?: HyperJournalDb };

function todayYYYYMMDD(now: number): string {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function ExportPanel({ db = defaultDb }: Props) {
  const [includeCache, setIncludeCache] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function onExport() {
    setExporting(true);
    try {
      const repo = createExportRepo(db);
      const snapshot = await repo.readSnapshot();
      const now = Date.now();
      const file = buildExport(snapshot, { includeCache, now });
      const blob = new Blob([JSON.stringify(file, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `hyperjournal-export-${todayYYYYMMDD(now)}.json`);
      // Revoke on next tick so the click event's download pickup completes.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">
        Download all your saved wallets and settings as a single JSON file.
      </p>
      <label className="flex items-center gap-2 text-sm text-fg-base">
        <input
          type="checkbox"
          checked={includeCache}
          onChange={(e) => setIncludeCache(e.target.checked)}
          className="h-4 w-4 rounded border-border bg-bg-overlay text-accent ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        />
        Include cached market data
      </label>
      <div>
        <Button variant="default" size="sm" onClick={onExport} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export data'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 10.4: Run — confirm GREEN**

```bash
pnpm test src/app/settings/ExportPanel.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 10.5: Update `Settings.tsx` to pass no props** (the default db is correct)

No change needed — `<ExportPanel />` without props uses the singleton by default.

- [ ] **Step 10.6: Full gauntlet**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: green.

- [ ] **Step 10.7: Commit**

```bash
git add src/app/settings/ExportPanel.tsx src/app/settings/ExportPanel.test.tsx
git commit -m "$(cat <<'EOF'
feat(settings): ExportPanel with includeCache checkbox + download

Builds ExportFile via buildExport + readSnapshot, serializes to a
Blob, creates an object URL, and triggers <a download>. Revokes the
URL on next tick so the download-initiate completes first. Filename
is hyperjournal-export-YYYY-MM-DD.json with UTC date. Optional `db`
prop for tests follows the pattern used by useUserFills and friends.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `ImportPanel` — file input + summary + commit

**Files:**
- Modify: `src/app/settings/ImportPanel.tsx`
- Create: `src/app/settings/ImportPanel.test.tsx`

- [ ] **Step 11.1: Write failing tests (RED)**

Create `src/app/settings/ImportPanel.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ImportPanel } from './ImportPanel';
import { HyperJournalDb } from '@lib/storage/db';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`import-panel-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ImportPanel db={db} />
    </QueryClientProvider>,
  );
}

const validFile = {
  app: 'HyperJournal',
  formatVersion: 1,
  exportedAt: 1714000000000,
  data: {
    wallets: [
      { address: '0x0000000000000000000000000000000000000001', label: null, addedAt: 1 },
    ],
    userSettings: null,
  },
};

function fileFrom(obj: unknown): File {
  return new File([JSON.stringify(obj)], 'export.json', { type: 'application/json' });
}

describe('ImportPanel', () => {
  it('renders a file input labelled Import', () => {
    renderPanel();
    expect(screen.getByLabelText(/import/i)).toBeInTheDocument();
  });

  it('shows a summary after selecting a valid file', async () => {
    renderPanel();
    const input = screen.getByLabelText(/import/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileFrom(validFile)] } });
    await waitFor(() => {
      expect(screen.getByText(/will import/i)).toBeInTheDocument();
      expect(screen.getByText(/1 wallet/i)).toBeInTheDocument();
    });
  });

  it('commits the import when Confirm is clicked', async () => {
    renderPanel();
    const input = screen.getByLabelText(/import/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileFrom(validFile)] } });
    await waitFor(() => expect(screen.getByText(/will import/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^confirm import$/i }));
    await waitFor(() => expect(screen.getByText(/import complete/i)).toBeInTheDocument());
    const rows = await db.wallets.toArray();
    expect(rows).toHaveLength(1);
  });

  it('Cancel discards the staged import without writing', async () => {
    renderPanel();
    const input = screen.getByLabelText(/import/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileFrom(validFile)] } });
    await waitFor(() => expect(screen.getByText(/will import/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() =>
      expect(screen.queryByText(/will import/i)).not.toBeInTheDocument(),
    );
    expect(await db.wallets.count()).toBe(0);
  });

  it('shows JSON-parse copy for a malformed file', async () => {
    renderPanel();
    const bad = new File(['not-json'], 'bad.json', { type: 'application/json' });
    const input = screen.getByLabelText(/import/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [bad] } });
    await waitFor(() => expect(screen.getByText(/valid JSON/i)).toBeInTheDocument());
  });

  it('shows the newer-version copy for a formatVersion-2 file', async () => {
    renderPanel();
    const input = screen.getByLabelText(/import/i) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [fileFrom({ ...validFile, formatVersion: 2 })] },
    });
    await waitFor(() => expect(screen.getByText(/newer version/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 11.2: Run — confirm RED**

```bash
pnpm test src/app/settings/ImportPanel.test.tsx
```

Expected: tests fail (stub renders a div).

- [ ] **Step 11.3: Implement `ImportPanel`**

Replace `src/app/settings/ImportPanel.tsx`:

```tsx
import { useState, type ChangeEvent } from 'react';
import { parseExport } from '@lib/validation/export';
import { mergeImport } from '@domain/export/mergeImport';
import { createExportRepo } from '@lib/storage/export-repo';
import { createImportRepo } from '@lib/storage/import-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import { Button } from '@lib/ui/components/button';
import type { MergeResult } from '@entities/export';
import { importErrorCopyFor } from './import-errors';

type Props = { db?: HyperJournalDb };

type UiState =
  | { kind: 'idle' }
  | { kind: 'staged'; result: MergeResult }
  | { kind: 'committing' }
  | { kind: 'done' }
  | { kind: 'error'; heading: string };

export function ImportPanel({ db = defaultDb }: Props) {
  const [state, setState] = useState<UiState>({ kind: 'idle' });

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Clear the input so selecting the same file twice in a row still fires change.
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const json: unknown = JSON.parse(text);
      const incoming = parseExport(json);
      const existing = await createExportRepo(db).readSnapshot();
      const result = mergeImport(existing, incoming);
      setState({ kind: 'staged', result });
    } catch (err) {
      setState({ kind: 'error', heading: importErrorCopyFor(err).heading });
    }
  }

  async function onConfirm() {
    if (state.kind !== 'staged') return;
    setState({ kind: 'committing' });
    try {
      await createImportRepo(db).applyMerge(state.result);
      setState({ kind: 'done' });
    } catch (err) {
      setState({ kind: 'error', heading: importErrorCopyFor(err).heading });
    }
  }

  function onCancel() {
    setState({ kind: 'idle' });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">
        Restore saved wallets and settings from a previous export.
      </p>

      <label className="flex flex-col gap-1 text-sm text-fg-base">
        <span className="text-fg-muted">Import</span>
        <input
          type="file"
          accept="application/json,.json"
          onChange={onFileChange}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-bg-overlay file:px-3 file:py-1.5 file:text-fg-base hover:file:bg-bg-overlay/80"
        />
      </label>

      {state.kind === 'staged' && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-bg-overlay p-3 text-sm">
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
            {state.result.summary.userSettingsOverwritten ? '. Settings will be overwritten.' : '.'}
          </p>
          <div className="flex gap-2">
            <Button variant="default" size="sm" onClick={onConfirm}>
              Confirm import
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {state.kind === 'committing' && (
        <p className="text-sm text-fg-muted">Importing…</p>
      )}

      {state.kind === 'done' && (
        <p className="text-sm text-gain">Import complete. Data restored.</p>
      )}

      {state.kind === 'error' && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-bg-overlay p-3 text-sm">
          <p className="text-loss">{state.heading}</p>
          <div>
            <Button variant="ghost" size="sm" onClick={() => setState({ kind: 'idle' })}>
              Choose a different file
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 11.4: Run — confirm GREEN**

```bash
pnpm test src/app/settings/ImportPanel.test.tsx
```

Expected: 6 tests pass.

- [ ] **Step 11.5: Full gauntlet**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: green.

- [ ] **Step 11.6: Commit**

```bash
git add src/app/settings/ImportPanel.tsx src/app/settings/ImportPanel.test.tsx
git commit -m "$(cat <<'EOF'
feat(settings): ImportPanel with dry-run summary + confirm/cancel

File input → JSON parse → parseExport (Zod) → mergeImport → staged
MergeResult with a human-readable summary ("Will import N wallets
and M cache entries. Settings will be overwritten."). Confirm
commits via createImportRepo; Cancel discards. Five error branches
from importErrorCopyFor render a loss-tone heading plus a
"Choose a different file" recovery action. State machine keyed by a
discriminated union: idle / staged / committing / done / error.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Playwright install + config + .gitignore

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`
- Modify: `.gitignore`
- Create: `e2e/fixtures/hyperliquid-route.ts`

- [ ] **Step 12.1: Install Playwright**

```bash
pnpm add -D @playwright/test@1.47.2
```

After install, fetch the browser binaries (Playwright prompts for this; run it explicitly):

```bash
pnpm exec playwright install chromium
```

Expected: chromium binaries downloaded. If the user is on a constrained environment, document the size (~200 MB) in the commit body.

- [ ] **Step 12.2: Add `test:e2e` script**

Edit `package.json`, add under `scripts`:

```json
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
```

Full scripts block should look like:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "typecheck": "tsc --noEmit"
  },
```

- [ ] **Step 12.3: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright runs against the dev server (faster iteration; matches
 * what we use during development). If flake surfaces we swap to
 * `pnpm preview` — see BACKLOG.
 *
 * reuseExistingServer lets a long-running local dev process stay up;
 * CI starts fresh.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

- [ ] **Step 12.4: Update `.gitignore`**

Read the current `.gitignore`:

```bash
cat .gitignore
```

Append (if not already present) these lines:

```
# Playwright
/test-results/
/playwright-report/
/playwright/.cache/
```

- [ ] **Step 12.5: Create the shared HL route fixture helper**

Create `e2e/fixtures/hyperliquid-route.ts`:

```ts
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixtureDir = resolve(__dirname, '..', '..', 'tests', 'fixtures', 'hyperliquid');
const userFills = readFileSync(resolve(fixtureDir, 'user-fills.json'), 'utf8');

/**
 * Intercept HL /info POSTs. Returns the committed userFills fixture for
 * any `type: 'userFills'` request; other request types get a 400 so test
 * failures are loud.
 */
export async function mockHyperliquid(page: Page) {
  await page.route('**/api.hyperliquid.xyz/info', async (route) => {
    const postData = route.request().postDataJSON() as { type?: string } | null;
    if (postData?.type === 'userFills') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: userFills,
      });
      return;
    }
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: `unexpected HL request type: ${postData?.type}` }),
    });
  });
}
```

- [ ] **Step 12.6: Verify config is picked up**

```bash
pnpm exec playwright test --list
```

Expected: lists zero tests (no `.spec.ts` files yet) with no error. Confirms the config loads cleanly.

- [ ] **Step 12.7: Commit**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts .gitignore e2e/fixtures/hyperliquid-route.ts
git commit -m "$(cat <<'EOF'
chore(e2e): install Playwright + scaffold config and HL route fixture

@playwright/test@1.47.2 as devDep. playwright.config.ts points at the
dev server via webServer fixture (baseURL http://localhost:5173,
reuseExistingServer in local, fresh in CI). chromium-only for v1 to
keep runtime tight. e2e/fixtures/hyperliquid-route.ts intercepts
api.hyperliquid.xyz/info and serves the committed user-fills fixture
for userFills requests; other types 400 so test failures are loud.

.gitignore excludes test-results, playwright-report, and the
playwright cache directory.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Playwright Test 1 — paste-flow smoke

**Files:**
- Create: `e2e/paste-flow.spec.ts`

- [ ] **Step 13.1: Write the test**

Create `e2e/paste-flow.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { mockHyperliquid } from './fixtures/hyperliquid-route';

const TEST_ADDR = '0x0000000000000000000000000000000000000001';

test.describe('paste → /w/:address smoke flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockHyperliquid(page);
  });

  test('renders the metrics grid + charts + history after pasting a wallet', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();

    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}$`));

    // Wallet header chip
    await expect(page.getByText(TEST_ADDR)).toBeVisible();
    // Metrics grid — at least the Total PnL card
    await expect(page.getByText(/total pnl/i)).toBeVisible();
    // Equity curve section heading
    await expect(page.getByRole('heading', { name: /equity curve/i })).toBeVisible();
    // Calendar section heading
    await expect(page.getByRole('heading', { name: /p\/l calendar/i })).toBeVisible();
    // Trade history — the table landmark
    await expect(page.getByRole('table', { name: /trade history/i })).toBeVisible();
  });

  test('refresh button re-fetches', async ({ page }) => {
    let fetchCount = 0;
    await page.route('**/api.hyperliquid.xyz/info', async (route) => {
      fetchCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
    });

    await page.goto(`/w/${TEST_ADDR}`);
    await expect(page.getByText(TEST_ADDR)).toBeVisible();
    const initialCount = fetchCount;
    await page.getByRole('button', { name: /refresh wallet data/i }).click();
    // Wait for at least one more fetch to happen after the click
    await expect.poll(() => fetchCount).toBeGreaterThan(initialCount);
  });
});
```

- [ ] **Step 13.2: Run the test**

Ensure the dev server is either running or that Playwright's webServer can start one.

```bash
pnpm test:e2e e2e/paste-flow.spec.ts
```

Expected: both tests pass. If the dev server fails to start, check that port 5173 is free.

- [ ] **Step 13.3: Fix any flake discovered**

Common issues and their fixes:
- If `getByPlaceholder(/wallet address/i)` fails: open `WalletPaste.tsx`, verify the placeholder text, update the regex.
- If `getByRole('button', { name: /analyze/i })` fails: check the submit button's accessible name.
- If the metrics grid takes a while to render: wrap in `await expect(...).toBeVisible({ timeout: 10_000 })`.

Apply the minimal fix, re-run, confirm green.

- [ ] **Step 13.4: Commit**

```bash
git add e2e/paste-flow.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): add paste-flow smoke covering /w/:address

Two tests: (1) paste wallet → arrive at /w/:address and confirm all
five sections render (header chip, metrics grid, equity curve,
calendar, trade-history table); (2) clicking Refresh triggers a
second HL fetch (proves the invalidate-then-refetch path works
end-to-end past jsdom's limits).

Mocks HL via page.route + the committed user-fills fixture — same
anonymized data our unit tests use.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Playwright Test 2 — export → import round-trip

**Files:**
- Create: `e2e/export-import.spec.ts`

- [ ] **Step 14.1: Write the test**

Create `e2e/export-import.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { mockHyperliquid } from './fixtures/hyperliquid-route';
import { readFileSync } from 'node:fs';

const TEST_ADDR = '0x0000000000000000000000000000000000000001';

test.describe('export → import round-trip', () => {
  test('exports data and re-imports it in a fresh browser context', async ({
    page,
    browser,
  }) => {
    await mockHyperliquid(page);

    // 1. Seed state: paste wallet so Dexie has a row.
    await page.goto('/');
    await page.getByPlaceholder(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    await expect(page.getByText(TEST_ADDR)).toBeVisible();

    // 2. Navigate to Settings and export.
    await page.goto('/settings');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export data/i }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    // Sanity-check the exported file has our wallet.
    const fileText = readFileSync(downloadPath!, 'utf8');
    const parsed = JSON.parse(fileText);
    expect(parsed.app).toBe('HyperJournal');
    expect(parsed.data.wallets).toHaveLength(1);
    expect(parsed.data.wallets[0].address).toBe(TEST_ADDR);

    // 3. Fresh browser context (cleared storage, cleared IndexedDB).
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await mockHyperliquid(freshPage);

    // Visit Settings in the fresh context and upload the downloaded file.
    await freshPage.goto('/settings');
    const fileInput = freshPage.getByLabel(/import/i);
    await fileInput.setInputFiles(downloadPath!);

    // Confirm the import.
    await expect(freshPage.getByText(/will import/i)).toBeVisible();
    await freshPage.getByRole('button', { name: /^confirm import$/i }).click();
    await expect(freshPage.getByText(/import complete/i)).toBeVisible();

    // 4. Verify the wallet now appears on /.
    await freshPage.goto('/');
    await expect(freshPage.getByText(TEST_ADDR)).toBeVisible();

    await freshContext.close();
  });
});
```

- [ ] **Step 14.2: Run the test**

```bash
pnpm test:e2e e2e/export-import.spec.ts
```

Expected: test passes. If `download.path()` is undefined: confirm Playwright's `acceptDownloads` default (it's true) and that the browser handled the download event.

- [ ] **Step 14.3: Commit**

```bash
git add e2e/export-import.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): round-trip export → fresh context → import → verify wallet

Seeds Dexie by pasting a wallet, exports from /settings, captures the
download. Opens a fresh browser context (cleared IndexedDB), uploads
the same file via the ImportPanel file input, confirms the dry-run
summary, commits. Verifies the wallet re-appears on /.

The full data-loss-resilience story for v1 § 24 #6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Close-out docs — SESSION_LOG, BACKLOG, CONVENTIONS

**Files:**
- Modify: `docs/SESSION_LOG.md`
- Modify: `docs/BACKLOG.md`
- Modify: `docs/CONVENTIONS.md`

- [ ] **Step 15.1: Append Session 6 SESSION_LOG entry**

Prior sessions are ordered OLDEST FIRST (despite the file header's claim to the contrary). Append the new entry at the very end of the file, before the trailing `---`.

```markdown

## 2026-04-22 — Phase 1 Session 6: Export/Import + Playwright E2E

**Session goal:** Close plan §24 #6 (export and re-import local data). Add /settings route with export (optional cache include) + import (merge-by-upsert). First Playwright E2E covering paste smoke + export/import round-trip.

**Done:**

- Promoted `UserSettings` and `FillsCacheEntry` to `src/entities/` (prerequisite — domain→lib boundary forbids domain code importing types from lib/storage). `@lib/storage/db` re-exports for existing callers.
- `src/entities/export.ts`: `ExportSnapshot`, `ExportFile`, `ExportData`, `BuildExportOptions`, `MergeResult`. formatVersion 1; app-identity "HyperJournal"; data envelope is extensible (journaling slots in without a version bump).
- `src/lib/validation/export.ts`: `ExportFileSchema` + `parseExport`. Literal-checks on `app` and `formatVersion`; _schemaCheck pattern keeps the entity and schema mutually assignable at compile time. [+9 tests]
- `src/domain/export/buildExport.ts`: pure, deterministic, clock-injected. Omits `fillsCache` key entirely when `includeCache === false`. [+7 tests]
- `src/domain/export/mergeImport.ts`: pure, computes MergeResult + summary. Fixed upsert strategy for v1 (wallets by address with incoming wins, userSettings overwrite on non-null, fillsCache by address when present). [+7 tests]
- `src/lib/storage/export-repo.ts`: `readSnapshot()` reads all three tables in a single Promise.all. [+4 tests]
- `src/lib/storage/import-repo.ts`: `applyMerge()` writes inside a single Dexie transaction across all three tables. [+5 tests]
- `src/app/settings/import-errors.ts`: maps SyntaxError / ZodError(app) / ZodError(formatVersion>1) / other ZodError / unknown to human copy. [+5 tests]
- `/settings` route mounted in `src/app/routes.tsx`. `Settings.tsx` shell with a Back link and a Data section landmark. [+3 tests] Nav links: one in WalletHeader (between Refresh and Back); one footer-right on SplitHome. Both use the CONVENTIONS §12 focus-visible class string.
- `ExportPanel.tsx`: `Include cached market data` checkbox (default off) + `Export data` button. Generates a Blob, triggers `<a download>`, revokes the URL on next tick. Filename `hyperjournal-export-YYYY-MM-DD.json` (UTC). [+4 tests]
- `ImportPanel.tsx`: file input → JSON parse → Zod validate → merge → dry-run summary with "Confirm import" / "Cancel" → commit or idle. Error states render loss-tone heading + "Choose a different file". State machine via discriminated union (idle / staged / committing / done / error). [+6 tests]
- Playwright toolchain: `@playwright/test@1.47.2` devDep; `playwright.config.ts` wires dev-server webServer; `e2e/` dir with `fixtures/hyperliquid-route.ts` helper; `.gitignore` updated.
- E2E test 1 (`e2e/paste-flow.spec.ts`): paste wallet → /w/:address → all five sections render; Refresh triggers a second HL fetch. [+2 tests]
- E2E test 2 (`e2e/export-import.spec.ts`): seed, export, capture download, fresh browser context, import, confirm, verify wallet reappears. [+1 test]
- End state: [TODO from last full run] unit tests + 3 E2E tests. Gauntlet (unit) clean; E2E run via `pnpm test:e2e` clean.

**Decisions made:** none (no new ADRs).

**Deferred / not done:**

- Selective import (partial per-row/table) — BACKLOG. Fixed-upsert is sufficient for v1.
- Encryption — BACKLOG. Becomes relevant when API keys enter the format (Phase 4).
- Cloud sync — BACKLOG; probably deprecated entirely given local-first premise.
- Migration for formatVersion > 1 — BACKLOG. Design when v2 actually lands.
- CI gate on Playwright — BACKLOG. Manual runs for now.
- Switch webServer to `pnpm preview` if dev-server proves flaky — BACKLOG.
- Journaling — Session 7+.

**Gotchas for next session:**

- `src/entities/user-settings.ts` and `src/entities/fills-cache.ts` are the new canonical locations. `@lib/storage/db` still re-exports for back-compat; new code should import from `@entities/*`.
- `ExportFile.data.fillsCache` is `.optional()` — when `includeCache: false` in `buildExport`, the key is absent entirely (not null, not []). Consumers must handle `undefined`.
- `mergeImport` with `userSettings: null` is a no-op, not a delete. If Phase 3 needs an explicit delete path (e.g., "clear my preferences"), that's a new strategy flag.
- Playwright tests use `http://localhost:5173` from the dev server. CI does not yet run E2E — adding that is a BACKLOG item with `test:e2e` as the command.
- `mockHyperliquid` helper lives at `e2e/fixtures/hyperliquid-route.ts`. New E2E tests should import it rather than re-implementing the route. If other HL endpoints are added (e.g. clearinghouseState for account-health cards), extend that helper.
- Downloaded Blob URLs are revoked on a `setTimeout(…, 0)` — short enough to be safe, fast enough to not leak. If Safari ever fails to pick up the download, the revoke is the first suspect.
- `ImportPanel` resets `input.value = ''` after reading the file so selecting the same file twice in a row still fires change. Keep this.

**Invariants assumed:**

- `formatVersion: 1` is the contract. Additive fields under `data` are allowed without a bump (Zod schema uses default `.strip()` at the envelope level but optional-with-defaults where needed inside `data`); breaking changes MUST bump.
- `app: "HyperJournal"` literal rejects foreign files loudly before the expensive Zod check on `data`.
- Dexie writes on import happen inside ONE transaction across all three tables so partial-write states are impossible.
- `buildExport` and `mergeImport` never mutate their inputs. They are pure per `src/domain/**` conventions.
- The `_schemaCheck` at the bottom of `@lib/validation/export.ts` breaks typecheck if the entity shape and the Zod schema drift. Changes to `ExportFile` MUST update both in the same commit.

---
```

Fill in the `[TODO from last full run]` placeholder with the actual unit-test total from running `pnpm test` at the end. Expected approximate range: 173 + 9 (validation) + 7 (buildExport) + 7 (mergeImport) + 4 (export-repo) + 5 (import-repo) + 5 (import-errors) + 3 (Settings) + 4 (ExportPanel) + 6 (ImportPanel) = ~223 unit tests.

- [ ] **Step 15.2: Append BACKLOG entries**

Add the following at the end of `docs/BACKLOG.md` as a new section:

```markdown

---

## Session 6 deferrals

- `[maybe]` Selective import. UI for per-row or per-table selection at import time (checkboxes next to the dry-run summary). Fixed-upsert covers the common case (restore into empty browser); selective becomes useful when merging two partial exports.
- `[soon]` Encryption-at-rest for exports. AES-GCM with a user-supplied passphrase. Required once API keys enter the format (Phase 4); until then, nothing in the export is secret.
- `[later]` Cloud sync. Post-v1; would need a server, which contradicts the local-first premise. Probably deprecated as an option entirely.
- `[maybe]` Migration path for `formatVersion > 1`. Design when v2 is actually proposed, not preemptively. Today a newer-version file is rejected loudly.
- `[soon]` CI gate on Playwright. `.github/workflows/deploy.yml` should run `test:e2e` before deploying. Requires (a) stable local test run (achieved), (b) decision on chromium install in CI (size cost), (c) whether `fullyParallel: true` + `workers: 1` in CI is the right throttle.
- `[maybe]` Switch Playwright `webServer` to `pnpm preview` if the dev-server proves flaky. Preview matches production output (minified, service worker) but boots slower.
- `[maybe]` Export-file compression (gzip). A full fillsCache export for an active wallet is ~500 KB → ~100 KB gzipped. `CompressionStream` is available in all target browsers. Trivial win if users start exporting cache regularly.
```

- [ ] **Step 15.3: Append CONVENTIONS entries**

Add at the end of `docs/CONVENTIONS.md`:

```markdown

---

## 13. Export format

- The export file format lives at `src/entities/export.ts` (types) and `src/lib/validation/export.ts` (Zod schema). The two are kept in lockstep via the `_schemaCheck` pattern — changes to either MUST touch both in the same commit.
- `app: "HyperJournal"` + `formatVersion: 1` are literal-checked at the envelope level. Foreign files and newer-version files fail fast with specific Zod issues that the Settings UI maps to human copy.
- `data.fillsCache` is `.optional()` on the Zod schema and omitted entirely (not null, not []) from the file when the user exports without the cache. Consumers of `ExportFile` MUST handle `undefined`.
- Additive fields under `data` (e.g., Phase 3's `journalEntries`) do NOT bump `formatVersion` — new optional fields on the envelope are forward-compatible. Breaking changes (renamed field, tightened constraint, removed field) MUST bump.
- The domain layer (`buildExport`, `mergeImport`) is pure. `exportedAt` is supplied as `options.now` from the caller so tests don't depend on wall-clock time.
- Import is atomic: `createImportRepo.applyMerge` wraps all three table writes in a single Dexie transaction. Partial writes are not a valid state.

## 14. Playwright E2E

- Tests live under `e2e/` in the repo root. `e2e/fixtures/` holds shared helpers (route interceptors, data loaders). File naming: `<topic>.spec.ts`.
- `playwright.config.ts` points at the dev server (`pnpm dev`, http://localhost:5173) via `webServer`. CI does not yet run Playwright — that's a BACKLOG item. Locally, `reuseExistingServer: true` so an already-running dev server is picked up.
- Hyperliquid API calls are intercepted via `page.route('**/api.hyperliquid.xyz/info', ...)` using the committed fixture at `tests/fixtures/hyperliquid/user-fills.json`. Never hit the real network in E2E. The shared helper at `e2e/fixtures/hyperliquid-route.ts` is the canonical entry point.
- The test wallet in E2E is the anonymized fixture placeholder `0x0000000000000000000000000000000000000001`. The authorized live test wallet stays in controller memory only.
- E2E is NOT part of the default `pnpm test` gauntlet — run via `pnpm test:e2e` (or `pnpm test:e2e:ui` for the Playwright UI inspector). Manual run before session close.
- Cross-context state isolation for round-trip tests uses `browser.newContext()` — each context has its own storage (IndexedDB, cookies, localStorage).
```

- [ ] **Step 15.4: Final full gauntlet**

```bash
pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build && pnpm test:e2e
```

Expected: all green. Domain coverage ≥ 90%.

- [ ] **Step 15.5: Record final test count in SESSION_LOG**

Replace the `[TODO from last full run]` placeholder with the actual count from the `pnpm test:coverage` output. Example: "End state: 223 unit tests passing across 33 files (was 173/25 after Session 5; +50 this session), 3 E2E tests passing."

- [ ] **Step 15.6: Commit**

```bash
git add docs/SESSION_LOG.md docs/BACKLOG.md docs/CONVENTIONS.md
git commit -m "$(cat <<'EOF'
docs: record Session 6 session log, backlog, conventions

Captures Session 6's export/import + Playwright work. Adds CONVENTIONS
§13 (Export format — two-file contract, literal app/version checks,
atomic import, additive-field forward-compat rule) and §14 (Playwright
E2E layout, fixtures, mock conventions, run command). Adds seven
Session 6 BACKLOG entries, none of which block v1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 15.7: Verify clean state**

```bash
git status && git log --oneline -20
```

Expected: working tree clean, Session 6 commits in sequence from `55187ee` onward.

---

## Success criteria (copy from spec §Acceptance)

1. `/settings` route exists and is navigable from SplitHome and WalletView.
2. Clicking Export with the checkbox off produces a JSON file ≤ 50 KB for a typical profile; with the checkbox on, includes the full `fillsCache`.
3. Importing a valid export file produces the expected state with upsert semantics for existing rows.
4. Importing malformed / foreign / version-mismatched files shows mapped human copy and does NOT mutate state.
5. `pnpm test:e2e` runs both tests and they pass against the dev server.
6. Full gauntlet green: `pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build`. Coverage on `src/domain/**` ≥ 90%.
7. SESSION_LOG.md updated. BACKLOG.md has 7 new entries. CONVENTIONS.md has §13 + §14.
