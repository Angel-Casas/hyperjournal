# Backlog

Deferred items, known issues, and tech debt. This is the parking lot — things that are real but not for the current session.

When you notice something that would be a distraction to fix now, put it here with a short note on why it matters and roughly when it should be addressed. When you complete an item, delete it (the SESSION_LOG entry for that session preserves the history).

## How to use this file

- Prefer over-recording: if you're unsure whether something belongs here, add it.
- One-liner per item is fine. Longer items get a short paragraph.
- Tag urgency with `[now]`, `[soon]`, `[later]`, or `[maybe]`.
- If an item grows into a real design question, promote it to an ADR in `DECISIONS.md`.

---

## Known risks (from `docs/plan.md` §26)

These are not tasks; they are ongoing risks to keep in mind when working on related areas.

- **Trade reconstruction complexity** — Hyperliquid fills may be ambiguous about entry/exit intent. Always expose uncertainty.
- **Inference quality** — Stop-loss and exit-style classification will often be weak. Default to `unknown` rather than a confident guess.
- **AI trust boundary** — The moment data is sent to NanoGPT, it leaves the local-only privacy boundary. The user must know every time.
- **Frontend-only limitations** — No server-side secret protection, no cross-device sync, no shared API key model.
- **Scope creep** — The plan is intentionally rich. v1 must stay disciplined; nice ideas go here, not into the current branch.

---

## Later-phase reminders (from `docs/plan.md` §20)

Items explicitly deferred by the phasing plan. Listed here only as a reminder that they are intentional deferrals, not oversights.

- `[later]` Wallet comparison mode (Phase 2+).
- `[later]` AI coaching integration via NanoGPT (Phase 4).
- `[later]` Advanced quant overlays / correlation analysis (post-Phase 5).
- `[later]` Creator-ready polish pass (Phase 5).

---

## Session 1 deferrals

- `[soon]` Replace placeholder PWA icons at `public/icons/icon-192.svg` and `public/icons/icon-512.svg` with proper 192/512 PNGs (and maskable variants). The `vite-plugin-pwa` manifest `icons` array is currently empty; wire up once real assets exist. Landed in Session 5 polish.
- `[soon]` Configure Playwright + one E2E smoke test. Deferred from Session 1 because no real user flow exists yet; revisit in Session 4 once analytics-expanded has a click-through path.
- `[soon]` shadcn/ui init and Button/Card registration. Deferred to Session 2 — installing shadcn primitives is low value until the wallet input actually needs them.
- `[later]` Enable GitHub Pages manually in repo settings after first push: Settings → Pages → Source: GitHub Actions. Cannot be automated.
- `[maybe]` Consider a `useReducedMotion()` hook wrapper for Framer Motion so every animation honors `prefers-reduced-motion` at the component level in addition to the global CSS override. Decide after the first real animation lands.
- `[maybe]` When ESLint 9 becomes unavoidable, migrate `.eslintrc.cjs` to flat config (`eslint.config.js`). Track `eslint-plugin-boundaries` flat-config support before doing this. Referenced in ADR-0005.
- `[maybe]` Write an ADR recording the pnpm major version bump (9 → 10) if anything surprising ever surfaces. For now the SESSION_LOG and `packageManager` field are the only records.
- `[soon]` Session 2 should create `tests/fixtures/` (with a `.gitkeep`) as its first commit — CONVENTIONS.md §8 forward-references it.
