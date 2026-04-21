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
- `[soon]` Filter panel on `/w/:address` (date range, asset, side, closed-vs-open). Plan §11.5. Filters compose by pre-filtering `trades` before `computeTradeStats`. Landed after Session 4b so the chart filters apply consistently.
- `[maybe]` Persisted `WalletAnalyticsSnapshot` in Dexie (plan §13). Today `useWalletMetrics` recomputes on every mount; that's cheap for 2000 fills but would matter if we ever fetch more history. Revisit when performance shows it's needed.
- `[soon]` Break-even trades (`realizedPnl === 0`) are currently excluded from both winners and losers in `computeTradeStats`. That's standard practice but worth surfacing to users — consider a `breakEvenCount` field on `TradeStats`.
- `[maybe]` "Profit factor is null" UX — a card that says `—` for profit factor can be confusing when all trades are wins (there IS a meaningful answer: infinity). Consider rendering `∞` instead, or a subtext like `"no losing trades"`.
