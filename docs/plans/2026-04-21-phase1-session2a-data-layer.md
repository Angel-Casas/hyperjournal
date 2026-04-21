# Phase 1 Session 2a — Data Layer Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data pipeline from the Hyperliquid `/info` endpoint through Zod validation into typed internal entities — no UI, no persistence. By the end, `fetchUserFills(walletAddress)` returns a typed, validated `RawFill[]`, tests use committed anonymized fixtures (not the live API), and all domain/lib rules from CLAUDE.md §3 hold.

**Architecture:** A single `postInfo<T>()` client in `lib/api/hyperliquid.ts` POSTs to `https://api.hyperliquid.xyz/info` with a typed request body and pipes the response through a Zod schema in `lib/validation/hyperliquid.ts`. Entity types live in `src/entities/`; they are the internal shape consumers see — HL's wire format is not leaked beyond the validation boundary. Fixtures in `tests/fixtures/hyperliquid/` are anonymized real responses committed to the repo. Errors from the client are **thrown** (so TanStack Query in Session 2b can flow them into its error state); pure-domain and domain-adjacent code uses `Result<T, E>` per CONVENTIONS.md §3.

**Tech Stack:** Zod 3, native `fetch`, Vitest + RTL. No new runtime dependencies — Zod is already in `package.json`.

---

## File structure (what exists at end of session)

```
HyperJournal/
├── src/
│   ├── entities/
│   │   ├── wallet.ts              (extend: add Wallet type alongside existing WalletAddress)
│   │   ├── provenance.ts          (new: Provenance + Provenanced<T> helpers)
│   │   └── fill.ts                (new: RawFill type; inferred from Zod schema)
│   ├── lib/
│   │   ├── validation/
│   │   │   ├── hyperliquid.ts     (new: Zod schemas; user-fills + clearinghouse-state)
│   │   │   └── hyperliquid.test.ts (new: schema tests against fixtures)
│   │   └── api/
│   │       ├── hyperliquid.ts     (new: postInfo + fetchUserFills + fetchClearinghouseState)
│   │       └── hyperliquid.test.ts (new: client tests with mocked fetch)
│   └── domain/wallets/            (unchanged from Session 1)
├── tests/
│   └── fixtures/
│       └── hyperliquid/
│           ├── user-fills.json              (anonymized real response)
│           ├── clearinghouse-state.json     (anonymized real response)
│           └── README.md                    (how to refresh, anonymization rules)
```

---

## Conventions used throughout this plan

- Every `pnpm` command runs from repo root: `/Users/angel/Documents/HyperJournal`.
- Every file path is absolute from repo root.
- Every commit ends with: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- Every commit uses conventional prefixes in imperative mood per CONVENTIONS.md §10.
- **No live API calls in unit tests.** Tests must only read fixtures. Live-fetch work happens once in Task 2 (fixture bootstrap) and is not part of any test that runs in CI.
- **The authorized wallet is** `0xf318AFb8f0050D140B5D1F58E9537f9eBFE82B14`. Only use it for the live fetch in Task 2. The address that lands in committed fixtures is the anonymized placeholder `0x0000000000000000000000000000000000000001`.

---

## Task 1: Entity types (Wallet, Provenance, RawFill placeholder)

**Files:**
- Modify: `src/entities/wallet.ts`
- Create: `src/entities/provenance.ts`
- Create: `src/entities/fill.ts`

This task defines the stable internal shapes Session 2b and beyond will consume. `RawFill` is defined as `z.infer` of the schema that Task 3 will write; we forward-declare the type here so consumers can start using it without depending on `lib/validation`.

- [ ] **Step 1.1: Extend `src/entities/wallet.ts`**

Current contents (do not remove the existing branded type):

```ts
export type WalletAddress = string & { readonly __brand: 'WalletAddress' };
```

Append:

```ts
/**
 * A wallet the user has pasted and (optionally) saved locally. Persisted in
 * Dexie by Session 2b; shape locked here so callers across layers agree.
 */
export type Wallet = {
  readonly address: WalletAddress;
  readonly label: string | null;
  /** Unix ms when the user first added this wallet locally. */
  readonly addedAt: number;
};
```

- [ ] **Step 1.2: Create `src/entities/provenance.ts`**

```ts
/**
 * Classification for every user-visible field or metric. See plan.md §4.4.
 * - observed: came directly from a Hyperliquid response
 * - derived:  deterministic computation from observed values
 * - inferred: heuristic interpretation; expose uncertainty in the UI
 * - unknown:  not enough evidence to classify
 */
export type Provenance = 'observed' | 'derived' | 'inferred' | 'unknown';

/**
 * Wrap a value with its provenance. Use sparingly at boundaries where the
 * classification matters; internal pure functions can pass unwrapped data.
 */
export type Provenanced<T> = {
  readonly value: T;
  readonly provenance: Provenance;
};
```

- [ ] **Step 1.3: Create `src/entities/fill.ts` as a placeholder**

```ts
// The canonical RawFill type is inferred from the Zod schema defined in
// src/lib/validation/hyperliquid.ts. This module re-exports it so consumers
// outside lib/ can import from @entities without depending on validation.
//
// Defined here (not in validation) because entities is a lower-level layer
// per CLAUDE.md §4; the Zod schema is the authoring source, the entity is the
// stable name external layers refer to.
//
// Session 2a Task 3 populates this re-export once the schema exists.
export type RawFill = never;
```

The `never` placeholder is intentional — Task 3 replaces the file with the real re-export. Any consumer that imports `RawFill` before Task 3 will get a compile error, which is the desired behavior for a type that isn't defined yet.

- [ ] **Step 1.4: Verify**

```bash
pnpm typecheck
```

Expected: exit 0.

- [ ] **Step 1.5: Commit**

```bash
git add src/entities/
git commit -m "$(cat <<'EOF'
feat(entities): add Wallet, Provenance, and RawFill placeholder

Wallet is the local-first concept used by the wallet feature. Provenance
classifies every user-visible field per plan.md §4.4 so the UI can render
observed / derived / inferred / unknown distinctly. RawFill is a
forward-declared placeholder to be populated in Task 3 once the Zod
schema provides its canonical shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Fetch real fixtures, anonymize, commit

This is the one task in Session 2a that makes a live network call. It runs once; its output is committed so every subsequent test reads from disk.

**Files:**
- Create: `tests/fixtures/hyperliquid/user-fills.json`
- Create: `tests/fixtures/hyperliquid/clearinghouse-state.json`
- Create: `tests/fixtures/hyperliquid/README.md`

- [ ] **Step 2.1: Fetch `userFills` for the authorized wallet**

From repo root:

```bash
mkdir -p tests/fixtures/hyperliquid

curl -s https://api.hyperliquid.xyz/info \
  -H 'Content-Type: application/json' \
  -d '{"type":"userFills","user":"0xf318AFb8f0050D140B5D1F58E9537f9eBFE82B14"}' \
  > /tmp/hl-fills-raw.json

echo "Size:"
wc -c /tmp/hl-fills-raw.json
echo "First record:"
jq '.[0]' /tmp/hl-fills-raw.json
echo "Record count:"
jq 'length' /tmp/hl-fills-raw.json
```

Expected: JSON array of fill objects. Record count likely in the hundreds or thousands for a $70k-funded account. If the response is an error object (`{"error":"..."}`) or HTML, STOP and report BLOCKED.

If `jq` is not installed, `brew install jq` — it's a one-liner and worth it; do not invent a workaround with `node` or `python`.

- [ ] **Step 2.2: Truncate + anonymize user-fills**

Keep the first 100 fills (plenty for schema coverage and pattern tests; avoids bloating the repo):

```bash
jq '.[0:100]' /tmp/hl-fills-raw.json \
  | sed 's/0xf318[Aa][Ff][Bb]8f0050[Dd]140[Bb]5[Dd]1[Ff]58[Ee]9537f9e[Bb][Ff][Ee]82[Bb]14/0x0000000000000000000000000000000000000001/g' \
  > tests/fixtures/hyperliquid/user-fills.json

echo "Sanity check — should report 0:"
grep -ci 'f318AFb8f0050D140B5D1F58E9537f9eBFE82B14' tests/fixtures/hyperliquid/user-fills.json
echo "Record count — should be 100 (or fewer if the wallet has fewer total fills):"
jq 'length' tests/fixtures/hyperliquid/user-fills.json
```

Expected: 0 occurrences of the real address (case-insensitive). Record count ≤ 100.

If the `grep` reports >0 occurrences, the `sed` pattern didn't match every casing variant. STOP and iterate on the pattern before committing — a committed file with the real address is a leak.

- [ ] **Step 2.3: Fetch and anonymize `clearinghouseState`**

```bash
curl -s https://api.hyperliquid.xyz/info \
  -H 'Content-Type: application/json' \
  -d '{"type":"clearinghouseState","user":"0xf318AFb8f0050D140B5D1F58E9537f9eBFE82B14"}' \
  > /tmp/hl-state-raw.json

jq '.' /tmp/hl-state-raw.json | head -30
echo "Top-level keys:"
jq 'keys' /tmp/hl-state-raw.json
```

Expected: a JSON object with keys like `assetPositions`, `marginSummary`, `crossMarginSummary`, `withdrawable`, `time`, etc. If instead it's `{"error":"..."}` STOP.

Anonymize (the clearinghouse response doesn't usually echo the address back, but guard against it):

```bash
sed 's/0xf318[Aa][Ff][Bb]8f0050[Dd]140[Bb]5[Dd]1[Ff]58[Ee]9537f9e[Bb][Ff][Ee]82[Bb]14/0x0000000000000000000000000000000000000001/g' \
  /tmp/hl-state-raw.json \
  > tests/fixtures/hyperliquid/clearinghouse-state.json

grep -ci 'f318AFb8f0050D140B5D1F58E9537f9eBFE82B14' tests/fixtures/hyperliquid/clearinghouse-state.json
```

Expected: 0. If >0, iterate.

- [ ] **Step 2.4: Clean up the raw files**

```bash
rm /tmp/hl-fills-raw.json /tmp/hl-state-raw.json
```

- [ ] **Step 2.5: Write `tests/fixtures/hyperliquid/README.md`**

```markdown
# Hyperliquid fixtures

Anonymized snapshots of the Hyperliquid `/info` endpoint's JSON responses.
These are the inputs every unit test in `src/lib/validation` and
`src/lib/api` reads from. Unit tests never hit the live API.

## Files

- `user-fills.json` — response to `{"type":"userFills","user":"<wallet>"}`, truncated to the first 100 fills.
- `clearinghouse-state.json` — response to `{"type":"clearinghouseState","user":"<wallet>"}`.

## Anonymization

All occurrences of the authorized test wallet address are replaced with
`0x0000000000000000000000000000000000000001` (40 hex zeroes + trailing 1).
The raw responses never land in the repo.

## Refreshing

To refresh fixtures against a new account state, rerun the Task 2 curl
commands from `docs/plans/2026-04-21-phase1-session2a-data-layer.md`,
anonymize, and commit. The authorized test wallet is recorded in the
controller's memory system — do not hardcode it in source.

## What about the prices / sizes / timestamps?

Those are public on-chain data, not PII, and we need them intact for
realistic tests. Only the wallet address is anonymized.
```

- [ ] **Step 2.6: Commit**

```bash
git add tests/fixtures/hyperliquid/
git commit -m "$(cat <<'EOF'
test: add anonymized Hyperliquid fixtures for validation + client tests

Real /info responses fetched from api.hyperliquid.xyz against the
authorized test wallet, truncated to 100 fills, wallet address swapped
for 0x0...01. These become the single source of truth for every
unit test in lib/validation and lib/api; no test hits the live API.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Zod schema and typed RawFill for `userFills`

**Files:**
- Create: `src/lib/validation/hyperliquid.ts`
- Create: `src/lib/validation/hyperliquid.test.ts`
- Modify: `src/entities/fill.ts` (replace placeholder with real re-export)

- [ ] **Step 3.1: Write the failing test first (RED)**

Create `src/lib/validation/hyperliquid.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { UserFillsResponseSchema } from './hyperliquid';

const fixturesDir = resolve(__dirname, '../../../tests/fixtures/hyperliquid');

describe('UserFillsResponseSchema', () => {
  it('parses the committed user-fills fixture without errors', () => {
    const raw = JSON.parse(readFileSync(resolve(fixturesDir, 'user-fills.json'), 'utf8'));
    const parsed = UserFillsResponseSchema.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it('coerces string-encoded numeric fields to numbers', () => {
    const raw = JSON.parse(readFileSync(resolve(fixturesDir, 'user-fills.json'), 'utf8'));
    const parsed = UserFillsResponseSchema.parse(raw);
    const first = parsed[0];
    expect(first).toBeDefined();
    expect(typeof first!.px).toBe('number');
    expect(typeof first!.sz).toBe('number');
    expect(typeof first!.fee).toBe('number');
    expect(first!.time).toBeGreaterThan(0);
  });

  it('rejects a response missing required fields', () => {
    expect(() => UserFillsResponseSchema.parse([{ coin: 'BTC' }])).toThrow();
  });

  it('rejects a side value that is neither "B" nor "A"', () => {
    const raw = JSON.parse(readFileSync(resolve(fixturesDir, 'user-fills.json'), 'utf8'));
    const mangled = [{ ...raw[0], side: 'X' }];
    expect(() => UserFillsResponseSchema.parse(mangled)).toThrow();
  });
});
```

Run to confirm RED:

```bash
pnpm test src/lib/validation/hyperliquid.test.ts
```

Expected: FAIL with "Cannot find module './hyperliquid'". Any other failure reason → STOP and diagnose.

- [ ] **Step 3.2: Inspect the fixture to learn the exact shape**

```bash
jq '.[0]' tests/fixtures/hyperliquid/user-fills.json
```

Expected: one fill object. Write down every key and its type. The real shape takes precedence over any baseline in this plan.

- [ ] **Step 3.3: Write the minimal schema (GREEN)**

Create `src/lib/validation/hyperliquid.ts`:

```ts
import { z } from 'zod';

/**
 * Hyperliquid returns numeric quantities as JSON strings for precision.
 * All schemas coerce them to `number` at the boundary — downstream code
 * never sees the string-encoded form.
 */
const NumericString = z.string().transform((s, ctx) => {
  const n = Number(s);
  if (!Number.isFinite(n)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `expected numeric string, got "${s}"` });
    return z.NEVER;
  }
  return n;
});

const Side = z.enum(['B', 'A']);

/**
 * One fill as returned by Hyperliquid's userFills endpoint. The real
 * wire shape (coin, px, sz, side, time, hash, oid, crossed, fee, ...)
 * is locked here. Any field you add MUST be present in the fixture.
 *
 * Additional fields Hyperliquid may return later pass through silently
 * via .passthrough() — we do not want forward-compat drift to fail every
 * test when they ship a new attribute.
 */
export const FillSchema = z
  .object({
    coin: z.string().min(1),
    px: NumericString,
    sz: NumericString,
    side: Side,
    time: z.number().int().positive(),
    startPosition: NumericString,
    dir: z.string(),
    closedPnl: NumericString,
    hash: z.string(),
    oid: z.number().int().nonnegative(),
    crossed: z.boolean(),
    fee: NumericString,
    tid: z.number().int().nonnegative(),
    feeToken: z.string().min(1),
  })
  .passthrough();

export const UserFillsResponseSchema = z.array(FillSchema);

export type Fill = z.infer<typeof FillSchema>;
export type UserFillsResponse = z.infer<typeof UserFillsResponseSchema>;
```

**If the fixture reveals a field in your jq output that is not in this schema**, add it. If the plan's schema lists a field that is NOT in the fixture, remove it — the fixture is the ground truth. Commit whatever matches reality.

- [ ] **Step 3.4: Replace `src/entities/fill.ts` placeholder**

```ts
import type { Fill } from '@lib/validation/hyperliquid';

/**
 * The internal name for a fill. Identical to Zod's inferred Fill type at
 * the validation layer; re-exported here so code outside `lib/` can
 * depend on `@entities/fill` (the stable name) without reaching into
 * validation (the implementation).
 */
export type RawFill = Fill;
```

- [ ] **Step 3.5: Run tests**

```bash
pnpm test src/lib/validation/
```

Expected: 4 tests pass. If any fail because your schema disagrees with the fixture, adjust the schema (not the test). Tests describe the contract.

- [ ] **Step 3.6: Run lint, typecheck, coverage**

```bash
pnpm lint
pnpm typecheck
pnpm test:coverage
```

All exit 0. Coverage threshold is scoped to `src/domain/**`, so `lib/` doesn't need to hit 90%, but this file should naturally hit high percentages anyway.

- [ ] **Step 3.7: Commit**

```bash
git add src/lib/validation/ src/entities/fill.ts
git commit -m "$(cat <<'EOF'
feat(validation): add Zod schemas for Hyperliquid userFills

FillSchema parses a single fill, coercing HL's string-encoded numerics
(px, sz, fee, startPosition, closedPnl) into real numbers at the
boundary so downstream code sees a clean shape. Side is constrained to
'B' | 'A'. Unknown forward-compat fields pass through. RawFill re-exports
the inferred Fill type from @entities for consumers outside lib/.

Tests read the committed user-fills.json fixture (100 anonymized fills)
and assert shape + type coercion. No live API calls.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Zod schema for `clearinghouseState`

**Files:**
- Modify: `src/lib/validation/hyperliquid.ts` (append)
- Modify: `src/lib/validation/hyperliquid.test.ts` (append)

- [ ] **Step 4.1: Write the failing tests (RED)**

Append to `src/lib/validation/hyperliquid.test.ts`:

```ts
import { ClearinghouseStateSchema } from './hyperliquid';

describe('ClearinghouseStateSchema', () => {
  it('parses the committed clearinghouse-state fixture without errors', () => {
    const raw = JSON.parse(readFileSync(resolve(fixturesDir, 'clearinghouse-state.json'), 'utf8'));
    const parsed = ClearinghouseStateSchema.parse(raw);
    expect(typeof parsed.time).toBe('number');
    expect(parsed.assetPositions).toBeInstanceOf(Array);
    expect(typeof parsed.marginSummary.accountValue).toBe('number');
  });

  it('rejects a response without the required time field', () => {
    expect(() => ClearinghouseStateSchema.parse({ assetPositions: [] })).toThrow();
  });
});
```

Run:

```bash
pnpm test src/lib/validation/
```

Expected: the `ClearinghouseStateSchema` tests fail with "is not a function" or "Cannot find export".

- [ ] **Step 4.2: Inspect the fixture**

```bash
jq '.' tests/fixtures/hyperliquid/clearinghouse-state.json
```

Study the structure. You will likely see:
- `time: number` — ms timestamp
- `assetPositions: Array<{ position: { coin, szi, entryPx, positionValue, unrealizedPnl, returnOnEquity, leverage, liquidationPx, marginUsed, maxLeverage, cumFunding }, type }>`
- `marginSummary: { accountValue, totalMarginUsed, totalNtlPos, totalRawUsd }`
- `crossMarginSummary: { same shape }`
- `crossMaintenanceMarginUsed: NumericString`
- `withdrawable: NumericString`

The real fixture dictates the real shape — adjust the schema below accordingly.

- [ ] **Step 4.3: Append schema to `src/lib/validation/hyperliquid.ts` (GREEN)**

```ts
const MarginSummarySchema = z
  .object({
    accountValue: NumericString,
    totalMarginUsed: NumericString,
    totalNtlPos: NumericString,
    totalRawUsd: NumericString,
  })
  .passthrough();

const LeverageSchema = z
  .object({
    type: z.enum(['cross', 'isolated']),
    value: z.number().int().positive(),
  })
  .passthrough();

const CumFundingSchema = z
  .object({
    allTime: NumericString,
    sinceOpen: NumericString,
    sinceChange: NumericString,
  })
  .passthrough();

const AssetPositionSchema = z
  .object({
    position: z
      .object({
        coin: z.string().min(1),
        szi: NumericString,
        entryPx: NumericString.nullable(),
        positionValue: NumericString,
        unrealizedPnl: NumericString,
        returnOnEquity: NumericString,
        leverage: LeverageSchema,
        liquidationPx: NumericString.nullable(),
        marginUsed: NumericString,
        maxLeverage: z.number().int().positive(),
        cumFunding: CumFundingSchema,
      })
      .passthrough(),
    type: z.enum(['oneWay']),
  })
  .passthrough();

export const ClearinghouseStateSchema = z
  .object({
    assetPositions: z.array(AssetPositionSchema),
    marginSummary: MarginSummarySchema,
    crossMarginSummary: MarginSummarySchema,
    crossMaintenanceMarginUsed: NumericString,
    withdrawable: NumericString,
    time: z.number().int().positive(),
  })
  .passthrough();

export type AssetPosition = z.infer<typeof AssetPositionSchema>;
export type ClearinghouseState = z.infer<typeof ClearinghouseStateSchema>;
```

**Reconcile with the fixture.** If `entryPx` is always a string for this wallet (no zero-size positions), drop the `.nullable()`. If HL returns `null` when there is no entry (e.g., because the position closed), keep it. The fixture wins.

- [ ] **Step 4.4: Run tests**

```bash
pnpm test src/lib/validation/
```

Expected: all tests (Task 3 + Task 4) pass — now 6 tests total.

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/validation/
git commit -m "$(cat <<'EOF'
feat(validation): add Zod schema for Hyperliquid clearinghouseState

ClearinghouseStateSchema covers asset positions (coin, signed size,
entry, leverage, liq price, PnL, funding), both margin summaries, and
top-level account state (time, withdrawable). Numerics coerced at the
boundary. Unknown fields pass through.

Tests read the committed clearinghouse-state fixture; no live API.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Hyperliquid API client (`postInfo`, `fetchUserFills`, `fetchClearinghouseState`)

**Files:**
- Create: `src/lib/api/hyperliquid.ts`
- Create: `src/lib/api/hyperliquid.test.ts`

- [ ] **Step 5.1: Write the failing tests (RED)**

Create `src/lib/api/hyperliquid.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fetchClearinghouseState, fetchUserFills, HyperliquidApiError } from './hyperliquid';
import type { WalletAddress } from '@entities/wallet';

const fixturesDir = resolve(__dirname, '../../../tests/fixtures/hyperliquid');
const fillsFixture = readFileSync(resolve(fixturesDir, 'user-fills.json'), 'utf8');
const stateFixture = readFileSync(resolve(fixturesDir, 'clearinghouse-state.json'), 'utf8');

const testWallet = '0x0000000000000000000000000000000000000001' as WalletAddress;

describe('fetchUserFills', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs to the /info endpoint with the right body shape', async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValue(new Response(fillsFixture, { status: 200 }));

    await fetchUserFills(testWallet);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://api.hyperliquid.xyz/info');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init!.body as string)).toEqual({
      type: 'userFills',
      user: testWallet,
    });
  });

  it('returns typed RawFill[] after validation', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response(fillsFixture, { status: 200 }));
    const result = await fetchUserFills(testWallet);
    expect(Array.isArray(result)).toBe(true);
    expect(typeof result[0]!.px).toBe('number');
    expect(['B', 'A']).toContain(result[0]!.side);
  });

  it('throws HyperliquidApiError on non-2xx response', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response('{"error":"nope"}', { status: 500 }));
    await expect(fetchUserFills(testWallet)).rejects.toThrow(HyperliquidApiError);
  });

  it('throws when the response body fails validation', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response('[{"coin":"BTC"}]', { status: 200 }));
    await expect(fetchUserFills(testWallet)).rejects.toThrow();
  });
});

describe('fetchClearinghouseState', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs with type "clearinghouseState"', async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValue(new Response(stateFixture, { status: 200 }));

    const state = await fetchClearinghouseState(testWallet);

    expect(JSON.parse(mockFetch.mock.calls[0]![1]!.body as string)).toEqual({
      type: 'clearinghouseState',
      user: testWallet,
    });
    expect(typeof state.time).toBe('number');
  });
});
```

Run:

```bash
pnpm test src/lib/api/
```

Expected: FAIL — cannot find module. Good.

- [ ] **Step 5.2: Write the client (GREEN)**

Create `src/lib/api/hyperliquid.ts`:

```ts
import { z } from 'zod';
import type { WalletAddress } from '@entities/wallet';
import type { RawFill } from '@entities/fill';
import {
  ClearinghouseStateSchema,
  UserFillsResponseSchema,
  type ClearinghouseState,
} from '@lib/validation/hyperliquid';

const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';

export class HyperliquidApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = 'HyperliquidApiError';
  }
}

/**
 * POST to Hyperliquid's /info endpoint with the given request body and
 * validate the response against the provided Zod schema. Throws
 * HyperliquidApiError for transport-level failures and a ZodError for
 * schema mismatches.
 */
async function postInfo<T>(body: object, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(HL_INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new HyperliquidApiError(
      `Hyperliquid /info returned ${response.status}`,
      response.status,
      text,
    );
  }
  const json = JSON.parse(text) as unknown;
  return schema.parse(json);
}

export function fetchUserFills(wallet: WalletAddress): Promise<RawFill[]> {
  return postInfo({ type: 'userFills', user: wallet }, UserFillsResponseSchema);
}

export function fetchClearinghouseState(wallet: WalletAddress): Promise<ClearinghouseState> {
  return postInfo({ type: 'clearinghouseState', user: wallet }, ClearinghouseStateSchema);
}
```

- [ ] **Step 5.3: Run tests**

```bash
pnpm test src/lib/api/
```

Expected: all tests pass. If a test fails because the client's request body shape doesn't match what the test asserts, adjust the client to match the test — the test is the spec.

- [ ] **Step 5.4: Run all tests + lint + typecheck**

```bash
pnpm test
pnpm lint
pnpm typecheck
```

All exit 0.

- [ ] **Step 5.5: Commit**

```bash
git add src/lib/api/
git commit -m "$(cat <<'EOF'
feat(api): add Hyperliquid /info client with validated response pipeline

postInfo<T>() POSTs JSON to api.hyperliquid.xyz/info and pipes the
response through a Zod schema, throwing HyperliquidApiError on non-2xx
and ZodError on schema violations. fetchUserFills and
fetchClearinghouseState wrap postInfo with the right request type tag
and the matching schema.

Tests mock global.fetch and stream the committed fixtures through the
real validation pipeline — so they verify request shape, response
parsing, and error paths without a live API call.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Docs updates

**Files:**
- Modify: `docs/CONVENTIONS.md`
- Modify: `docs/SESSION_LOG.md`
- Modify: `docs/BACKLOG.md` (remove the Session-2-blocking `tests/fixtures/` bullet)

- [ ] **Step 6.1: CONVENTIONS.md — document API boundary error handling**

Append to CONVENTIONS.md §7 ("Error handling and provenance"):

```markdown
- API clients in `lib/api/**` **throw** typed error classes (e.g., `HyperliquidApiError`) on transport failures and let Zod throw `ZodError` on schema mismatches. Thrown errors flow naturally into TanStack Query's error state in hooks built on top. Pure-domain and domain-adjacent code continues to return `Result<T, E>` unions per §3.
```

Append to §8 ("Testing"):

```markdown
- Anonymized response fixtures live in `tests/fixtures/<source>/`. Unit tests in `lib/validation/` and `lib/api/` read them; no unit test hits a live API. Refreshing fixtures is a manual operation documented in each fixtures directory's `README.md`.
```

- [ ] **Step 6.2: BACKLOG.md — check off the `tests/fixtures/` bullet**

Delete the line `- \`[soon]\` Session 2 should create \`tests/fixtures/\` (with a \`.gitkeep\`) as its first commit — CONVENTIONS.md §8 forward-references it.`

Done by creating real fixtures in Task 2.

- [ ] **Step 6.3: SESSION_LOG.md — append the Session 2a entry**

Append to SESSION_LOG.md, after the Session 1 entry:

```markdown
## 2026-04-21 — Phase 1 Session 2a: Data layer foundation

**Session goal:** Build the fetch → validate → type pipeline from Hyperliquid's `/info` endpoint, backed by committed anonymized fixtures, ready for Session 2b to layer UI + Dexie on top.

**Done:**

- `src/entities/`: added `Wallet`, `Provenance` / `Provenanced<T>`, and `RawFill` (inferred from the Zod schema and re-exported for cross-layer consumption).
- `src/lib/validation/hyperliquid.ts`: Zod schemas for `userFills` (`FillSchema` / `UserFillsResponseSchema`) and `clearinghouseState`. Numeric strings coerced to `number` at the boundary via a shared `NumericString` transformer. `side` constrained to `'B' | 'A'`. Schemas use `.passthrough()` so forward-compat HL field additions don't break parsing.
- `src/lib/api/hyperliquid.ts`: `postInfo<T>()` + `fetchUserFills` + `fetchClearinghouseState`. Throws `HyperliquidApiError` on non-2xx, `ZodError` on schema mismatch.
- `tests/fixtures/hyperliquid/`: `user-fills.json` (100 fills, anonymized), `clearinghouse-state.json`, `README.md` documenting refresh + anonymization rules.
- Tests: 6 new in `lib/validation`, 5 new in `lib/api`, all fixture-driven with `global.fetch` mocked. Total suite: 20 tests (was 9).

**Deferred / not done:**

- `lib/storage/db.ts` (Dexie schema) and `features/wallets/` UI — by design, they're Session 2b.
- `userFillsByTime` / pagination — not required for 2b's happy path; add when analytics needs time-sliced fetches.
- Fixture-refresh automation — kept manual for this session. Acceptable because fixtures are low-churn.

**Decisions made:** none (no new ADRs; existing ones held).

**Gotchas for next session:**

- `fetchUserFills` and `fetchClearinghouseState` **throw**. Wrap in TanStack Query hooks (Session 2b) and let `error` surface in the render tree.
- `RawFill` lives at `@entities/fill`, NOT `@lib/validation/hyperliquid`. Consumers outside `lib/` must import from the entity path to stay within the boundaries rule.
- Real wallet address is kept in controller memory; never hardcode in source. The fixture placeholder is `0x0...01`.
- Fixtures use `passthrough()` — if HL adds new fields we'll see them in the fixture JSON but schemas won't care. When we want to type a new field, update the schema and the fixture in the same commit.

**Invariants assumed:**

- No unit test makes a live HTTP call. The only live call ever made was Task 2's one-shot fixture bootstrap.
- Numeric strings from HL are always coerced to `number` at the validation boundary; downstream code never deals with `'42.5'` vs `42.5` ambiguity.
- `src/entities/**` has zero dependencies on `src/lib/**` at the import graph level — check the boundary with the probe technique if unsure.
```

- [ ] **Step 6.4: Commit**

```bash
git add docs/CONVENTIONS.md docs/BACKLOG.md docs/SESSION_LOG.md
git commit -m "$(cat <<'EOF'
docs: record Session 2a conventions, session log, and backlog updates

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Final verification + review

- [ ] **Step 7.1: Full clean-slate verification**

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test:coverage
VITE_BASE_PATH=/hyperjournal/ pnpm build
git status
```

All must pass. Working tree clean.

- [ ] **Step 7.2: Dispatch a full-session code review**

Controller dispatches a fresh `superpowers:code-reviewer` subagent with the scope: every commit from the start of Session 2a through Task 6. Reviewer evaluates:
- CLAUDE.md §3/§4 compliance (especially no business logic outside domain, no `features/*` siblings, no raw fetch calls outside `lib/api`)
- Zod schema coverage vs fixture fields (any field in the fixture the schema ignores?)
- Client error handling (is every throw path covered by a test?)
- Boundaries enforcement (probe: can `domain/` import from `lib/api`? Should error)
- Commit discipline

Apply fixes from the review in a single follow-up commit before closing the session.

---

## Self-review checklist (plan author)

- **Spec coverage:** every Session 2a roadmap bullet maps to a task —
  - `entities/` Wallet/Provenance/RawFill → Task 1 + Task 3
  - `lib/validation/hyperliquid.ts` Zod schemas → Tasks 3 + 4
  - `lib/api/hyperliquid.ts` client → Task 5
  - Anonymized fixtures from real wallet → Task 2
  - TDD throughout `lib/validation/` and `lib/api/` → Tasks 3, 4, 5 all write tests first
- **No placeholders:** every code block is final content; no `TODO`/`TBD`. The one `never` placeholder in `src/entities/fill.ts` is an intentional compile-time forcing function that Task 3 replaces.
- **Type consistency:** `WalletAddress` imported from `@entities/wallet`; `RawFill` re-exported from `@entities/fill` → `@lib/validation/hyperliquid`'s `Fill`; schemas use the shared `NumericString` transformer.
- **Fixture-first:** every validation/API test reads from `tests/fixtures/hyperliquid/`; the only live-API touch is Task 2 and its output is anonymized before commit.
