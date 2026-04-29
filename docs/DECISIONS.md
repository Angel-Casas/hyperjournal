# Architecture Decision Records

This file is an **append-only** log of non-trivial engineering decisions made on HyperJournal. Each entry is a short ADR (Architecture Decision Record). The goal is to prevent future sessions from silently re-litigating settled choices, and to make it easy to understand _why_ the codebase looks the way it does.

## When to write an ADR

Write one whenever you are choosing between real alternatives and the choice will affect future code. Examples:

- Picking a library (or rejecting one in favor of something else).
- Defining a core data shape that will be used widely.
- Choosing an algorithm when several are reasonable.
- Setting a project-wide convention (e.g., error handling style).
- Overriding or amending an earlier ADR.

Do **not** write ADRs for trivial local choices (variable names, one-off formatting decisions). Those belong in code review or `CONVENTIONS.md`.

## Format

Copy the template below for each new entry. Keep ADRs short — 10–30 lines is typical. Never edit an existing ADR after it is Accepted; write a new one that Supersedes it.

---

## Template

```
## ADR-XXXX: <Short title>

- **Date:** YYYY-MM-DD
- **Status:** Proposed | Accepted | Superseded by ADR-YYYY | Rejected
- **Author:** <session or person>

### Context
<What problem are we solving? What forces are at play?>

### Decision
<What did we decide to do?>

### Alternatives considered
- <Option A> — rejected because ...
- <Option B> — rejected because ...

### Consequences
<What becomes easier? What becomes harder? What invariants must be upheld?>
```

---

## ADR-0001: Documentation-based memory system for LLM continuity

- **Date:** 2026-04-21
- **Status:** Accepted
- **Author:** Claude (scaffolding session)

### Context

HyperJournal is being built primarily with LLM assistance across many sessions. LLMs have no memory between sessions, which creates a risk of gradual code-quality decay, inconsistent design choices, and duplicated or contradictory work. The user explicitly raised this concern at project kickoff.

### Decision

Adopt a lightweight, file-based memory system that every session is required to read from and write to:

- `CLAUDE.md` at the project root — stable, rarely-changing rules.
- `docs/plan.md` — canonical product and architecture plan.
- `docs/DECISIONS.md` — this file; append-only ADR log.
- `docs/CONVENTIONS.md` — evolving code and UI patterns.
- `docs/SESSION_LOG.md` — append-only record of what each session did.
- `docs/BACKLOG.md` — deferred items, tech debt, known issues.

`CLAUDE.md` §5 defines a mandatory session protocol: read relevant docs at start, record decisions mid-session, log progress at end.

### Alternatives considered

- **Rely only on plan.md and code comments.** Rejected: code comments decay and don't capture cross-cutting decisions or session context.
- **External tool (e.g., a project wiki, Notion, issue tracker).** Rejected for now: adds friction, lives outside the repo, and can't be read by a Claude session without extra connectors. Revisit if the repo grows large enough that these files become unwieldy.
- **Heavier ADR process (per-file markdown, numbered subfolders).** Rejected: overkill for a single-developer project; a single append-only file is easier to scan and maintain.

### Consequences

- Easier: any future session can reconstruct context in under five minutes.
- Easier: design drift is visible because it contradicts a written ADR.
- Harder: sessions must spend discipline at start and end to read/update these files. This must be enforced by the protocol in `CLAUDE.md`.
- Invariant: `DECISIONS.md` and `SESSION_LOG.md` are append-only. Edits only fix typos or add status transitions (e.g., Accepted → Superseded).

---

<!-- New ADRs go below this line. -->

## ADR-0002: Deploy to GitHub Pages

- **Date:** 2026-04-21
- **Status:** Accepted
- **Author:** Claude (phase-1 planning session)

### Context

HyperJournal is frontend-only and statically deployable. The user prefers a zero-cost, zero-config hosting target tied to the repo itself.

### Decision

Deploy via GitHub Pages using `actions/deploy-pages` from a GitHub Actions workflow. The built artifact from `vite build` is published to the `gh-pages` environment. The app is served from a sub-path (`/<repo-name>/`), so `vite.base` is set accordingly at build time via an env var, and React Router uses the v6 data router (`createBrowserRouter`) with a `basename` matching. SPA routing on Pages is handled by committing a `public/404.html` that redirects unknown paths back to `index.html` with the original path preserved in `sessionStorage` (the standard spa-github-pages pattern).

### Alternatives considered

- **Vercel / Netlify / Cloudflare Pages** — rejected: introduce a third-party account and deploy config outside the repo. Pages is sufficient for a static PWA and keeps everything on GitHub.
- **Hash router on Pages** — rejected: produces `#/w/0x.../analytics` URLs which are ugly and worse for sharing. The 404.html fallback is well-established and costs one extra file.

### Consequences

- Easier: one-click deploys from `main`, no external dashboards.
- Harder: base path must be threaded through Vite, router, and the PWA manifest scope. Any hardcoded `/` asset path will break in production.
- Invariant: production build must be validated with the correct `BASE_URL` before any release. A build-only CI check is required.

---

## ADR-0003: pnpm as the package manager

- **Date:** 2026-04-21
- **Status:** Accepted
- **Author:** Claude (phase-1 planning session)

### Context

The project needs a single blessed package manager. The user asked for pnpm.

### Decision

Use **pnpm** for install, scripts, and CI. Commit `pnpm-lock.yaml`. Enforce via `packageManager` field in `package.json` and a root `.npmrc` with `engine-strict=true`.

### Alternatives considered

- **npm** — rejected: slower installs, looser peer-dependency resolution, no strict workspace model.
- **yarn classic (v1)** — rejected: maintenance mode. Yarn Berry works but adds PnP complexity without benefits here.

### Consequences

- Easier: strict, content-addressed node_modules reduces phantom-dep bugs.
- Harder: contributors and CI must have pnpm installed (CI uses `pnpm/action-setup`).
- Invariant: do not commit `package-lock.json` or `yarn.lock` alongside the pnpm lockfile.

---

## ADR-0004: React Router v6 with BrowserRouter for navigation

- **Date:** 2026-04-21
- **Status:** Accepted
- **Author:** Claude (phase-1 planning session)

### Context

The app has real navigation: landing, split home, analytics-expanded, journal-expanded, trade detail, AI coach, settings. Deep links to `/w/<address>/...` are desirable for sharing and refresh resilience. CLAUDE.md §2 pins a stack but does not name a router — this ADR fills the gap.

### Decision

Use **react-router-dom v6** with `createBrowserRouter` (the v6 data router API) and a `basename` tied to `import.meta.env.BASE_URL`. The legacy `<BrowserRouter>` component form would work equivalently; we use the data-router form so the route table is centrally declared and future nested routes can attach loaders/actions without refactoring the shell. View-mode state (split vs expanded analytics vs expanded journal) is expressed in routes, not in Zustand. UI state that is not addressable (filter drawer open, panel hover) stays in Zustand / local state.

### Alternatives considered

- **TanStack Router** — rejected: heavier, adds a learning curve and bundle size for a feature set we do not need in v1.
- **No router (Zustand-only view state)** — rejected: kills deep-linking, back-button semantics, and refresh resilience. Wallet addresses belong in the URL.
- **HashRouter** — rejected: see ADR-0002. `BrowserRouter` + `404.html` fallback gives clean URLs.

### Consequences

- Easier: URL is the source of truth for "where am I in the app"; wallet address deep-links trivially; browser history works.
- Harder: every new route must be added in one place and its `basename` behavior verified in production build.
- Invariant: never store `selectedWalletAddress` in Zustand — read it from route params. Zustand holds only non-addressable UI state.

---

## ADR-0005: ESLint uses legacy config with `eslint-import-resolver-typescript`

- **Date:** 2026-04-21
- **Status:** Accepted
- **Author:** Claude (phase-1 session 1 execution)

### Context

Task 5 of Phase 1 Session 1 was to enforce the CLAUDE.md §4 import boundaries via `eslint-plugin-boundaries`. Two problems surfaced during execution: (1) flat config support in boundaries 4.2.2 on ESLint 8.x is fragile; (2) with the default Node resolver, the rule only fires on _relative_ imports — aliased imports like `@features/analytics` are silently allowed because Node cannot resolve the alias to a file path, so the plugin cannot classify the target as a `feature`. Since the entire codebase deliberately uses aliases, the rule would have been near-useless as originally shipped.

### Decision

1. Use **ESLint legacy config** (`.eslintrc.cjs`) instead of flat config. All boundaries-plugin features are supported there and the config is stable.
2. Add **`eslint-import-resolver-typescript@3.6.3`** as a devDependency and register it under `settings['import/resolver'].typescript` with `alwaysTryTypes: true` and `project: './tsconfig.json'`. Boundaries then resolves `@features/*`-style aliases through the tsconfig `paths` map and classifies them correctly.

### Alternatives considered

- **Flat config (`eslint.config.js`) as originally planned** — rejected: boundaries 4.2.2 on ESLint 8.x produces hard-to-diagnose misfires under flat config; the plugin's documented examples still use legacy config.
- **Drop the alias-resolving resolver and require relative imports project-wide** — rejected: aliases exist to decouple files from their depth in the tree; forbidding them to make a lint rule work trades correctness for a worse codebase.
- **Accept the gap and rely on code review to catch aliased boundary violations** — rejected: silent lint rules are worse than no lint rules. CLAUDE.md §3 rule 7 is a non-negotiable rule, not a guideline.

### Consequences

- Easier: boundaries rule now enforces uniformly on both relative and aliased imports (verified by a probe that imports `@features/analytics` from `src/domain/` and gets `boundaries/element-types` at error level).
- Easier: legacy config keeps all tooling on a well-trodden path with established examples.
- Harder: when ESLint 9 becomes unavoidable, this config needs to be migrated to flat config. Keep the boundaries-plugin version aligned with flat-config support when that happens.
- Invariant: any new TS path alias added to `tsconfig.json` must also be visible to the resolver (it is, automatically, because the resolver reads `tsconfig.json`). Never define aliases outside `tsconfig.json`.

---

## ADR-0006: Type `z.ZodType<T, z.ZodTypeDef, unknown>` for schemas passed through generics

- **Date:** 2026-04-21
- **Status:** Accepted
- **Author:** Claude (phase-1 session 2a execution)

### Context

Session 2a's `postInfo<T>(body, schema)` helper in `src/lib/api/hyperliquid.ts` takes a Zod schema generically so both `fetchUserFills` and `fetchClearinghouseState` can share one POST + parse path. The obvious signature — `schema: z.ZodType<T>` — fails TypeScript when passed `UserFillsResponseSchema`, because `z.ZodType<T>` is shorthand for `z.ZodType<T, z.ZodTypeDef, T>`: it ties the schema's _input_ type to the output. Our schemas contain `NumericString` transforms (string → number), so the true input is `string`, not the output `number`. The default signature rejects those schemas.

Three options existed: (1) widen the schema parameter's input generic to `unknown`, (2) cast the schema at the call site with `as`, (3) stop using a generic helper and write one function per endpoint.

### Decision

Type schema parameters that pass through generic helpers as `z.ZodType<T, z.ZodTypeDef, unknown>`. Input is `unknown` (which is always true for us — the input to `postInfo` is `JSON.parse(response.text())`, typed `unknown`), output stays fully-typed `T`, and transforms are preserved end-to-end.

### Alternatives considered

- **`as` casts at call sites.** Rejected: casts hide type mismatches and defeat the point of strict Zod typing. They also spread the workaround across every caller.
- **One function per endpoint (no generic helper).** Rejected: duplicates the fetch-parse-validate pipeline in every function, which is exactly what `postInfo` exists to prevent. Four lines of boilerplate × N endpoints is a worse trade than one typed generic.
- **Add a local type alias `type AnyZod<T> = z.ZodType<T, z.ZodTypeDef, unknown>`.** Rejected _for now_: the raw form is used in exactly one place (`postInfo`). If it spreads, revisit.

### Consequences

- Easier: one generic helper handles every `/info` request type; transforms work transparently.
- Harder: the shape `z.ZodType<T, z.ZodTypeDef, unknown>` is unusual enough that future readers may attempt to "simplify" it back to `z.ZodType<T>` and re-introduce the bug. An inline comment at the helper's signature warns against this, and CONVENTIONS.md §7 documents the pattern.
- Invariant: `postInfo` stays an internal helper. Callers always go through the typed wrappers (`fetchUserFills`, `fetchClearinghouseState`) so the input-type widening is never exposed to application code.

---

## ADR-0007: Raw `echarts` + a 40-LOC React wrapper instead of `echarts-for-react`

- **Date:** 2026-04-21
- **Status:** Accepted
- **Author:** Claude (phase-1 session 4b planning)

### Context

Session 4b adds the equity curve and P/L calendar — both rendered with Apache ECharts per CLAUDE.md §2. The ecosystem offers two integration paths: `echarts-for-react` (a community wrapper ~200 LOC that owns lifecycle) or the raw `echarts` package plus a hand-written React wrapper. The entire wrapper we need is ~40 LOC: init on mount, `setOption` on prop change, `resize()` on ResizeObserver trigger, `dispose()` on unmount.

### Decision

Use the raw `echarts` package and write `src/lib/charts/EChartsBase.tsx` — a thin React wrapper that owns only the imperative lifecycle and exposes a declarative `option: EChartsOption` prop. Consumers build their own option objects (typically via `useMemo`) and pass them in. Do NOT build option objects inside the wrapper — it stays agnostic to chart type.

### Alternatives considered

- **`echarts-for-react`** — rejected: adds a dependency that does exactly what our 40 LOC does. Our wrapper is small enough that the maintenance cost is zero, and owning it gives us full control over the lifecycle (custom events, resize debouncing, etc.) without fighting a third-party abstraction.
- **`recharts` / `visx`** — rejected: CLAUDE.md §2 pins ECharts for the animation and aesthetic defaults we want. Other libraries have different defaults that would require more restyling work.

### Consequences

- Easier: no extra dependency; ECharts upgrades independently; the lifecycle is visible and easy to reason about.
- Harder: consumers MUST `useMemo` their option objects. Identical content with a new object reference triggers `setOption`, which rebuilds the chart. An inline comment in `EChartsBase` warns callers about this, and CONVENTIONS.md §11 documents the pattern.
- Invariant: `EChartsBase` never constructs or mutates option objects — that is the consumer's job. This keeps the wrapper chart-type-agnostic and the consumer's data flow pure.

---

## ADR-0008: Separate `images` Dexie table for journal blob storage

- **Date:** 2026-04-25
- **Status:** Accepted
- **Author:** Claude (phase-1 session 7f execution)

### Context

Phase 1 §11.8 calls for image attachments on journal entries. Four design forces converge: (1) where do bytes live (embedded on the entry row, or a separate table); (2) what processing happens on upload (store as-uploaded, or compress/transcode); (3) how images cross the export-format boundary while keeping `domain/export` pure-synchronous per CLAUDE.md §3 rule 2; (4) whether the export envelope's `formatVersion` must bump. Each axis has plausible alternatives, so the bundle deserves a single ADR rather than four scattered decisions.

### Decision

Adopt a four-part bundle:

1. **Two image entity shapes.** `JournalImage` (Dexie row, `blob: Blob`) inside `lib/storage/`; `JournalImageExported` (wire format, `dataUrl: string`) everywhere else. Forced because `buildExport` is pure-synchronous and base64 encoding via `FileReader` is async I/O — encoding is the export-repo's responsibility, not the domain layer's.
2. **Separate `images` Dexie table** (Dexie schema v4) keyed by id, indexed on `createdAt`. Journal entries reference by `imageIds: ReadonlyArray<string>`. Cascade delete is in the entries-repo's `remove` path — it deletes referenced image rows in the same transaction.
3. **Store as-uploaded** with a 5 MB cap and a four-MIME whitelist (PNG / JPEG / WebP / GIF). No auto-compression, no transcoding, no canvas round-trip.
4. **Base64-embed in single-file JSON export, `formatVersion` stays `1`.** New fields on the envelope (`data.journalEntries[].imageIds`, `data.images`) are additive and forward-compatible per CONVENTIONS.md §13.

### Alternatives considered

- **Embed blobs on the journal-entry row.** Rejected: every journal-table read (`useAllTags`'s scan, `useJournalTagsByTradeId`, `listAll`) would haul blob bytes through memory for no reason, and orphan cleanup becomes a "rows whose entry is gone" sweep instead of a referential check.
- **One entity shape with `blob | dataUrl` discriminator.** Rejected: pushes the encoding asymmetry into every consumer and makes type narrowing noisy. A second exported-only shape is cleaner.
- **Auto-compression to WebP/JPEG q=85 at max 1920px (or lossless WebP re-encode).** Rejected: trade-chart screenshots are detail-heavy (price labels, indicator values); lossy compression reduces legibility. Lossless re-encoding adds canvas round-tripping for modest gains.
- **ZIP-bundle export (`data.json` + `images/<id>.png`) via `JSZip`.** Rejected: keeping `buildExport` / `parseExport` / `applyMerge` intact is high-value; JSZip is a significant dependency for the ~25 MB worst-case single-file export the existing pipeline already handles. Logged in BACKLOG if multi-GB exports ever surface.
- **Bump `formatVersion` to 2.** Rejected: additive optional fields are forward-compatible. Pre-7f files parse cleanly via `.optional()` / `.default([])` on the new fields. A bump is reserved for breaking changes.

### Consequences

- Easier: all `Blob` / `FileReader` / `atob` Web-API touches are confined to `lib/storage/export-repo.ts` and `lib/storage/import-repo.ts`. `domain/export` (`buildExport`, `mergeImport`) stays pure-synchronous.
- Easier: pre-7f exports continue to parse cleanly without a migration. Pre-7f Dexie rows coerce on read (`entry.imageIds ?? []`) and self-heal on next upsert.
- Harder: the entry-hook's `addImage(file, buildEntry: (newImageId) => Entry)` signature must serialize concurrent calls (paste-multiple-images) via a `pendingRef` promise chain so two adds don't race on the `imageIds` baseline. Documented inline in the hook.
- Harder: IndexedDB quota is shared with `fillsCache`; quota-pressure UX (`navigator.storage.estimate()` surfaced in Settings) is BACKLOG.
- Invariant: every blob in `db.images` has been validated by `validateImageBlob` (MIME whitelist + size cap) before insertion. Cascade delete via `journalEntriesRepo.remove` is the only path that removes images by entry. Orphan rows can exist after a tab-close mid-upload; that is acceptable and a boot-time sweep is BACKLOG.
- Invariant: `buildExport` and `mergeImport` never see a `Blob`. Encoding (Blob → dataUrl) and decoding (dataUrl → Blob) live in `export-repo` and `import-repo` respectively.

**Spec:** `docs/superpowers/specs/2026-04-25-session-7f-screenshots-design.md`.

---

## ADR-0009: Adopt `@radix-ui/react-dialog` for the Sheet/Drawer primitive

- **Date:** 2026-04-29
- **Status:** Accepted
- **Author:** Claude (phase-2 session 8a planning)

### Context

Session 8a needs a right-side drawer for the filter panel. The project's UI primitives so far (`button`, `input`, `label`, `metric-card`, `tag-input`, `tag-chip-list`) are hand-written in shadcn style but no Radix package was installed yet. CLAUDE.md §2 lists "shadcn/ui (Radix primitives)" as the approved stack — so a Radix dep is in-stack, but it is the first one and worth recording the choice for future readers (subsequent dialogs / popovers / dropdown menus / tooltips will reuse this pattern).

### Decision

Add `@radix-ui/react-dialog` and create a `Sheet` primitive at `src/lib/ui/components/sheet.tsx` — a thin shadcn-style wrapper exporting `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetClose` over `Dialog.Root` / `Dialog.Portal` / `Dialog.Overlay` / `Dialog.Content` / `Dialog.Close`. Position is right-side on desktop and bottom on small viewports; controlled via the `side` prop. No Framer Motion in 8a — Radix's CSS data-attributes drive the open/closed state and Tailwind `transition-transform` handles the slide animation.

### Alternatives considered

- **Hand-roll a custom drawer.** Rejected: focus trap, scroll lock, escape-to-close, overlay click-out, portal mounting, and `aria-modal` semantics are 200+ LOC of fiddly accessibility work. Radix gives us all of it for free.
- **Headless UI.** Rejected: would introduce a second component-primitive ecosystem alongside the shadcn convention CLAUDE.md §2 already pins.
- **Framer Motion `AnimatePresence` for the slide.** Rejected for 8a: pure CSS transitions are sufficient and avoid coupling the primitive to Framer's animation lifecycle. Revisit if motion design wants spring physics.

### Consequences

- Easier: `Dialog`, `Popover`, `DropdownMenu`, `Tooltip` are now incremental adds (each is a new `@radix-ui/react-X` install + a thin wrapper file).
- Harder: Radix versions will need bumping over time; lockfile and peer-dep management are now part of the project's maintenance load.
- Invariant: the Sheet primitive stays presentation-only; it does not own filter state, drawer-open state, or any business logic. Consumers control `open` / `onOpenChange`.

**Spec:** `docs/superpowers/specs/2026-04-28-session-8a-filters-design.md`.

---
