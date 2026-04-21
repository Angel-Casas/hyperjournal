# CLAUDE.md — HyperJournal

This file is the authoritative, stable rule set for any Claude (or other LLM) session working on HyperJournal. Read it fully at the start of every session. Keep it short, high-signal, and current. Deeper detail lives in `docs/`.

---

## 1. Project summary

HyperJournal is a **frontend-only, local-first Progressive Web App** for Hyperliquid perpetual/futures traders. A user pastes a Hyperliquid wallet address and the app produces a polished trading analytics dashboard, a local journaling workspace, and an optional NanoGPT-powered coaching experience (user-supplied API key). The app is **read-only**: no wallet signing, no trading execution, no backend. Every piece of user data lives in the browser.

The full product & architecture plan is in `docs/plan.md`. That document is canonical for product scope, screens, metrics, and phasing. This file is canonical for engineering rules and session protocol.

---

## 2. Tech stack (pinned)

Do not substitute alternatives without an ADR in `docs/DECISIONS.md`.

- **Core:** React, TypeScript (strict), Vite
- **Styling/UI:** Tailwind CSS, shadcn/ui (Radix primitives), Framer Motion
- **State/data:** TanStack Query (server state), Zustand (UI state), Zod (runtime validation)
- **Persistence:** IndexedDB via Dexie
- **Charts:** Apache ECharts
- **PWA:** vite-plugin-pwa (Workbox)
- **Utilities:** date-fns
- **Testing/quality:** Vitest, React Testing Library, Playwright, ESLint, Prettier

---

## 3. Non-negotiable engineering rules

1. **TypeScript strict mode.** No `any`. No `@ts-ignore` / `@ts-expect-error` without an inline comment explaining why and a linked issue.
2. **Domain logic is pure.** All trade reconstruction, metric calculation, filtering, pattern detection, and export/import transforms live in `domain/` as pure, deterministic functions. No React, no I/O, no side effects in that layer.
3. **Validate all external data with Zod.** Hyperliquid and NanoGPT responses must pass through Zod schemas before touching the rest of the app.
4. **Provenance labels are mandatory.** Every metric, field, or insight carries one of: `observed` (direct from source), `derived` (deterministic computation), `inferred` (heuristic), or `unknown`. UI must distinguish these visually. Never present inferred values as observed.
5. **Local-first.** No network calls beyond Hyperliquid public endpoints and optional NanoGPT. No telemetry. No backend. The NanoGPT key never leaves the device except when the user explicitly sends a request.
6. **Read-only.** No code path may request wallet signing permissions or submit trades.
7. **Import boundaries are enforced.** UI → domain is fine. Domain → UI is forbidden. `features/*` may not import from sibling `features/*`. `lib/*` may not import from `features/*` or `domain/*`.
8. **Tests for domain code are required.** Any change to `domain/` ships with Vitest unit tests. Coverage threshold: 90% for `domain/`.
9. **No new dependencies without an ADR.** If you reach for a library not listed in section 2, stop and write the ADR first.
10. **Respect reduced-motion and accessibility.** Motion is a feature, not a requirement — always honor `prefers-reduced-motion`.

---

## 4. Folder structure

```
app/                  bootstrapping, routes, providers, global shell
features/
  wallets/            wallet lookup, saved wallets, switching
  analytics/          analytics dashboard, charts, P/L calendar, filters
  trades/             trade history, trade detail view
  journal/            trade/session/strategy journals, tags, moods
  ai/                 NanoGPT integration, consent UI, chat
entities/             stable domain entity types (Wallet, Trade, JournalEntry, ...)
domain/               pure analytics, reconstruction, pattern detection, transforms
lib/
  api/                Hyperliquid and NanoGPT clients
  storage/            Dexie setup, migrations, repositories
  validation/         Zod schemas
  charts/             reusable ECharts config and wrappers
  ui/                 shared UI primitives not covered by shadcn
tests/                integration + E2E tests
docs/                 plan.md, DECISIONS.md, CONVENTIONS.md, SESSION_LOG.md, BACKLOG.md
```

A feature folder should contain its own `components/`, `hooks/`, `state/`, and a thin `index.ts` public surface. Internal files are not imported from outside the feature.

---

## 5. Session protocol

### Start of session (required)

1. Read this `CLAUDE.md` in full.
2. Read the most recent 3 entries in `docs/SESSION_LOG.md`.
3. Scan `docs/BACKLOG.md` for items related to today's task.
4. Check `docs/DECISIONS.md` for ADRs that touch the area you will modify.
5. If touching `domain/`, re-read the relevant sections of `docs/plan.md` (trade reconstruction: §11.3; pattern detection: §11.7; metrics: §19).

### Before any non-trivial design choice

If you are about to choose between real alternatives — a library, a data shape, a UI pattern, an algorithm — **write the ADR in `docs/DECISIONS.md` first**, then implement. This includes cases where you are implicitly overriding an existing ADR.

### Before introducing a new pattern that others will copy

Document it in `docs/CONVENTIONS.md`.

### End of session (required)

1. Append a dated entry to `docs/SESSION_LOG.md` covering: what was done, what was deferred and why, gotchas for the next session, invariants assumed.
2. Update `docs/BACKLOG.md` — add any deferred items, mark completed ones.
3. If a new reusable pattern emerged, document it in `docs/CONVENTIONS.md`.
4. If an ADR was written, set its status to Accepted (or Superseded / Rejected as appropriate).
5. Commit with a descriptive message referencing the SESSION_LOG entry.

---

## 6. Anti-patterns to refuse

Push back on the user — or your own impulses — if any of these appear:

- Business logic creeping into React components
- Fetching or caching logic outside `lib/api` and TanStack Query
- Storing user data anywhere other than Dexie (localStorage is not an escape hatch)
- "Temporary" `any` types, silent catch blocks, or `console.log` as error handling
- New top-level folders outside the structure in §4
- Duplicating a utility that already exists in `lib/` or `domain/`
- UI that shows inferred metrics without a visible provenance indicator
- Large, multi-concern sessions — prefer small, focused changes

---

## 7. Scope discipline

The product plan has five phases (see `docs/plan.md` §20). Work on the current phase only. If something belongs to a later phase, write it into `docs/BACKLOG.md` and keep moving. "Nice to have" ideas that arise mid-session belong in BACKLOG, not in the current change.

---

## 8. Pointers

- `docs/plan.md` — product scope, screens, metrics, phasing, acceptance criteria
- `docs/DECISIONS.md` — architecture decision records (ADRs)
- `docs/CONVENTIONS.md` — coding and UI conventions that have emerged
- `docs/SESSION_LOG.md` — append-only record of what each session did
- `docs/BACKLOG.md` — deferred items, known issues, tech debt

When in doubt, favor correctness and trust over cleverness or speed.
