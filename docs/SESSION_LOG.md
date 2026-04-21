# Session Log

Append-only record of what each session worked on. Newest entries at the top.

Every session **must** add an entry before closing. The goal is that a future session can read the most recent 2–3 entries and immediately understand the current state of the project.

## Entry format

```
## YYYY-MM-DD — <Short title>

**Session goal:** <one line>

**Done:**
- <bullet>
- <bullet>

**Deferred / not done:**
- <bullet> — <why>

**Decisions made:** <ADR-XXXX, ADR-YYYY> (or "none")

**Gotchas / notes for next session:**
- <anything non-obvious the next session should know>

**Invariants assumed:**
- <any assumption this session made that isn't written down elsewhere>
```

---

## 2026-04-21 — Phase 1 Session 1: Scaffold & shell

**Session goal:** Lay the Vite + React + TS-strict foundation with Tailwind tokens, split-home route, PWA scaffold for GH Pages, import-boundary-enforcing ESLint, a working Vitest TDD loop proven end-to-end, and a CI deploy workflow.

**Done:**

- Scaffolded Vite 5 + React 18 + TS 5 strict (Node 22.14, pnpm 10.15). Every runtime and dev dependency pinned in `package.json`.
- Tailwind configured with dark-first HSL-CSS-variable tokens (`gain`, `loss`, `risk`, `neutral`, `accent`, bg/fg/border variants). Global `prefers-reduced-motion` override in `src/styles/globals.css`.
- App shell: `AppProviders` (TanStack Query with sensible defaults), `AppRouter` (React Router v6 `createBrowserRouter` with `basename` tied to `import.meta.env.BASE_URL`), and `SplitHome` route rendering `AnalyticsPanel` + `JournalPanel` empty-state cards. `SplitHome` lives in `src/app/`, not `src/features/home/`, because cross-feature composition cannot live in a feature folder without violating CLAUDE.md §3.7 (see refactor commit `2a05638`).
- ESLint (legacy `.eslintrc.cjs`) with `eslint-plugin-boundaries` encoding CLAUDE.md §4. Added `eslint-import-resolver-typescript` + ADR-0005 so the rule also fires on `@features/*` aliased imports, not just relative ones (the rule was silently half-enforcing without it).
- Prettier configured; tracked docs and one source file reformatted to conform.
- Vitest + RTL + jsdom; setup file in `src/tests/setup.ts`; smoke test at `src/app/SplitHome.test.tsx`.
- First TDD cycle end-to-end: `src/entities/wallet.ts` (branded `WalletAddress`) + `src/domain/wallets/isValidWalletAddress.{ts,test.ts}` (8 tests, 100% coverage; 90% threshold enforced for `src/domain/**`).
- PWA scaffold: inline-SVG favicon, placeholder icons, spa-github-pages 404.html redirect + companion decoder script in `index.html`.
- GitHub Actions workflow `.github/workflows/deploy.yml` that installs with `--frozen-lockfile`, runs typecheck + lint + `test:coverage` + build (with `VITE_BASE_PATH=/<repo>/`), then deploys via `actions/deploy-pages@v4`. The 404.html fallback step is guarded to avoid overwriting the real redirect file.
- Updated `docs/CONVENTIONS.md` §§2–3, 5–6, 8–10 with patterns that landed this session.

**Deferred / not done:**

- Playwright and any E2E tests — no user flow to exercise yet; Session 4+.
- shadcn/ui initialization — first real consumer arrives in Session 2 (wallet input).
- Real PWA icons (192/512 PNG + maskable variants) — Session 5 polish.
- The automatic merge of `packageManager@pnpm@9.12.0` (plan) → `pnpm@10.15.0` (local env) was applied without an ADR because 10.x is drop-in compatible for our usage. If it causes friction later, revisit.

**Decisions made:** ADR-0002 (GH Pages deploy), ADR-0003 (pnpm), ADR-0004 (React Router v6 BrowserRouter), ADR-0005 (ESLint legacy config + `eslint-import-resolver-typescript`).

**Gotchas for next session:**

- Production builds must be run with `VITE_BASE_PATH=/<repo-name>/` or Pages asset paths 404. CI sets this from `github.event.repository.name`; locally, set it manually.
- Per ADR-0004, the wallet address belongs in the URL (e.g., `/w/:address`), not in Zustand. Session 2's wallet feature should consume it with `useParams()`.
- Path aliases are duplicated across `tsconfig.json`, `vite.config.ts`, and `vitest.config.ts`. Any new alias must be added to all three or tests, build, or lint will silently miss it. `eslint-import-resolver-typescript` reads from `tsconfig.json` automatically.
- The boundaries rule now fires on both relative and aliased imports. A probe (`src/domain/wallets/_probe.tsx` importing `@features/analytics`) was used during Task 5 to verify and then cleaned up. Repeat the probe pattern when changing boundary rules in the future.
- After the first push to GitHub, enable Pages manually: Settings → Pages → Source: GitHub Actions. Not automatable.
- The `Copy 404.html` step in the CI workflow is guarded (`if [ ! -f dist/404.html ]`) so it does not overwrite the SPA redirect written by `public/404.html`. The original plan text had an unconditional `cp` that would have broken SPA routing in production — left a note in Task 9's prompt about the fix.
- `features/home/` was tried and removed; do not reintroduce it. Composition across features goes in `src/app/`.

**Invariants assumed:**

- Every test added to `src/domain/**` keeps coverage ≥ 90% (threshold in `vitest.config.ts`). Tests for `lib/`, `features/`, etc. are not coverage-enforced (yet).
- `src/styles/globals.css` is the single source of CSS custom properties; components consume them only through Tailwind color classes. Hex/rgb literals in components are a regression.
- The `boundaries` ESLint rule is the authoritative encoder of CLAUDE.md §4. Any relaxation requires an ADR that amends §4 first.
- The commit history tells the story one logical change at a time. Do not squash: the sequence of dbcf2cb → 1ef8f62 → 2a05638 encodes the review response loop that produced the final Task 4 state; future readers need to see it.

---

## 2026-04-21 — Phase 1 Session 2a: Data layer foundation

**Session goal:** Build the fetch → validate → type pipeline from Hyperliquid's `/info` endpoint, backed by committed anonymized fixtures, ready for Session 2b to layer UI + Dexie on top.

**Done:**

- `zod@3.23.8` installed as a runtime dependency (blessed in CLAUDE.md §2, just wasn't yet in `package.json`).
- `src/entities/`: added `Wallet` (local-first concept), `Provenance` / `Provenanced<T>` (plan.md §4.4 classification), and `RawFill` as a **plain-type entity** whose shape is the stable contract. The Zod schema verifies mutual assignability at compile time via a `_schemaCheck` constant — if the wire shape ever drifts, `tsc --noEmit` fails in `lib/validation`, not in `entities`.
- `src/lib/validation/hyperliquid.ts`: Zod schemas for `userFills` (`FillSchema` / `UserFillsResponseSchema`) and `clearinghouseState` (`ClearinghouseStateSchema`). Shared `NumericString` transformer coerces HL's string-encoded quantities into `number` at the boundary. `side` constrained to `'B' | 'A'`. `twapId` nullable. `entryPx` and `liquidationPx` nullable. Schemas use default `.strip()` behavior — forward-compat fields are silently dropped until explicitly added.
- `src/lib/api/hyperliquid.ts`: `postInfo<T>()` + `fetchUserFills` + `fetchClearinghouseState`. Throws `HyperliquidApiError` (with `status` and `body` preserved) on non-2xx; `ZodError` bubbles on schema mismatch. `postInfo` types its schema parameter as `z.ZodType<T, z.ZodTypeDef, unknown>` because the default `z.ZodType<T>` breaks on transform-carrying schemas — captured in CONVENTIONS.md §7.
- `tests/fixtures/hyperliquid/`: `user-fills.json` (2000 real fills from the authorized test wallet, truncated to 100, wallet address swapped for `0x0...01`), `clearinghouse-state.json` (full snapshot, anonymized), `README.md` documenting refresh + anonymization. Anonymization verified: `grep -rci 'f318AFb8...' tests/fixtures/` returns 0.
- Tests: 11 in `lib/validation` (7 FillSchema + 4 ClearinghouseStateSchema), 6 in `lib/api`, all fixture-driven and `fetch`-mocked. Total suite: 26 (was 9).
- CONVENTIONS.md §7 updated with API boundary error handling, entities-as-contract pattern, and the `z.ZodType<T, _, unknown>` workaround. §8 updated with fixture convention + mocked-fetch pattern.

**Decisions made:** none (no new ADRs; the dependency-direction choice for `RawFill` is an inference from CLAUDE.md §4, not a new principle).

**Deferred / not done:**

- `lib/storage/db.ts` (Dexie schema) and `features/wallets/` UI — Session 2b, by design.
- `userFillsByTime` / pagination — not required for 2b's happy path; add when analytics needs time-sliced fetches.
- Fixture-refresh automation (e.g., a `scripts/refresh-fixtures.ts`) — kept manual; low churn, low value.
- Entity promotion for `ClearinghouseState` — stays as a lib/validation type until a `domain/` consumer appears.

**Gotchas for next session:**

- `fetchUserFills` and `fetchClearinghouseState` **throw** (`HyperliquidApiError` on transport, `ZodError` on schema). Wrap in TanStack Query hooks; don't try/catch at the call site.
- `RawFill` lives at `@entities/fill`. Never import it from `@lib/validation/hyperliquid` — the boundaries rule forbids `entities → lib`, and the entity is the authoritative shape anyway.
- The real wallet address is in controller memory only. The fixture placeholder `0x0000000000000000000000000000000000000001` is what tests use. Never hardcode the real one in source.
- The `_schemaCheck` constant in `hyperliquid.ts` will break typecheck if someone changes `RawFill` in entities without also updating `FillSchema`, or vice versa. That's the point — treat the error as a design coordination signal, not a nuisance.
- When HL adds a new field you want, update BOTH `RawFill` (entity) and `FillSchema` (validation) in the same commit.
- Session 2b's first task should create `.nvmrc` (Session 1 reviewer flagged CI/local Node divergence; Session 1 pinned CI to 22, but an `.nvmrc` would close the loop).

**Invariants assumed:**

- No unit test makes a live HTTP call. The only live call ever made was Task 2's one-shot fixture bootstrap.
- Numeric strings from HL are always coerced to `number` at the validation boundary; downstream code never sees string-encoded numbers.
- Committed fixtures contain zero occurrences of the authorized wallet address (case-insensitive). Future refreshes must preserve this invariant.
- The dependency graph direction is `entities → (nothing)`, `lib/validation → entities`, `lib/api → lib/validation, entities`. A change that inverts any of these edges is a design regression.

---
