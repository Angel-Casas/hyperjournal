# Conventions

This file captures coding and UI patterns that have emerged during development. It is **living documentation** — patterns get added as they stabilize, and removed when they are superseded.

Conventions here are weaker than rules in `CLAUDE.md`. Rules are invariants; conventions are strong defaults. If you deviate from a convention, leave a short comment explaining why.

When a genuinely new pattern emerges that others will copy, document it here before it proliferates.

---

## 1. TypeScript

_To be populated as patterns emerge._ Initial expectations:

- Prefer `type` over `interface` except when declaration merging or class implementation is needed.
- Branded types for identifiers that are stringly-typed in the API (e.g., `type WalletAddress = string & { readonly __brand: 'WalletAddress' }`).
- Use `satisfies` to type literal configs without widening.
- Discriminated unions for state shapes that represent alternatives (loading / loaded / error).

---

## 2. File and module layout

- A feature exposes its public surface through `index.ts`. Everything else in the folder is internal.
- Components are named the same as their file: `TradeCard.tsx` exports `TradeCard`.
- Co-locate tests: `foo.ts` + `foo.test.ts` in the same directory.
- Hooks start with `use`, domain functions use verbs (`reconstructTrades`, `computeExpectancy`).
- Path aliases (`@app/*`, `@features/*`, `@domain/*`, `@entities/*`, `@lib/*`, `@state/*`, `@styles/*`) are the canonical import form for cross-layer references. They are declared in `tsconfig.json` (`paths`), mirrored in `vite.config.ts` (`resolve.alias`) and `vitest.config.ts` (`resolve.alias`), and resolved for ESLint via `eslint-import-resolver-typescript` (ADR-0005). Any new alias must be added to all three configs or lint will silently miss boundary violations.
- Cross-feature composition lives in `app/`, not in a new `features/*` folder. CLAUDE.md §3.7 forbids `features/*` from importing siblings; `app/` is allowed to depend on any feature, which is exactly what a composed view like `SplitHome` needs.

---

## 3. Domain layer (`domain/`)

- Pure functions only. No `Date.now()`, `Math.random()`, network, or storage calls — inject them as parameters if needed.
- Inputs and outputs are plain data (no class instances).
- Errors are returned as `Result<T, E>` unions, not thrown, for code paths where the caller must make a decision.
- Every public function has at least one Vitest test covering the happy path and one edge case.
- `domain/` may only import from `@entities/*` (and other `@domain/*`). The boundary is lint-enforced (`boundaries/element-types`).
- Coverage threshold for `src/domain/**/*.ts` is 90% lines / branches / functions / statements, configured in `vitest.config.ts`. Adding a domain function without a test will fail `pnpm test:coverage` and therefore fail CI.
- Worked example (simple): `src/domain/wallets/isValidWalletAddress.ts` — pure predicate, narrows `string` to the branded `WalletAddress` type, 100% covered.
- Worked example (multi-file algorithm): `src/domain/reconstruction/` — one file per concern (group, per-coin reconstruct, top-level orchestrator, PnL oracle), each with its own co-located test. Running-state walks use local `let` variables in a pure function; mutation is scoped to the function, the function's inputs and outputs remain immutable. Future multi-file domains should follow this shape.
- When a domain module throws on unexpected input (unknown enum, dangling state, impossible invariant), the error message must name the function, the relevant keys (coin, wallet, etc.), and the offending identifier (tid, hash, etc.) so a production stack trace is debuggable without the full input.
- **Oracle-gated correctness:** algorithms whose output must match an external source (like HL's own realizedPnl) ship with a cross-check function that compares both sides. `checkRealizedPnl` is the canonical example — it is the real correctness gate for reconstruction, not just a test. Future algorithms with external ground truth (e.g., Sharpe ratio against TradingView if we ever add that) should ship their oracle alongside.
- **Handle truncation gracefully.** Production data from Hyperliquid is capped at 2000 fills per request — trades can span that boundary and appear mid-lifecycle in our window. Prime state from HL's `startPosition` field on the first fill (signed: positive=long, negative=short) rather than assuming zero. Emitted trades whose opens were truncated have `avgEntryPx: null` and `openedSize: 0`; this is honest, not lossy.

---

## 4. Components and hooks

- Hooks that reach into storage (e.g., `useUserFills`, `useSavedWallets`) accept a `{ db?: HyperJournalDb }` options bag. Callers in the app use the default; tests inject a uniquely-named in-memory Dexie via the `db` option. Keep this pattern — it lets repository tests stay in `lib/storage/` and hook tests stay in `features/` without cross-pollution.
- shadcn-style primitives (Button, Input, Label) live at `@lib/ui/components/*` and are imported directly (`import { Button } from '@lib/ui/components/button'`). Do NOT re-export them through feature `index.ts` — each consumer imports from the canonical path so refactors stay localized.
- `cva` variant config lives in a sibling `.ts` file (e.g., `button-variants.ts`) not inside the component `.tsx`, so the component module stays component-only for React Fast Refresh (`react-refresh/only-export-components`).
- For forms with submit buttons, disable the button whenever the domain predicate says the input is invalid. Do not rely on `onSubmit` guards alone — the disabled state communicates intent to the user.
- **Null-vs-zero for analytical outputs.** Any number field that could be undefined for an input set (e.g., `winRate` on zero closed trades, `avgEntryPx` on a truncated-opens trade) is typed `number | null`. `null` means "no data" and renders as em-dash (`—`); `0` means a real zero result and renders as its numeric form. Formatters in `@lib/ui/format` enforce this convention — pass `null` through, don't coerce to 0.
- **Tone + provenance on MetricCard.** `MetricCard` takes a `tone` (`'neutral' | 'gain' | 'loss' | 'risk'`) that colours the value, and an optional `provenance` that renders a 2×2px dot with a title-attribute tooltip. Decorative-only (`aria-hidden`); screen readers see just the label and value. When passing a conditional subtext (`cond ? 'x' : undefined`) ensure the prop type allows explicit undefined — `exactOptionalPropertyTypes: true` is strict about this.

---

## 5. Styling

- Tailwind utility classes, not inline styles.
- Design tokens are HSL CSS custom properties in `src/styles/globals.css` (`:root { --bg-base: ...; --gain: ...; ... }`) and mapped to Tailwind color names in `tailwind.config.ts` via `hsl(var(--name) / <alpha-value>)`. Alpha modifiers work (`bg-bg-raised/50`).
- Semantic color names available: `bg-base` / `bg-raised` / `bg-overlay`, `fg-base` / `fg-muted` / `fg-subtle`, `border` / `border-strong`, `gain`, `loss`, `risk`, `neutral`, `accent`. Never hardcode hex or `hsl(...)` literals in components.
- Typography uses `font-sans` (InterVariable) and `font-mono` (JetBrains Mono). Radii: `rounded-sm` (6px), `rounded-md` (10px), `rounded-lg` (14px), `rounded-xl` (20px).

---

## 6. State management

- Server / cached data → TanStack Query. One `QueryClient` instantiated inside `useState` in `src/app/providers.tsx`; defaults: `staleTime: 30s`, `gcTime: 5min`, `refetchOnWindowFocus: false`, `retry: 1`.
- UI state that outlives a component → Zustand store (`src/state/ui-store.ts`).
- Component-local ephemeral state → `useState` / `useReducer`.
- **Addressable vs non-addressable UI state** (ADR-0004): anything worth a deep-link or browser-back lives in the route (wallet address, expanded-view selection, filter state if shareable). Only non-addressable UI state (panel hover, drawer-open toggles) lives in Zustand. Never put `selectedWalletAddress` in Zustand.
- Never store Hyperliquid API responses directly in Zustand; they belong in TanStack Query's cache or Dexie.
- **Dexie is the single persistent store** for user data (wallets, cached API responses, journals when they land, settings). All Dexie access goes through repository factories in `src/lib/storage/*-repo.ts` that expose typed methods; no direct `db.<table>.get(...)` calls from features, hooks, or components. Repository factories take the `HyperJournalDb` instance so tests inject a uniquely-named database per test.
- **Cache-through pattern** for API-backed queries: `queryFn` reads Dexie first; if the entry is within TTL, returns it instantly; otherwise fetches live, validates, writes back to Dexie, returns fresh. On fetch failure with a prior cache, return stale data instead of an error. `useUserFills` is the canonical reference.

---

## 7. Error handling and provenance

- External boundaries (API, storage, file import) validate with Zod and surface parse errors distinctly from network errors.
- API clients in `lib/api/**` **throw** typed error classes (e.g., `HyperliquidApiError` with `status` and `body`) on transport failures and let `ZodError` bubble on schema mismatches. Thrown errors flow naturally into TanStack Query's `error` state. Pure-domain and domain-adjacent code returns `Result<T, E>` unions per §3 instead of throwing.
- **Dependency direction for shared shapes:** types that cross into `domain/` (e.g., `RawFill`) live in `src/entities/` as plain TypeScript declarations. The Zod schema in `lib/validation/**` carries a compile-time `_schemaCheck` constant that asserts `z.infer<typeof Schema>` is mutually assignable with the entity. This keeps entities as the stable contract while keeping `lib/validation` as the verifier. Types consumed only by `features/**` (e.g., `ClearinghouseState`) may stay inferred from the Zod schema — YAGNI; promote to entity only when a lower layer needs them.
- **Zod + transforms:** functions that take schemas with input transforms (e.g., `NumericString: string → number`) type the schema parameter as `z.ZodType<Output, z.ZodTypeDef, unknown>` — the default `z.ZodType<T>` ties input to output and breaks on transforms. Output stays fully typed.
- Provenance is attached at the point a value is first produced and preserved through transforms.
- UI renders `unknown` values with a neutral placeholder and a tooltip explaining why the value is missing.

---

## 8. Testing

- Vitest for unit tests. `globals: true` in `vitest.config.ts` makes `describe`/`it`/`expect` available without import, but explicit imports are also fine. `environment: 'jsdom'` for component tests.
- Setup file at `src/tests/setup.ts` — imports `@testing-library/jest-dom/vitest` matchers and runs `cleanup()` after each test.
- React Testing Library for component tests — test user-visible behavior, not implementation details. Prefer `getByRole`/`getByText` over `getByTestId`.
- Tests are co-located: `Foo.tsx` + `Foo.test.tsx` in the same directory (including for `src/app/` and `src/domain/**/`).
- TDD for `domain/`: write the failing test first, confirm RED locally, then the minimal impl. `src/domain/wallets/isValidWalletAddress.*` is the canonical reference. The RED phase must be observed (run the test and see the failure for the expected reason) but does not need to be preserved as a separate commit — bundling the failing test + passing impl into one clean commit is acceptable, provided the RED observation happened in execution.
- Playwright for E2E smoke tests — deferred to Session 4+ when a real user flow exists.
- Anonymized response fixtures live in `tests/fixtures/<source>/`. Unit tests in `lib/validation/` and `lib/api/` read them via `readFileSync` + `JSON.parse`; no unit test ever hits a live API. Refreshing fixtures is a manual one-off operation documented in each fixture directory's `README.md`.
- API client tests mock `global.fetch` with `vi.stubGlobal('fetch', vi.fn())` in `beforeEach` and `vi.unstubAllGlobals()` + `vi.restoreAllMocks()` in `afterEach`. Response bodies are streamed from the committed fixtures so the real validation pipeline runs end-to-end.

---

## 9. Accessibility and motion

- All interactive elements reachable by keyboard.
- Focus states visible and consistent.
- `src/styles/globals.css` contains a global `@media (prefers-reduced-motion: reduce)` override that neutralizes animations and transitions across the board. Component-level motion does not need per-instance reduced-motion guards — but if a component relies on a long animation for affordance (e.g., revealing hidden content), it must provide an instant alternative that does not depend on animation timing.
- Contrast meets WCAG AA in both dark and any future light theme.
- Sections use `<section aria-labelledby="...-heading">` + `<h2 id="...-heading">` pattern (see `AnalyticsPanel`, `JournalPanel`).

---

## 10. Commit messages

- Imperative mood: "Add P/L calendar", not "Added" or "Adds".
- Conventional-commit-style prefixes are used in practice: `feat(scope):`, `fix(scope):`, `chore(scope):`, `refactor(scope):`, `test:`, `ci:`, `docs:`.
- Reference the SESSION_LOG entry in the body when relevant.
- One logical change per commit. When a review finds an issue, the fix goes in a new commit (do not amend accepted commits).
- Every commit ends with a `Co-Authored-By` trailer attributing the LLM that produced it, per repo convention.

---

## 11. Charts and data visualization

- **ECharts integration** lives at `@lib/charts/EChartsBase` — a thin React wrapper owning imperative lifecycle (init, `setOption`, `resize` via `ResizeObserver`, `dispose`) per ADR-0007. Consumers pass a complete `EChartsOption`. The wrapper never constructs or mutates options itself.
- **Memoize option objects.** Identical-contents-with-new-reference triggers `setOption` on every render. Wrap your option build in `useMemo([...derivedData])`; prefer a single pure-domain helper (`buildEquityCurve`, `buildPnlCalendar`) as the single source of truth.
- **HSL tokens in chart options are hardcoded.** ECharts receives JS values, not Tailwind classes, so the semantic-token-only rule from §5 has a narrow exception for chart components: hoist the HSL strings into a `TOKEN` const at the top of the file. Do not inline hex values or raw `hsl(...)` deep inside nested config.
- **Testing charts.** Real ECharts requires canvas and DOM layout that jsdom lacks. Use `vi.hoisted()` + `vi.mock('@lib/charts/echarts-setup', () => ({ echarts: { init: mocks.init } }))` to replace the setup module with a fake `init` that returns a stub instance exposing `setOption`, `resize`, `dispose`, `on`, `off` as `vi.fn()`s. Tests verify the option shape passed to `setOption`, not the rendered chart. Visual correctness is confirmed in a browser during the session's manual check.
- **Tree-shaken ECharts imports.** Production code imports ECharts runtime only through `@lib/charts/echarts-setup`, which re-exports the `echarts` namespace after registering the specific chart types, components, and renderer we use (LineChart, HeatmapChart, CalendarComponent, GridComponent, TooltipComponent, VisualMapComponent, CanvasRenderer). New charts MUST add their parts to the `echarts.use([...])` call in that file; otherwise ECharts emits "Component X not exists" at runtime (not at build time). Type-only imports like `import type { EChartsOption } from 'echarts'` are fine anywhere — TypeScript erases them. The `EChartsType` runtime type (for `useRef<EChartsType | null>`) is imported from `'echarts/core'`; the `ECharts` type from the `'echarts'` umbrella has a divergent private-field declaration.
- **Chart a11y fallback.** Because `EChartsBase` renders a canvas with `aria-hidden`, every chart component MUST provide a screen-reader-visible alternative for the data when the data is semantic (values, dates, labels). The canonical pattern is a sibling `<table class="sr-only">` populated from the same pure-domain helper that feeds the chart option — see `PnlCalendarFallbackTable` next to `PnlCalendarChart`. Purely decorative charts (animated splash screens, mood indicators) can skip the fallback.
- **Virtualized lists** use `@tanstack/react-virtual`. `useVirtualizer({ count, getScrollElement, estimateSize, overscan })` wires a scrollable parent div; render items absolutely-positioned via `translateY(v.start)`. jsdom also cannot compute scroll geometry, so virtualization-window behavior must be verified in-browser.
- **ARIA ancestry for virtualized tables.** When using `role="columnheader"` / `role="row"` / `role="cell"` divs (because a real `<table>` would fight `react-virtual`'s absolute positioning), the full chain must be present: `role="table"` wrapper → one `role="rowgroup"` containing the header `role="row"` with `columnheader` children → a second `role="rowgroup"` containing the virtualized body `role="row"`s with `cell` children. Lighthouse's a11y audit flags this as "[role]s are not contained by their required parent element." `TradeHistoryList` is the reference implementation. Tests that target "the rowgroup" must use `getAllByRole('rowgroup')[1]` for the body or `[0]` for the header.

---

## 12. Accessibility

Rules in CLAUDE.md §3 rule 10 are invariants; this section is patterns.

- **Focus visibility.** All interactive elements (Button, Input, Link, and any custom interactive `div`) carry a `focus-visible` ring. The canonical class string is `ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2`. Shared primitives (`Button` via `buttonVariants`, `Input` inline) already include it. New custom clickable elements (Link, clickable div) must add it explicitly.
- **Landmark sections.** Every distinct content region on a route uses `<section aria-labelledby="xxx-heading">` + `<h2 id="xxx-heading">`, even when the heading is visually styled as a subtitle. The five sections on `/w/:address` (the charts + metrics grid + trade history) and the two on `/` (paste / recent) all follow this — add the pattern when introducing new regions.
- **Contrast.** Every foreground token used against `bg-base` and `bg-raised` must clear WCAG AA (≥ 4.5 : 1 for normal-size text, ≥ 3 : 1 for ≥ 18 px or ≥ 14 px bold). When adjusting a token, compute the ratio first — `fg-subtle` was bumped from 50 % to 55 % lightness in Session 5 after measuring 4.29 : 1 against `bg-raised` on 12 px subtext.
- **Chart a11y** — see §11 "Chart a11y fallback."
- **Error states** carry both a heading (what went wrong) and an action (how to recover). `WalletView`'s error branch is the reference: `<h2>` with the mapped human copy, followed by a "Try again" button wired to the refresh path.
- **Verification.** Run Lighthouse → Accessibility audit on affected routes before closing any session that touches UI. Lighthouse uses axe-core under the hood; fix **serious** and **moderate** findings inline, file **minor** findings as BACKLOG.

---

## 13. Export format

- The export file format lives at `src/entities/export.ts` (types) and `src/lib/validation/export.ts` (Zod schema). The two are kept in lockstep via a one-way `_schemaCheck` — changes to either MUST touch both in the same commit, and the schema's output MUST stay assignable to the entity.
- `app: "HyperJournal"` + `formatVersion: 1` are literal-checked at the envelope level. Foreign files and newer-version files fail fast with specific Zod issues that the Settings UI maps to human copy via `importErrorCopyFor`.
- `data.fillsCache` is `.optional()` on the Zod schema and omitted entirely (not null, not []) from the file when the user exports without the cache. The entity types the field as `Array<FillsCacheEntry> | undefined` to align with Zod's inferred shape under `exactOptionalPropertyTypes: true`.
- Additive fields under `data` (e.g., Phase 3's `journalEntries`) do NOT bump `formatVersion` — new optional fields on the envelope are forward-compatible. Breaking changes (renamed field, tightened constraint, removed field) MUST bump.
- Array fields in the entity are declared as `Array<T>` (not `ReadonlyArray<T>`) because Zod infers mutable arrays and the one-way schema check would otherwise fail. Mutation is still forbidden by convention — domain functions never write to their inputs.
- `WalletAddressSchema` uses `z.custom<WalletAddress>(predicate)` so the branded type flows through the inferred shape. Predicate runs at parse time; the branded type is just a static assertion.
- The domain layer (`buildExport`, `mergeImport`) is pure. `exportedAt` is supplied as `options.now` from the caller so tests don't depend on wall-clock time.
- Import is atomic: `createImportRepo.applyMerge` wraps all three table writes in a single Dexie transaction. Partial writes are not a valid state. Empty arrays and null overwrites are no-ops.

---

## 14. Playwright E2E

- Tests live under `e2e/` in the repo root. `e2e/fixtures/` holds shared helpers (route interceptors, data loaders). File naming: `<topic>.spec.ts`.
- `playwright.config.ts` points at the dev server (`pnpm dev`, http://localhost:5173) via `webServer`. CI does not yet run Playwright — that's a BACKLOG item. Locally, `reuseExistingServer: true` so an already-running dev server is picked up.
- Hyperliquid API calls are intercepted via `page.route('**/api.hyperliquid.xyz/info', ...)` using the committed fixture at `tests/fixtures/hyperliquid/user-fills.json`. Never hit the real network in E2E. The shared helper at `e2e/fixtures/hyperliquid-route.ts` is the canonical entry point; it uses `import.meta.url` + `fileURLToPath` so the fixture path resolves under Node's ESM loader.
- The test wallet in E2E is the anonymized fixture placeholder `0x0000000000000000000000000000000000000001`. The authorized live test wallet stays in controller memory only.
- E2E is NOT part of the default `pnpm test` gauntlet — run via `pnpm test:e2e` (or `pnpm test:e2e:ui` for the Playwright UI inspector). Manual run before session close.
- Cross-context state isolation for round-trip tests uses `browser.newContext()` — each context has its own storage (IndexedDB, cookies, localStorage), which is how we test the import-into-empty-browser path.
- File uploads use `inputElement.setInputFiles(path)` where `path` can be a captured download path from `page.waitForEvent('download')` + `download.path()`. This is how the export/import round-trip chains.

---

## 15. Journaling

- **Scope discriminator.** `JournalEntry.scope` is the discriminator string on every entry. Session 7a uses only `'trade'`; 7b/7c extend the enum to `'session'` and `'strategy'`. Queries that target a specific scope MUST filter on the indexed `scope` field.
- **One-entry-per-trade.** For the `'trade'` scope, there is exactly one entry per tradeId. Saves overwrite by `id` (not append). Multi-entry is a BACKLOG item.
- **Autosave on blur.** Journal forms persist the draft to Dexie on every field's `onBlur` — no Save button. `isDraftEmpty` short-circuits writes when nothing has been typed, so navigating through trades without journaling never creates dead rows. Status machine on the form: `clean | dirty | saving | saved | error`. "Saved at HH:MM" chip communicates when the work is safe.
- **Draft-ref pattern.** Forms that autosave-on-blur in the same synchronous tick as the preceding change must mirror their draft state in a `useRef` so the blur handler reads the latest value. `setState` is batched; the blur handler otherwise sees the pre-change state. `TradeJournalForm` is the reference implementation.
- **Hydrate once, safely.** The one-time "copy query result into draft" effect must only run when the query resolves a non-null entry. If the result is null and the user has typed during the initial load, the effect would otherwise clobber their input. `TradeJournalForm` demonstrates the guard.
- **Tri-state booleans.** `planFollowed` and `stopLossUsed` are `boolean | null` — null means "unanswered" and is a first-class value. Forcing a yes/no up front pushes users toward whichever answer is less emotionally loaded.
- **Mood enum, not free text.** Mood is a five-value enum (`calm | confident | anxious | greedy | regretful`) plus null. Pattern detection and Phase 4 AI integration depend on a stable vocabulary; free-text moods would be unqueryable.
- **Entry IDs.** UUID v4 via `crypto.randomUUID()`, generated at first save. Native browser API — no runtime dependency.
- **Additive schema bumps.** New Dexie tables are added via `this.version(N).stores({...})` with the previous version's declaration kept in place. No `.upgrade()` callback is needed unless existing rows need transforming.
- **Journaling export.** Journal entries always travel with exports (unlike `fillsCache`, which is user-regenerable and gated by the `includeCache` toggle). Journals are user-authored and small.
- **Trade-history pencil icon.** Wallet-feature components cannot import `features/journal` (boundaries rule). The `TradeHistoryList` accepts a `tradeIdsWithNotes: ReadonlySet<string>` prop; the composing route (`src/app/WalletView.tsx`) calls `useJournalEntryIds()` and threads the set down. Mutations on journal entries invalidate this query so the pencil icon updates immediately.
- **Discriminated union on scope.** `JournalEntry` is a union of variants discriminated on `scope`. Session 7a introduced `'trade'`; 7b adds `'session'`; 7c will add `'strategy'`. Consumers narrow on `scope` to access variant-specific fields. Repo methods return narrowed types (e.g., `findByTradeId: Promise<TradeJournalEntry | null>`) so most call sites avoid their own type guards.
- **Wallet-agnostic session journals.** Session-scope entries live outside `/w/:address/...` because the fields (mindset, discipline, mistakes) describe the trader, not a wallet. Route lives at `/d/:date`. If a future need for per-wallet session notes surfaces, add an optional `walletAddress` field rather than moving the route under the wallet tree.
- **UTC date anchors.** Session entries key on `date: YYYY-MM-DD` in UTC. `isValidDateString` + `todayUtcDateString` in `@domain/dates/*` are the only two places that produce or validate these strings. Local-timezone mode is a BACKLOG item; do not sprinkle local-date logic across the codebase.
- **Dexie union-shape literals.** Dexie's `InsertType<Union, K>` doesn't preserve variant-specific fields. Inline literal `put({...})` calls fail typecheck when the target type is a discriminated union. Hoist to a typed variable: `const entry: TradeJournalEntry = {...}; await db.journalEntries.put(entry)`.
- **Parallel form implementations, shared pattern.** `TradeJournalForm` and `SessionJournalForm` share the autosave-on-blur pattern (draftRef, hydration guard, isDraftEmpty, form-level status). They do NOT share implementation; extract when a third scope joins (Session 7c).
- **Three-variant discriminated union.** `JournalEntry` now carries `trade` | `session` | `strategy` variants. Consumers narrow on `scope` before accessing variant fields. Repo methods return narrowed variant types (e.g., `findStrategyById: Promise<StrategyJournalEntry | null>`).
- **Wallet-agnostic strategy routes.** Strategies live at `/strategies` (list) + `/s/:id` (detail), outside the `/w/:address` tree. Same reasoning as session journals — strategies describe the trader's repertoire, not a specific wallet.
- **"+ Create" flow pattern.** List pages with a create CTA (Strategies is the first) use an inline form on the list page itself; valid submit generates a UUID, writes an empty-content row, and navigates to the detail page for immediate editing. Empty-name submits show an inline loss-tone error. Pattern ready for Session 7d tags if they get their own create flow.
- **Blank-name fallback.** UI renders the literal string `"Untitled"` when a user-authored name is blank, but storage preserves the empty string. `name.trim() === ''` is the check.
- **Trade-to-strategy link is a single nullable id.** `TradeJournalEntry.strategyId: string | null` — a UUID pointing at a `StrategyJournalEntry.id`, or null when unlinked. Widening to a `string[]` is additive and should only happen if multi-link is a real user request.
- **Pre-7d rows coerce on read.** `strategyId` may be `undefined` in IndexedDB for entries written before Session 7d. Every read path (form hydration, detail-page lookup) uses `entry.strategyId ?? null`. The row self-heals on the next upsert (schema writes `null` explicitly).
- **Orphan-id UX.** When a stored `strategyId` doesn't resolve to any current strategy row, the picker renders an additional `"— deleted strategy"` option (value = the orphan id) so the `<select>` stays in sync without a controlled-input warning. The `TradeDetail` header chip is hidden in the same case — hiding outside the editing surface is the cleaner reading signal.
- **Playwright blur on `<select>`.** `Locator.blur()` dispatches a native blur event but React's synthetic event delegation doesn't reliably fire `onBlur` handlers from it. For blur-commit tests on `<select>` elements, use `picker.press('Tab')` to move focus naturally.
- **Tags are normalized on save, lossy-forward on import.** Normalize = lowercase + trim + collapse-whitespace + truncate-to-40 + dedupe. `TagInput` normalizes per-commit; forms re-normalize the whole array on save via `normalizeTagList` (defence-in-depth); imports do NOT normalize (preserves forward-compat; first form save re-normalizes).
- **Tag vocabulary is pooled across all three journal variants.** `useAllTags` reads every journal row; any tag used on any variant suggests in any variant's form. Prevents per-scope namespace confusion.
- **Tag read surfaces are view-only in 7e.** `TagChipList` chips aren't clickable. Click-to-filter is a future concern with its own design scope.
- **Pre-7e rows coerce on read.** `tags` may be `undefined` in IndexedDB for entries written before 7e. Every read uses `entry.tags ?? []`. Row self-heals on next upsert.
- **TagInput listbox uses `onMouseDown` for selection.** Mousedown fires before blur, so clicking a suggestion commits without racing the input's blur handler.
- **Tag primitives live in `@lib/ui/components/`, not `features/journal/`.** `TagInput` (chip input) and `TagChipList` (read-only chip list) are pure view components with no journal-specific domain logic. Locating in `lib/ui` lets `features/wallets` (TradeHistoryList) render tag chips on trade-history rows without violating the sibling-feature import ban.
- **`normalizeTag` lives in `@lib/tags/`, not `@domain/tags/`.** Pure string manipulation, not trade-reconstruction/metric logic. Placing in `lib/` also lets `lib/ui/components/tag-input` import it (lib → domain is forbidden).
- **Two image entity shapes** (ADR-0008). `JournalImage` (Dexie row, `blob: Blob`) lives inside `lib/storage/`; `JournalImageExported` (wire format, `dataUrl: string`) is what `domain/export` and the rest of the app see. Encoding (Blob → dataUrl) lives in `export-repo`; decoding lives in `import-repo`. Domain stays pure-synchronous because base64 encoding via `FileReader` is async I/O.
- **Cross-table side-write hook signature.** Entry hooks that pair an entry write with a side-table write (`addImage`, future `addAudio`, future `addLink`) take `(file, buildEntry: (newSideId: string) => Entry)`. The hook generates the side-table id, opens an atomic Dexie transaction across both tables, and calls `buildEntry(newId)` inside the transaction. Concurrent calls are serialized via a `pendingRef: useRef<Promise<unknown>>` so two paste-events don't race on the entry's array baseline. `useTradeJournalEntry.addImage` is the reference implementation.
- **`readLatest` before building next entry.** Form handlers that build a new entry from the current one (`commit`, `handleAddImage`, `handleRemoveImage`) `await readLatest()` (a Dexie query) before constructing the next entry — never read `hook.entry` directly. The TanStack-Query cache may be stale immediately after a recent write, and two concurrent handlers reading the same stale cache will both mint fresh UUIDs and create duplicate rows. The race window is small in real browsers but non-zero on slow systems.
- **`entry.imageIds ?? []` coercion on read.** Pre-7f Dexie rows have `imageIds === undefined`. Every read path (form draft init, gallery render, hook hydration) coerces; rows self-heal on next upsert.
- **Cascade delete in repo, not in callers.** `journalEntriesRepo.remove` deletes referenced image rows in the same transaction. No code path deletes journal entries via raw `db.journalEntries.delete(id)` — it would orphan image rows. Mirror this if a future side-table joins the journal-entries family.

---

## 16. Binary fixtures

- **Generate, don't hand-write, binary fixtures.** Inline byte arrays (PNGs, GIFs, JPEGs) are easy to mistype and tedious to verify by eye — chunk lengths, CRCs, and signature ordering are unforgiving. Generate the bytes with code (`node -e` + `zlib.deflateSync` + a CRC-32 helper) and paste the resulting array. The Session 7f plan shipped a hand-written 67-byte 1×1 PNG that was missing 3 bytes of IDAT data; the bug was masked because validation rejected on MIME *before* decoding and only surfaced when Playwright hit the decode path.

---

## 17. URL-driven UI state

- **URL search params are the source of truth for shareable, refresh-stable UI state.** Per ADR-0004, addressable state (filters, expanded-view selectors, comparison-mode selections) lives in the URL via `useSearchParams`; non-addressable state (drawer open/closed, hover state) lives in Zustand or component-local `useState`. `WalletView` filter state is the canonical reference.
- **Live-apply via `replace: true`.** `setSearchParams(next, { replace: true })` on every control change avoids polluting browser history with one entry per chip-X-click. Push-mode (filter-undo via back-button) is opt-in and not the default.
- **Garbage params self-heal.** URL parsers are written via Zod `safeParse` per-dimension and silently fall back to defaults — never throw, never show an error UI. URLs are typed by humans, copied/pasted, and survive across app versions; resilience is the right default.
- **Serialize only non-defaults.** Default state produces an empty `URLSearchParams`. This keeps clean URLs for the common case and means "no filter" and "default filter" are observably the same thing.
- **Custom wins on conflict.** When two encodings of the same dimension are present (e.g., both `range` and `from`/`to`), the more specific encoding wins. Document the rule in each consumer.
- **Types that cross into `lib/validation` live in `entities/`.** A URL-state type used by both the parser (`lib/validation`) and the consumers (`features/`, `app/`, `domain/`) must live in `entities/` — `lib → domain` is forbidden by the boundaries rule. `src/entities/filter-state.ts` is the reference. The matching `domain/filters/filterState.ts` re-exports the types for the existing call-sites (entities is the canonical home; domain is the helper module).
- **Inline narrowing for discriminated unions.** TypeScript can't narrow a discriminated union through a separate boolean variable. Write `state.dateRange.kind === 'custom' ? state.dateRange.from : ''` inline at each access site — not `const isCustom = state.dateRange.kind === 'custom'; const from = isCustom ? state.dateRange.from : ''`.
