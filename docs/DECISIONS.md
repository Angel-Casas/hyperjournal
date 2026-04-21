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

Deploy via GitHub Pages using `actions/deploy-pages` from a GitHub Actions workflow. The built artifact from `vite build` is published to the `gh-pages` environment. The app is served from a sub-path (`/<repo-name>/`), so `vite.base` is set accordingly at build time via an env var, and React Router uses `BrowserRouter` with `basename` matching. SPA routing on Pages is handled by committing a `public/404.html` that redirects unknown paths back to `index.html` with the original path preserved in `sessionStorage` (the standard spa-github-pages pattern).

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

Use **react-router-dom v6** with `BrowserRouter` and a `basename` tied to `import.meta.env.BASE_URL`. View-mode state (split vs expanded analytics vs expanded journal) is expressed in routes, not in Zustand. UI state that is not addressable (filter drawer open, panel hover) stays in Zustand / local state.

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
