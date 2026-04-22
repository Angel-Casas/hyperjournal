# Phase 1 Session 5 — Analytics-side polish (design spec)

- **Date:** 2026-04-22
- **Status:** Draft — awaiting user review
- **Author:** Claude (Opus 4.7)
- **Follow-up:** Implementation plan generated via `superpowers:writing-plans` after this spec is approved.

---

## Goal

Turn `/w/:address` from "charts render" into "shipped product." The existing analytics surface (metrics grid + equity curve + P/L calendar + trade history) gets the polish pass it needs to feel installable, accessible, and trustworthy on desktop. Mobile is deliberately out of scope — "don't regress" only — and scheduled for a dedicated session.

This session does **not** add journaling, export/import, Playwright E2E, or a filter panel. Those are Session 6+.

## Why now

- Phase 1 deliverables (`docs/plan.md` §20) include "responsive design baseline"; v1 acceptance (§24 #7, #8) names desktop + mobile comfort and a trustworthy feel. Those are unaddressed after Session 4b.
- `CLAUDE.md` §3.10 is a non-negotiable rule on accessibility and reduced-motion.
- Session 1 shipped placeholder PWA icons that never got replaced, so `manifest.icons` is effectively empty and the app is not installable.
- Several small polish items accumulated in BACKLOG and collectively erode trust (raw error copy, missing refresh, profit-factor ∞ rendering, 1MB bundle dominated by ECharts).

## Non-goals (explicit)

1. Mobile polish — we make a non-regression pass and document gaps.
2. Journaling surfaces — Session 7+.
3. Export / import — Session 6.
4. Persisted `initialData` in TanStack Query — the `queryFn` cache-through already saves the network roundtrip; the remaining "Loading fills…" flash is a real but minor gap.
5. Playwright E2E smoke — ready to land but scoped to Session 6 with export/import.
6. Filter panel / per-coin breakdown / log-scale heatmap — Phase 2.

---

## Scope

### Lane 1 — Responsive baseline (desktop-first, mobile non-regression)

**What:**

- Verify `/` and `/w/:address` at viewports 1280, 1440, 1920. Apply small fixes where they are small.
- Spot-check 768 (tablet) and 375 (mobile). The app must not overlap, clip off-screen, or trap the user. Polish (e.g., a collapsible side sheet, horizontal scroll treatment for the trade history) is explicitly deferred.
- File a concrete **"mobile polish session" BACKLOG entry** listing every gap identified so the future session can start without re-discovery.

**Why this depth:** The user works primarily on desktop today. A non-regression gate plus a documented gap list is the right trade — shipping a half-done mobile experience costs more trust than explicitly deferring it.

### Lane 2 — PWA install verification

**What:**

- Generate placeholder icons: `192.png`, `512.png`, `maskable-192.png`, `maskable-512.png`. Authored from a single SVG source in `public/icons/` using the HyperJournal palette (bg-base background, accent glyph — simple "HJ" monogram).
- Populate the `vite-plugin-pwa` manifest `icons` array (currently empty per SESSION_LOG Session 1).
- Ensure `apple-touch-icon` link in `index.html` for iOS Add-to-Home-Screen.
- Manual verification: Chrome desktop install prompt, Lighthouse PWA installability audit.
- No attempt at 100/100 Lighthouse score — only installability gate.

**Why placeholder, not designed:** The user agreed to placeholder in brainstorming. Real iconography is a Phase 5 polish concern; the manifest validation blocker is what matters today.

### Lane 3 — Accessibility pass (medium)

**What:**

- Run axe DevTools on `/` and `/w/:address`. Fix findings in priority order (serious → moderate → minor). Document remaining known gaps in BACKLOG.
- Ensure `:focus-visible` ring on all interactive elements: `Button`, `Input`, any clickable `MetricCard`, calendar cells if interactive. Must use the design-token outline colour.
- Verify the `<section aria-labelledby>` + `<h2 id>` landmark pattern is applied to the five sections on `/w/:address` (metrics grid, equity curve, calendar, trade history, header chip). Fix missing ones.
- **PnL calendar screen-reader fallback.** The canvas is `aria-hidden`, so today screen readers miss the calendar entirely. Add a sibling `<table class="sr-only">` with columns `date / pnl / trade count`, populated from the same `buildPnlCalendar` output. Decision: table semantics match the data shape, `sr-only` scales, and the alternatives (description list, per-cell buttons) have worse structural fit.
- Contrast check: loss-token text against `bg-base` and `bg-raised`, both large-value and small-subtext sizes. If failing WCAG AA, adjust the HSL token value — the adjustment must preserve the visual distinction from the gain token.
- Keyboard-trap sweep: tab from `/` through the paste flow to `/w/:address` and back. No invisible focus, no dead-end focus stop.

**Why medium:** Light sweep (~30 min) leaves real gaps the user can't verify alone; deep WCAG audit (several hours) overruns the session. Medium — axe + manual keyboard + contrast check — is the sweet spot for a single-developer project that needs to feel trustworthy.

### Lane 4 — Error UX + refresh button

**What:**

- Error copy mapping in `WalletView`, replacing today's raw `Error.message`:
  - `HyperliquidApiError` with status in 400–499 → "That wallet has no Hyperliquid history yet, or Hyperliquid doesn't recognize the address."
  - `HyperliquidApiError` with status ≥ 500 or network failure → "Couldn't reach Hyperliquid. Check your connection and try again."
  - `ZodError` → "Hyperliquid returned data HyperJournal doesn't yet understand. Please report this." (bug signal — surface it without masking.)
  - Unknown → "Something went wrong. Try refreshing."
- "Try again" button on every error state, wired to `fills.refetch()`.
- **Refresh** icon button in the top-right of `/w/:address`, adjacent to the wallet-address chip. Behavior: calls `fillsCacheRepo.invalidate(address)` then `fills.refetch()`. Shows a spinning icon during the fetch, disabled during the fetch, returns to idle when done.

**Why no persisted `initialData`:** Deferred with justification in BACKLOG. Two viable approaches (sync Dexie read via `placeholderData` vs `persistQueryClient` adding a dep) deserve an ADR. Until then, the existing cache-through in `queryFn` already saves the roundtrip.

### Lane 5 — Analytics stragglers

**What:**

- **`TradeStats.breakEvenCount`**: add to the type + computeTradeStats; render as subtext on the existing "Total Trades" metric card. Not a new card — avoids grid crowding.
- **Profit factor ∞**: when `totalLossAmount === 0 && totalWinAmount > 0`, render `∞` as the value with subtext "no losing trades" instead of em-dash. Other zero cases (no trades at all, no wins) continue to render `—`.
- **ECharts bundle trim**: migrate from `import * as echarts from 'echarts'` (full library) to `echarts/core` with explicitly-registered parts (`LineChart`, `HeatmapChart`, `CalendarComponent`, `TooltipComponent`, `GridComponent`, `CanvasRenderer`). Measure bundle before and after; target 400–600 KB gzipped saved. Record delta in SESSION_LOG.

**Why these three together:** All three are small, independent, mechanical, and all three touch either `computeTradeStats` or chart files that are modified in the earlier lanes anyway.

---

## Test strategy

- **Unit:** `computeTradeStats.test` grows two cases — break-even count against a fixture that includes exact-zero PnL trades; profit-factor-∞ branch against a wins-only fixture.
- **Component:** `WalletView.test` grows one case per mapped error type (mock fetch to produce 4xx, 5xx, ZodError). `WalletView.test` also verifies refresh-button click invalidates the cache and triggers refetch.
- **A11y:** axe DevTools is a manual tool; findings and fixes are documented in the session log. Not part of the Vitest loop.
- **Bundle trim:** verification is a before/after `pnpm build` size measurement, recorded in SESSION_LOG. Not a Vitest assertion.
- **PWA install:** manual — Chrome install prompt appearing on `pnpm preview`, Lighthouse installability check passing.
- **Responsive non-regression:** manual at each target viewport, with identified gaps going to BACKLOG.

## BACKLOG entries to file as part of this session

1. **Mobile polish session** — listed gaps at 768 / 375 captured from Lane 1's spot-check.
2. **Persisted `initialData` for `useUserFills`** — two approaches sketched (sync Dexie + `placeholderData`; `persistQueryClient` + async-storage-persister). Needs an ADR on which to pick.
3. **Real PWA icons (Phase 5 polish)** — replace the generated placeholders with designed iconography once the visual direction is settled.
4. **Color token adjustment fallout** — if Lane 3 adjusts loss/gain HSL values for contrast, verify the equity-curve shading, calendar heatmap interpolation, and MetricCard tones still read correctly. Deferred only if the adjustment proves non-trivial.

## Acceptance criteria for Session 5 end-of-day

1. `/w/:address` and `/` render cleanly at 1280, 1440, 1920. No visual regression at 768 / 375 (elements visible, no overlap, no clipping).
2. `pnpm build` produces a manifest with four icon entries. `pnpm preview` offers the Chrome desktop install prompt. Lighthouse installability check passes.
3. axe DevTools reports no serious or moderate issues on `/` or `/w/:address`. Keyboard tab order is trap-free. `:focus-visible` rings visible on every interactive element. PnL calendar has a screen-reader-accessible data fallback.
4. Every error path on `/w/:address` shows human copy plus a "Try again" button. A refresh button next to the wallet chip invalidates cache and refetches.
5. `TradeStats.breakEvenCount` is computed and surfaced; profit factor renders `∞` for wins-only wallets.
6. `pnpm build` bundle size is measurably smaller than the Session 4b baseline (target: ≥ 400 KB gzipped saved). Delta recorded in SESSION_LOG.
7. All three gauntlet commands pass: `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage`, `pnpm build`. Coverage on `src/domain/**` remains at or above 90%.
8. SESSION_LOG.md has an entry. BACKLOG.md has the four new entries above. CONVENTIONS.md updated if any new pattern emerged (likely: the sr-only-table-alongside-canvas pattern for chart a11y).

## Open questions

None at spec time. Implementation-level questions (exact axe findings, exact contrast HSL adjustments, exact pre/post bundle size) are discovery during the session, not design questions.

---

## Appendix — known ambiguities worth flagging to the implementer

- The wallet-address chip header in the top-right of `/w/:address` does not yet exist as a distinct component (Session 4b's `WalletView` renders section headings but not a persistent header chip). The refresh button's placement implies we need a header region. The implementation plan should either (a) build a small `WalletHeader` component, or (b) attach the refresh button to the top metric card. I lean toward (a) — a header region is a natural home for the wallet switcher too, which Session 6 will need.
- The PnL calendar fallback table lives in the DOM but not visually. Placement: inside the same `<section>` as the chart, directly after the aria-hidden canvas, with the `sr-only` Tailwind utility. Use semantic `<thead>` / `<tbody>` so screen readers announce headers.
- "Break-even trade" is defined as `realizedPnl === 0` on a closed trade. Exact-zero edge case: if HL ever emits `closedPnl: "0.0"` it coerces to 0 through `NumericString`, so the existing pipeline already handles it — no special casing.
