# Phase 1 Roadmap — Foundation & Single-Wallet Analytics

> This is the session map for Phase 1 (see `docs/plan.md` §20). Each session produces working, testable software on its own. Write the detailed plan for each session immediately before starting it; do not pre-plan distant sessions.

**Target acceptance:** `docs/plan.md` §24 — a user can paste a wallet, see the split home view, expand analytics to view equity graph / P/L calendar / core metrics / trade history, save the wallet locally, and use the app on desktop and mobile.

---

## Session breakdown

### Session 1 — Scaffold, shell, design tokens, CI (detailed plan: `2026-04-21-phase1-session1-scaffold.md`)

Foundation only. No business logic beyond a single wallet-address validator used to prove the TDD loop works end-to-end.

**Deliverables:**

- Vite + React + TS strict scaffold with pnpm
- Tailwind + dark-first design tokens (gain/loss/risk/neutral)
- shadcn/ui initialized with Button + Card
- App shell: BrowserRouter, TanStack Query provider, Zustand bootstrap store, Framer Motion wrapper
- Split home view route with two empty panels and placeholder expansion interaction
- PWA scaffold (vite-plugin-pwa, manifest, 404.html SPA fallback for GH Pages)
- ESLint + Prettier + `eslint-plugin-boundaries` enforcing the §4 import rules
- Vitest + React Testing Library + Playwright green with one test each
- First pure domain function with a TDD cycle: `isValidWalletAddress`
- GitHub Actions workflow that builds and deploys to Pages

**Non-goals:** Hyperliquid API calls, Dexie schemas, ECharts, real metrics, journal UI.

---

### Session 2 — Hyperliquid ingestion + wallet lookup + Dexie persistence

**Deliverables:**

- `lib/api/hyperliquid.ts` — typed client hitting `POST api.hyperliquid.xyz/info`
- `lib/validation/hyperliquid.ts` — Zod schemas for `userFills`, `clearinghouseState`, `userFillsByTime`
- `entities/` — `Wallet`, `RawFill`, `Provenance` types
- `lib/storage/db.ts` — Dexie schema: `wallets`, `fillsCache`, `userSettings`
- `features/wallets/` — paste input, validation feedback, save/recall UI, switcher
- Anonymized fixture generation from the authorized test wallet → `tests/fixtures/`
- TanStack Query hooks wired to Dexie-backed cache
- TDD throughout `domain/` and `lib/validation/`

**Checkpoint:** user can paste the test wallet, see fills load, persist across reloads.

---

### Session 3 — Trade reconstruction engine

**Deliverables:**

- `domain/reconstruction/` — pure functions that group fills into `ReconstructedTrade`s
- Position state machine: open → add → reduce → close → flip
- `TradeLeg`, `ReconstructedTrade`, `PositionSegment` types (entities)
- Provenance labels attached at every reconstructed field
- Heavy Vitest coverage with fixtures from Session 2 (real-shape data)
- Edge cases: liquidations, partial closes, flips within a single candle, fee-only fills

**Checkpoint:** reconstruction matches Hyperliquid's own reported realized PnL within a documented tolerance for the test wallet. Discrepancies surfaced as known limits.

---

### Session 4 — Analytics metrics, equity graph, P/L calendar, trade history, expanded analytics view

**Deliverables:**

- `domain/metrics/` — Tier-1 metrics (overall PnL, realized PnL, win rate, expectancy, profit factor, average win/loss, drawdown, average hold time, trade count, long/short split)
- ECharts wrapper components in `lib/charts/`
- Equity / cumulative-PnL curve
- Profit/Loss calendar (day-granular)
- Metric cards (with provenance indicators)
- Trade history list (virtualized if count warrants)
- Analytics-expanded route + transition from split home

**Checkpoint:** analytics view is usable for the test wallet with real numbers.

---

### Session 5 — Journaling stub, export/import, PWA polish, a11y, responsive baseline

**Deliverables:**

- `features/journal/` — trade + session + strategy journal forms (text-only; screenshots defer to Phase 3 polish)
- Dexie repositories for journals, tags, mood markers
- Journal-expanded route + split-home journal panel preview
- Export/import JSON — round-trip integrity test
- PWA install flow verified, offline cache verified for cached wallet
- Reduced-motion guard on every Framer Motion animation
- Keyboard navigation + focus states through all shell surfaces
- Mobile responsive pass (≥375 px width)

**Checkpoint:** all `docs/plan.md` §24 acceptance criteria met. Phase 1 closed.

---

## Handoff invariants between sessions

Every session ends by appending to `docs/SESSION_LOG.md` with: what shipped, what was deferred, invariants assumed, gotchas for the next session. The next session reads that entry first, then this roadmap, before writing its own detailed plan.
