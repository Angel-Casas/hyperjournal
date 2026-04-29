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

- `[soon]` Configure Playwright + one E2E smoke test. Deferred from Session 1 because no real user flow exists yet; the wallet-paste → /w/:address flow landed in Session 2b so it's ready to cover. Add in Session 4 or earlier if flake surfaces.
- `[maybe]` Consider a `useReducedMotion()` hook wrapper for Framer Motion so every animation honors `prefers-reduced-motion` at the component level in addition to the global CSS override. Decide after the first real animation lands.
- `[maybe]` When ESLint 9 becomes unavoidable, migrate `.eslintrc.cjs` to flat config (`eslint.config.js`). Track `eslint-plugin-boundaries` flat-config support before doing this. Referenced in ADR-0005.
- `[maybe]` Write an ADR recording the pnpm major version bump (9 → 10) if anything surprising ever surfaces. For now the SESSION_LOG and `packageManager` field are the only records.

---

## Session 2a deferrals

- `[soon]` When `ClearinghouseState` is first consumed by a lower layer (likely a domain function in Session 3 that derives account-health metrics), promote it to an entity in `src/entities/` and mirror the `_schemaCheck` pattern used for `RawFill`. Until then, `ClearinghouseState` stays as a `lib/validation` type (documented in CONVENTIONS.md §7).
- `[maybe]` If `postInfo<T>`'s `z.ZodType<T, z.ZodTypeDef, unknown>` signature is reused in other clients (NanoGPT in Phase 4), extract a type alias — see ADR-0006's third alternative.

---

## Session 2b deferrals

- `[soon]` Cached fills read-through on reload is implemented via Dexie, but the UI still shows "Loading fills…" briefly on refresh while TanStack Query reruns the `queryFn`. The `queryFn` returns instantly from Dexie if fresh, so the flash is minimal — but Session 5 polish should add a persisted `initialData` path so the UI renders with cached data before the query even runs.
- `[soon]` Add a manual "Refresh" button on `/w/:address` that calls `fillsCacheRepo.invalidate(address)` and triggers `fills.refetch()`. Currently the user has to wait for the 5-minute TTL to expire to see new fills.
- `[soon]` Error states on `/w/:address` show the raw `Error.message` (ZodError JSON, HL status codes). Good for development, rough for users — Session 5 polish should translate to human copy.
- `[maybe]` Wallet labels (currently always `null`) would be a small quality-of-life feature. Add a rename affordance to each saved wallet row. Low priority.
- `[soon]` Export / import of Dexie data — critical for the "local-first backup" story. Session 5.
- `[maybe]` EIP-55 checksum validation would catch typos that happen to be valid hex. Add an `isChecksumValid` domain function if/when user feedback suggests typos are a problem.

---

## Session 3 deferrals

- `[soon]` Support `dir: "Liquidation"` (and any other non-{Open,Close}×{Long,Short} values HL may emit). Today the reconstruction throws on unknown dir. The real fixture did not exercise this but production wallets that got liquidated will. Likely treatment: liquidations are closes with an `isLiquidation` flag on the leg.
- `[soon]` Support single-fill flips (oversized close that crosses zero). HL appears to split flips across two fills in practice, but the algorithm throws on this for safety. Confirm with wider fixtures before relaxing.
- `[soon]` Mid-stream dangling closes currently throw. They may actually occur if two separate open→close cycles happen so close together that our state reset races — investigate if seen in production.
- `[maybe]` Surface the "dropped leading-truncation fill" case visibly to the user. Today those fills are silently dropped; the PnL oracle filter makes the numbers self-consistent, but a user viewing the trade list would never see those closes' PnL. For accuracy, aggregate "truncated history prior to window" as a phantom trade per coin with `status: 'closed'`, `openedSize: null`, and the sum of dropped closes' PnL.
- `[maybe]` Attribute funding payments to individual trades. Currently `realizedPnl` excludes funding (it's on `userFunding`, not `userFills`). Session 4's per-trade display may want funding folded in; decide when that UX lands.
- `[maybe]` Scale-in/scale-out pattern labels on `ReconstructedTrade` (`wasScaledIn: boolean`, `wasScaledOut: boolean`). Useful for pattern detection in later phases.
- `[soon]` `wallet` field on `ReconstructedTrade` is always `null` — the pure domain layer doesn't know the wallet. Session 4's query hook should pass the wallet in as a parameter to `reconstructTrades` and stamp it on every emitted trade.
- `[maybe]` `provenance: 'observed'` is a single field on the whole `ReconstructedTrade`, but its fields have mixed provenance: `legs[].fill.*` are observed while `avgEntryPx` / `holdTimeMs` / `realizedPnl` are derived. Session 4's tooltip copy will need to distinguish per-field. Consider either a per-field provenance map or changing the trade-level label to `'derived'` when the UI consumes it.

---

## Session 4a deferrals

- `[later]` Tier-2 metrics (Sharpe-like, Kelly, risk of ruin, stop-loss usage rate). Roadmap §19.2. Held for a later analytics session once Tier-1 is in real use and we have a feel for which secondary metrics matter.
- `[soon]` Per-coin breakdown of `TradeStats`. Right now stats are walletwide; users will likely want "show BTC-only metrics" as a filter. Add a `computeTradeStatsByCoin(trades): Map<coin, TradeStats>` helper.
- `[maybe]` Persisted `WalletAnalyticsSnapshot` in Dexie (plan §13). Today `useWalletMetrics` recomputes on every mount; that's cheap for 2000 fills but would matter if we ever fetch more history. Revisit when performance shows it's needed.
- `[soon]` Break-even trades (`realizedPnl === 0`) are currently excluded from both winners and losers in `computeTradeStats`. That's standard practice but worth surfacing to users — consider a `breakEvenCount` field on `TradeStats`.
- `[maybe]` "Profit factor is null" UX — a card that says `—` for profit factor can be confusing when all trades are wins (there IS a meaningful answer: infinity). Consider rendering `∞` instead, or a subtext like `"no losing trades"`.

---

## Session 4a.1 — real-wallet reconstruction fixes

Issues surfaced only against the live full-wallet dataset (not the 100-fill committed fixture), fixed as a hotfix commit during the same session:

- `[later]` Surface spot-trade data in a separate view. Today HyperJournal filters out HL's spot fills (`coin: @N`, `dir: Buy|Sell`) from the perp reconstruction pipeline because the accounting model is fundamentally different. A user who also does spot will see nothing for those coins. A future session could add a `domain/spot/` module if demand emerges.
- `[soon]` Add `isForceClose: boolean` (or a more specific `closeReason: 'user' | 'auto-deleveraging' | 'liquidation'` tag) on `TradeLeg` so the UI can visually distinguish forced closes. Currently an ADL'd trade looks identical to a user-closed one on the metrics grid.
- `[maybe]` The `checkRealizedPnl` oracle's close-role detection (`fill.dir === 'Close Long' || 'Close Short' || 'Auto-Deleveraging' || 'Liquidation'`) is duplicated in both `reconstructCoinTrades.dirToRole` and the oracle. Extract an `isCloseRoleDir(dir)` helper if more dir values surface.

---

## Session 4b deferrals

- `[soon]` Playwright E2E smoke covering the full `/w/:address` flow: paste wallet → metrics grid renders → equity curve tooltip shows real values → calendar cell hover → history list scrolls. The browser-specific behavior (virtualizer window, ECharts real render) is not unit-testable.
- `[maybe]` Local-timezone mode for the P/L calendar. Today buckets are UTC (consistent across viewers); user might prefer local. A UI toggle + `buildPnlCalendar(trades, { timezone })` would cover it.
- `[maybe]` Equity-curve benchmarks (e.g., overlay a "100% HYPE hodl" line, or "BTC price × initial equity") to contextualize performance. Plan §19 hints at this under Tier-3.
- `[maybe]` Export-chart-as-PNG via ECharts' `getDataURL()`. Useful for sharing; plan §2.1 mentions shareability as a secondary goal.
- `[maybe]` Click on a calendar day → filter trade-history list to that day. Needs a shared "active filter" state (Zustand or route param). Tie to the BACKLOG filter-panel entry.
- `[maybe]` Equity curve on very long histories may be dense. Consider downsampling (LTTB or naïve bucketing) when points > 2000.
- `[soon]` Log-scale color interpolation for the P/L calendar heatmap. Today it's linear — small $5 days barely tint against the neutral baseline on a wallet with $500 outlier days. Session 4b's plan called for `log(|pnl|)` scaling; deferred for implementation simplicity.
- `[maybe]` Proper `prefers-reduced-motion` awareness in ECharts options. Today `animation: false` is unconditional for both chart components. A `matchMedia('(prefers-reduced-motion: reduce)')` read inside the useMemo would enable animation by default and honor the user preference. Low priority until motion design lands.

---

## Session 5 deferrals

- `[soon]` Mobile polish session. Session 5 confirmed the desktop viewports are clean and that mobile/tablet breakpoints *change* without breaking, but did not deep-dive on gaps. A future focused session should: audit 320–480 px viewports, consider a collapsible side sheet for filters (when they land), make calendar cells touch-friendly (today ~16 px, too small for taps), and decide whether trade-history columns card-stack below `md` instead of horizontal-scrolling. Trigger-point: next time the app is used on a phone.
- `[soon]` Persisted TanStack Query `initialData` for `useUserFills`. Two viable approaches: (a) synchronous Dexie cache read returning `placeholderData` (no new dep, but Dexie is async, so this needs an IndexedDB-direct synchronous shim — not idiomatic and arguably fragile); (b) `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister` (~3 KB, idiomatic, two new deps → requires an ADR). The "Loading fills…" flash on refresh is minor but real. ADR required before picking.
- `[later]` Real designed PWA icons. Session 5 ships SVG placeholders for icon-{192,512} and maskable-{192,512}. Phase 5 polish should replace them with designed iconography. Also add PNG fallbacks for iOS older versions that don't render SVG apple-touch-icon.
- `[maybe]` Consider using `role="grid"` instead of `role="table"` on `TradeHistoryList` if keyboard-grid navigation (arrow-key between cells, Home/End, PageUp/PageDown) becomes a feature. For now `role="table"` is correct since the list is read-only and not cell-navigable.

---

## Session 6 deferrals

- `[maybe]` Selective import. UI for per-row or per-table selection at import time (checkboxes next to the dry-run summary). Fixed-upsert covers the common case (restore into empty browser); selective becomes useful when merging two partial exports.
- `[soon]` Encryption-at-rest for exports. AES-GCM with a user-supplied passphrase. Required once API keys enter the format (Phase 4); until then, nothing in the export is secret.
- `[later]` Cloud sync. Post-v1; would need a server, which contradicts the local-first premise. Probably deprecated as an option entirely.
- `[maybe]` Migration path for `formatVersion > 1`. Design when v2 is actually proposed, not preemptively. Today a newer-version file is rejected loudly.
- `[soon]` CI gate on Playwright. `.github/workflows/deploy.yml` should run `test:e2e` before deploying. Requires (a) stable local test run (achieved), (b) decision on chromium install in CI (cache the binary or install every run), (c) whether `fullyParallel: true` + `workers: 1` in CI is the right throttle.
- `[maybe]` Switch Playwright `webServer` to `pnpm preview` if the dev-server proves flaky. Preview matches production output (minified, service worker) but boots slower.
- `[maybe]` Export-file compression (gzip). A full fillsCache export for an active wallet is ~500 KB → ~100 KB gzipped. `CompressionStream` is available in all target browsers. Trivial win if users start exporting cache regularly.
- `[maybe]` Factor the jsdom Blob/URL stubs from `ExportPanel.test.tsx` into `src/tests/setup.ts` if another component grows a Blob-download UI.

---

## Session 7a deferrals

- `[next]` Session/day journal scope — Session 7b. Extends `JournalEntry.scope` to include `'session'`. Keyed by date (YYYY-MM-DD) rather than tradeId. Fields per plan §11.8 Section B: market conditions, mindset, discipline score, mistakes, summary, what to repeat, what to avoid.
- `[next]` Strategy/setup journal scope + tags — Session 7c. Extends `JournalEntry.scope` to include `'strategy'`. Introduces a cross-cutting `tags` concept for linking trades to strategy names.
- `[next]` Screenshots/images for journal entries — Session 7d. Its own design: IndexedDB blob storage, thumbnail generation, quota handling. Fields per plan §11.8.
- `[maybe]` Edit history / versioning of journal entries. An append-only `journalEntryVersions` table keyed by `(entryId, updatedAt)` — every save creates a version row. "View history" drawer on the detail page.
- `[maybe]` Filter trade history by "has notes" / "no notes". Ties into the Phase 2 filter panel; low value before that lands.
- `[maybe]` Selective import of journal entries. Per-entry checkboxes in the ImportPanel dry-run summary. Useful for merging two partial exports without pulling in unwanted entries.
- `[later]` NanoGPT prompt generation from journal entries — Phase 4. Journal content is rich prompt material for AI review summaries.
- `[maybe]` Per-field save status on `TradeJournalForm`. Current form-level status may feel too coarse when the user has typed in multiple fields and only one save fails. Revisit if users report confusion.
- `[maybe]` Multi-entry per trade. Some journaling workflows treat notes as a log ("entry at 9:01 AM", "entry at 11:15 AM"). Extend from `findByTradeId` returning one entry to returning an array. Not useful until multiple users ask.
- `[maybe]` Unsaved-changes warning on navigation. `useBlocker` or `beforeunload` handler when the form status is `dirty`. Current behavior: blur-on-click-of-Link often doesn't fire before navigation, so the in-progress field's edit is lost.
- `[maybe]` Multi-tab editing conflict resolution. Two tabs open on the same trade-detail page would silently overwrite each other on save. A last-writer-wins broadcast channel or just a warning.

---

## Session 7b deferrals

- `[next]` Strategy/setup journal scope + tags — Session 7c. Extends JournalEntry discriminator to `'strategy'`. Introduces the cross-cutting tags concept for linking trades/sessions to strategy names.
- `[next]` Screenshots/images — Session 7d. IndexedDB blob storage + thumbnail generation + quota handling.
- `[maybe]` Calendar-cell click navigates to /d/:date. ECharts custom click event on a calendar cell, mapping the cell's data to YYYY-MM-DD, navigating to the route. Narrow work but fiddly wiring.
- `[maybe]` Cross-wallet PnL summary on the DayDetail page. Requires a "which wallets" design — all saved wallets? Most-recent viewed? An explicit picker? Out of scope until Phase 2 filter panel is clearer.
- `[maybe]` Per-wallet session entries. Optional `walletAddress: string | null` field on SessionJournalEntry. Additive; only ship if users report wanting per-wallet day reflections.
- `[maybe]` Multi-entry per date. Morning-session + afternoon-session journaling. Extend `findByDate` to return an array; update the SessionJournalForm into a list + "New entry" CTA.
- `[maybe]` Full-history listing for session entries. JournalPanel shows last 7; a dedicated /journal/history route could show all with filters.
- `[maybe]` JournalPanel filtering by mindset / date range / has-content. Small but useful once users have tens of entries.
- `[maybe]` Local-timezone mode for session date keys. Today UTC is used across the app (calendar, session journal, export). A single toggle + corresponding `todayLocalDateString` helper would flip it.
- `[maybe]` Shared autosave-on-blur hook. TradeJournalForm and SessionJournalForm implement the same pattern independently. Extract when Session 7c adds a third form — three is the trigger for DRY.

---

## Session 7c deferrals

- `[next]` Screenshots/images — Session 7f. IndexedDB blob storage.
- `[next]` Screenshots/images — Session 7e. IndexedDB blob storage.
- `[maybe]` Strategy delete. Soft (archive) or hard with confirmation dialog. Depends on which BACKLOG item above (archive/status) lands first.
- `[maybe]` Strategy archive/status. Active / retired / paused. Filter on the list.
- `[maybe]` Per-strategy analytics on `/w/:address` (e.g., win rate of trades linked to strategy X). Unblocked after Session 7d; depends on having enough linked trades to be meaningful.
- `[maybe]` Duplicate-name warnings. Soft UX nudge when creating a strategy with an existing name.
- `[maybe]` Reorder strategies. Drag-to-reorder on `/strategies`; needs a per-row `sortKey` or an explicit ordering array.
- `[maybe]` Full-text search across strategy content. Once a user has 10+ strategies, finding "the one with invalidation below 200-day MA" by memory gets slow.
- `[maybe]` Strategy-specific templates. Preset strategies (breakout, mean-reversion, trend-follow) that the user can clone with pre-filled conditions.

---

## Session 7d deferrals

- `[next]` Tags (see above, now Session 7e).
- `[maybe]` Reverse-lookup list of "trades linked to this strategy" on `/s/:id`. Design-blocked until tags land (picker vs filter UX interacts with tag filtering). Small implementation but wants the right home.
- `[maybe]` Strategy deletion UI. Current orphan UX (graceful chip-hide + "— deleted strategy" picker option) is ready for it; need a confirmation dialog and a decision on soft-archive vs hard-delete.
- `[maybe]` `strategyIds: string[]` widening. One strategy per trade covers Phase 1; revisit if users report trades fitting multiple setups simultaneously.
- `[maybe]` UUID-format validation on `strategyId` (Zod `.uuid()`). Makes test fixtures brittle for zero gain today; wait for a real reason.
- `[maybe]` Bulk strategy-linking from the trade-history list (right-click a trade → pick strategy). Keyboard-heavy users would want it; most users won't.

---

## Session 7e deferrals

- `[maybe]` Tag filtering on list surfaces. Multi-tag AND vs OR semantics, filter-control UX (chip-strip vs dropdown vs search bar), composition with existing filters. Real design work; own session.
- `[maybe]` Tag management UI — rename, merge, archive. Phase 1 data volumes make find-and-replace practical; revisit when a user reports confused vocabulary.
- `[maybe]` `*tags` Dexie multiEntry index. Needed when tag-filter or tag-count reach enough data volume to matter.
- `[maybe]` Tag-usage counts in autocomplete dropdown ("breakout (used 7×)"). Useful past ~50 tags.
- `[maybe]` Paste-comma-separated bulk entry — `"breakout, fomc, macro"` in a single paste fans out to three chips.
- `[maybe]` Tag-color customization. Currently all chips are neutral; custom color-per-tag is product-identity work deserving its own design.
- `[maybe]` Click-outside-to-close on the `TagInput` suggestion dropdown. Blur already closes it; click-outside matters only if the dropdown needs to survive blur (it doesn't today).

---

## Session 7f deferrals

- `[next]` Inline lightbox / fullscreen modal for thumbnails. Today click-to-open opens the blob URL in a new tab. A modal would keep the user in-app and is the natural next polish step for image UX.
- `[soon]` Quota-pressure copy when fillsCache writes start failing because images compete for IndexedDB storage. Not 7f-specific but newly relevant — images are the first feature where users can plausibly hit the browser quota with normal use.
- `[soon]` Synthesized clipboard-paste E2E coverage. The `useImagePasteHandler` unit test covers the wiring; an end-to-end equivalent would catch regressions in section ref attachment / `addEventListener` registration. Blocked on a Playwright pattern that reliably populates `clipboardData` in synthetic events across Chromium versions (the constructor strips it for security in some builds).
- `[maybe]` Drag-and-drop upload affordance. Forms already `preventDefault` `dragover`/`drop` to suppress browser navigation; turning that into a drop zone is additive UX work.
- `[maybe]` Image reorder UI (drag-to-reorder thumbnails). `imageIds` is already an ordered array; UI is the only missing piece.
- `[maybe]` Auto-compression / lossless WebP re-encoding for users hitting browser quota. Rejected up-front in ADR-0008 for lossy variants because chart screenshots are detail-heavy; lossless WebP is a quota-only fallback worth doing if real users hit limits.
- `[maybe]` Per-image annotation / caption. Useful for "this is the entry candle, this is where I bailed" annotations on a chart screenshot.
- `[maybe]` ZIP-bundle export format with `JSZip`. Rejected in ADR-0008 because the JSZip dependency is significant for the ~25 MB worst-case single-file export the existing pipeline handles. Revisit only if real users hit multi-GB exports.
- `[maybe]` Boot-time orphan-image sweep — pick up `db.images` rows whose id is in no entry's `imageIds`. Tab-close mid-upload is the canonical creation path. Cheap to implement; defer until orphans become measurable.
- `[maybe]` `navigator.storage.estimate()` UI in Settings — show usage and remaining quota. Useful preventative UX before quota errors fire.
- `[maybe]` Thumbnail chips on virtualized list surfaces (TradeHistoryList, JournalPanel session rows, /strategies rows). Virtualizer's fixed row height makes layout fiddly but doable.
- `[maybe]` Saved-image preview in the ImportPanel dry-run table. Today the dry-run shows counts only; a small preview strip would help users sanity-check the import.

---

## Session 8a deferrals

- `[next]` Session 8b — the other 7 dimensions from plan §11.5: hold-duration bucket, leverage bucket, time-of-day, day-of-week, tagged strategy, stop-loss usage, trade-size range. Composes additively on `applyFilters` and `FilterState`.
- `[soon]` Calendar-cell click → `from=YYYY-MM-DD&to=YYYY-MM-DD` filter. Already in BACKLOG; unblocked now that filters land.
- `[soon]` Per-coin breakdown of `TradeStats`. Already in BACKLOG; the coin filter answers the same question but a "BTC only / ETH only / all" split-view in the metrics grid is a different UX.
- `[maybe]` Multi-coin select (`coin: string[]`). Additive widening of the type. Wait for real demand.
- `[maybe]` Saved filter presets in Dexie ("My BTC longs"). `userSettings` table extension; needs a small repo + a "Save current as…" affordance.
- `[maybe]` Filter presets shareable via short ID rather than long URL — `?preset=abc123` resolving locally. Useful when filter URLs grow.
- `[maybe]` Push-mode `setSearchParams` so browser back-button = filter undo. Opt-in via a settings toggle if users ask for it.
- `[maybe]` Filter analytics — "you most often filter to BTC + Long; want to make that your default?" Phase 5+ polish.
- `[maybe]` Hybrid filtering (some surfaces always show full activity) — explicitly rejected for 8a (uniform was chosen). Revisit only if a user surfaces that the calendar's contract feels broken.
- `[maybe]` Custom date picker primitive (replacing `<input type="date">`). Phase 5 polish; would need an ADR for the dependency choice.
- `[maybe]` Empty-result UX on charts (equity curve, calendar) — bespoke filter-aware copy is polish.
- `[maybe]` Component-level WalletView tests for the URL ↔ filter pipeline. The E2E spec covers this end-to-end; jsdom can't run the full route + virtualizer + ECharts in concert.
