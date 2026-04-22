# Phase 1 Session 6 — Export / Import + Playwright E2E (design spec)

- **Date:** 2026-04-22
- **Status:** Draft — awaiting user review
- **Author:** Claude (Opus 4.7)
- **Follow-up:** Implementation plan generated via `superpowers:writing-plans` after this spec is approved.

---

## Goal

Close `docs/plan.md` §24 #6 (export and re-import local data successfully). Ship a `/settings` route with export + import controls and a first Playwright E2E that covers both the paste-wallet smoke flow and an export → import round-trip.

After this session lands, the only remaining v1 acceptance item is journaling (§24 #5), which is scoped to Session 7+.

## Why now

- Plan §24 #6 names export/import as v1 acceptance, and the format design is load-bearing for Phase 3 — journaling data will ride the same envelope.
- A data-loss story is the strongest case for users to trust a local-first product. Without export, a user who clears site data loses everything.
- Playwright has been deferred since Session 1; `/w/:address` is stable enough to smoke and the export → import round-trip is exactly the kind of multi-step flow that unit tests cannot verify.

## Non-goals (explicit)

1. **Selective import.** All-or-nothing per table. UI surface for "import these 3 of 5 wallets" is a Phase 2+ nice-to-have.
2. **Encryption.** Nothing in v1 export is secret (wallet addresses are public on-chain). Encryption becomes relevant once API keys land in Phase 4.
3. **Cloud sync or share links.** Out of scope for a local-first product; post-v1.
4. **Migration from `formatVersion > 1`.** Loud error; decide the path when a v2 actually lands.
5. **Journaling data.** Tables don't exist yet; format is extensible so they slot in during Phase 3.
6. **CI gate on Playwright.** Manual runs per session for now; CI wiring is a BACKLOG item.

---

## Scope

### Lane 1 — `/settings` route scaffolding

**What:**
- New route at `/settings`, mounted in `src/app/router.tsx`.
- `src/app/Settings.tsx` — minimal page chrome, one section (Data).
- Navigation links: one in `WalletHeader` (next to Back), one on SplitHome (small footer or corner link). Both use the standard focus-visible ring string from CONVENTIONS §12.

**Why a dedicated route:** Export/import is chrome-level, not part of the analytics flow. A route gives Phase 4 (AI key management) and Phase 5 (display preferences) a natural home without cramming SplitHome or WalletView.

### Lane 2 — Export pipeline

**What:**
- Pure-domain helper `buildExport(snapshot, options): ExportFile` under `src/domain/export/`. Deterministic, fully testable without IO.
- `src/lib/storage/export-repo.ts` — one-shot snapshot reader that pulls every row from `wallets`, `userSettings`, and (conditionally) `fillsCache` into a plain object. Uses the existing `HyperJournalDb` singleton; tests inject an in-memory DB.
- UI in `Settings.tsx`: "Include cached market data" checkbox (default off), "Export data" button. Clicking builds a blob URL and triggers `<a download>`. Filename: `hyperjournal-export-YYYY-MM-DD.json`.

**What gets exported:**
- `wallets`: all rows.
- `userSettings`: the singleton row if present, else `null`.
- `fillsCache`: all rows IFF `includeCache === true`.

### Lane 3 — Import pipeline

**What:**
- Zod schema `ExportFileSchema` at `src/lib/validation/export.ts` validates the full envelope + per-row structure. Reuses fill/wallet schemas where possible.
- Pure-domain `mergeImport(existing, incoming): MergeResult` under `src/domain/export/`. Strategy for v1 is fixed:
  - `wallets`: upsert by address, incoming wins on conflict.
  - `userSettings`: overwrite (it's a singleton — latest wins).
  - `fillsCache`: upsert by address IFF present in the incoming file.
- `src/lib/storage/import-repo.ts` — bulk writer that applies the merge result inside a single Dexie transaction.
- UI: `<input type="file" accept=".json">`. On selection, parse → validate → show a dry-run summary ("Will import N wallets, M cache entries, overwrite settings"). "Confirm import" commits; "Cancel" discards.

**Merge strategy rationale:** Fixed upsert keeps v1 deterministic. A future session can add a strategy selector ("merge" vs "replace"), but YAGNI today — the common case is restoring into an empty browser profile.

### Lane 4 — File format

```json
{
  "app": "HyperJournal",
  "formatVersion": 1,
  "exportedAt": 1714000000000,
  "data": {
    "wallets": [
      { "address": "0x...", "label": null, "addedAt": 1713000000000 }
    ],
    "userSettings": { "key": "singleton", "lastSelectedAddress": "0x..." },
    "fillsCache": [
      { "address": "0x...", "fetchedAt": 1714000000000, "fills": [ ... ] }
    ]
  }
}
```

- Top-level `app: "HyperJournal"` lets us reject foreign-origin files with a clear error before running the heavier schema check.
- `formatVersion: 1` is the contract. Additive changes to `data` do NOT bump the version (new fields are optional; Zod is strict on unknown keys at the envelope level but permissive on new-optional fields inside `data`). Breaking changes bump.
- `exportedAt` is informational only; never used for merge decisions.
- `data.userSettings` is the singleton row or `null`. `data.fillsCache` is present only when the exporter included it.

### Lane 5 — Playwright E2E smoke

**What:**
- One-time toolchain setup:
  - Install `@playwright/test` as a devDep.
  - `playwright.config.ts` at repo root: `testDir: './e2e'`, `webServer: { command: 'pnpm dev', url: 'http://localhost:5173', reuseExistingServer: true }`, `projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]`, `baseURL: 'http://localhost:5173'`.
  - `e2e/` directory with test files. Share fixture loading via a helper.
  - `pnpm test:e2e` script runs `playwright test`.
  - `.gitignore` excludes `test-results/`, `playwright-report/`, `playwright/.cache/`.

- **Test 1 — Paste flow smoke:**
  - Intercept `POST https://api.hyperliquid.xyz/info` via `page.route()`, return the committed fixture at `tests/fixtures/hyperliquid/user-fills.json` (wallet address substituted if needed).
  - Navigate to `/`, paste test wallet (committed fixture placeholder `0x0...01`), click Analyze.
  - Assert landing on `/w/:address`, the four visualizations all present: metrics grid (card count), equity canvas (by test-id), calendar canvas, trade-history rowgroup has rows.

- **Test 2 — Export/import round-trip:**
  - Seed state: paste wallet (reusing Test 1's setup) so the DB has a row.
  - Navigate to `/settings`, click Export → capture the download with Playwright's `page.waitForEvent('download')`.
  - Fresh browser context (cleared storage). Visit `/settings`, use the file input to upload the captured file, confirm the summary, commit.
  - Assert the saved wallet appears on `/` and navigates to `/w/:address`.

**Why dev server, not preview:** Dev server starts faster, and the tests don't depend on service-worker behavior or production minification. If flake surfaces we can swap to `pnpm preview`; documented as a BACKLOG caveat.

---

## Test strategy

- **Unit (Vitest):** `buildExport`, `parseExport` (thin wrapper around Zod), `mergeImport` under `src/domain/export/`. TDD. 100% coverage on `src/domain/export/**` keeps coverage threshold intact.
- **Component (RTL):** Settings page — export button triggers download (mock `URL.createObjectURL` and capture the blob); import reads a synthetic `File` and shows the summary; error copy renders for malformed JSON and version mismatch.
- **E2E (Playwright):** Two tests above. Run via `pnpm test:e2e` — not in the default `pnpm test` gauntlet. Manual run before session close.
- **Bundle check:** Playwright and its dependencies are devDeps; confirm they don't land in the production bundle. `pnpm build` size stays at or below post-Session-5 baseline.

## Error handling

All error surfaces in the Settings import panel, using the CONVENTIONS §12 pattern (heading + recovery action):

- Malformed JSON → "That file doesn't look like a HyperJournal export. Check the file is valid JSON."
- Zod fail (wrong envelope shape) → "That file is a HyperJournal export but the data doesn't match what this version understands. Please report this."
- Wrong `app` field → "That file was exported from a different application."
- `formatVersion > 1` → "That file was exported from a newer version of HyperJournal. Update and try again."
- Unknown error → "Something went wrong. Try again." with a reload action.

All error cases have a "Try again" or "Choose a different file" affordance.

## BACKLOG entries to file as part of this session

1. **Selective import** — UI for per-row / per-table selection at import time. Useful for merging two partial exports.
2. **Encryption at rest (for exports)** — AES-GCM with a user-supplied passphrase. Required once API keys enter the format (Phase 4).
3. **Cloud sync** — Post-v1; would need a server, which contradicts the local-first premise. Probably deprecated as an option entirely.
4. **Migration from `formatVersion > 1`** — Design when v2 is actually proposed, not preemptively.
5. **CI gate on Playwright** — `.github/workflows/deploy.yml` runs `test:e2e` before deploying. Requires a stable test run first.
6. **Switch Playwright webServer to `pnpm preview`** — Only if the dev server produces flake.

## Acceptance criteria for Session 6 end-of-day

1. `/settings` route exists and is navigable from both SplitHome and WalletView.
2. Clicking Export with the checkbox off produces a JSON file ≤ 50 KB for a typical wallet profile; with the checkbox on, includes the full `fillsCache`.
3. Importing a valid export file produces the expected state (wallets, userSettings, optionally fillsCache) with upsert semantics for existing rows.
4. Importing malformed / foreign / version-mismatched files shows the mapped human copy and does NOT mutate state.
5. Playwright test suite runs via `pnpm test:e2e` and passes both tests against the dev server.
6. Full gauntlet (`pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build`) green. Coverage on `src/domain/**` ≥ 90%.
7. SESSION_LOG.md has an entry. BACKLOG.md has the six new entries above. CONVENTIONS.md updated (likely §13 Export format or a §12 addendum for the Settings UX pattern).

## Open questions

None at spec time. Implementation-level questions (exact Playwright timeouts, exact download-capture semantics, error-copy tweaks) are discovery during the session.

---

## Appendix — known ambiguities worth flagging to the implementer

- **Route basename.** `BrowserRouter` uses `import.meta.env.BASE_URL`. The `/settings` route must be declared relative to that basename — same as `/w/:address`. No ADR needed; follow the existing router pattern.
- **Downloading via `<a download>`.** Works in all target browsers. Blob URLs must be revoked after the click to avoid leaking — use `URL.revokeObjectURL(url)` on a short `setTimeout`.
- **Playwright `page.route` and fetch interception.** HL API calls go through the browser's `fetch`; `page.route('**/info', ...)` intercepts everything including the `/info` POST. The route handler returns a response built from the fixture JSON. No dependency on `msw` or other mocking frameworks.
- **Fixture wallet address in E2E.** The committed fixture uses the anonymized placeholder `0x0000000000000000000000000000000000000001`. E2E uses that same address to paste — never the authorized test wallet, which stays in controller memory only.
- **Settings navigation link styling.** Match the existing Back link's style in WalletHeader. For SplitHome, a small "Settings" link in the footer (bottom-right of the main) is minimal; no header redesign needed.
- **Import dry-run without committing.** The Zod parse produces the typed value; `mergeImport` produces the MergeResult. Calling the repo writer is a separate step gated on user confirmation. Tests verify this: parsing alone must never touch Dexie.
- **Fresh browser context in Playwright Test 2.** `test.describe.configure({ mode: 'serial' })` + `context.clearCookies()` / `context.clearStorage()` between the two tests, OR use two separate `test()`s with `test.use({ storageState: undefined })`. The exact shape is discovery.
