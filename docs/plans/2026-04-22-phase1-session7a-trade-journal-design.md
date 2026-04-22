# Phase 1 Session 7a — Trade journal foundation (design spec)

- **Date:** 2026-04-22
- **Status:** Draft — awaiting user review
- **Author:** Claude (Opus 4.7)
- **Follow-up:** Implementation plan generated via `superpowers:writing-plans` after this spec is approved.

---

## Goal

Ship the first journaling surface on HyperJournal. Trade-scoped entries stored locally in Dexie schema v2, edited on a dedicated `/w/:address/t/:tradeId` route with autosave-on-blur semantics. A pencil icon marks trades that carry notes. Export/import carries journal data so the data-loss-resilience story from Session 6 stays intact.

After this session lands, a user can journal a trade, reload the page, restart the browser, and still have their notes. That closes the door on `docs/plan.md` §24 #5 at the "trade notes" level; the session/day and strategy scopes are scheduled separately.

## Why now

- §24 #5 is the last uncovered v1-acceptance criterion. Phase 1 closes after the three journal scopes land (this session + two follow-ups).
- Session 6's export/import format was designed with Phase 3 in mind. Extending it additively here (per CONVENTIONS §13) proves that design.
- The trade-detail route (`/w/:address/t/:tradeId`) is a Phase 2 deliverable ("detailed trade views", plan §20). Adding it now earns double duty: it houses the journal form AND kicks off the trade-detail surface.

## Non-goals (explicit)

1. **Session/day journal scope.** Session 7b.
2. **Strategy/setup journal scope + tags.** Session 7c.
3. **Screenshots / image attachments.** Session 7d — its own design around IndexedDB blob storage, thumbnailing, quota handling.
4. **Edit history / versioning** of journal entries.
5. **Filter trade history by "has notes".** Filter panel is a Phase 2 deliverable; BACKLOG.
6. **Selective import of journal entries** (per-entry checkboxes in the ImportPanel summary).
7. **NanoGPT prompt generation** from journal entries. Phase 4.
8. **"What went right" / "what went wrong" as separate fields.** Folded into a single post-trade-review textarea to keep the form "lightweight enough to use regularly" (plan §11.8).

---

## Scope

### Lane 1 — Entity + Dexie schema v2

**What:**
- `src/entities/journal-entry.ts`: `JournalEntry` type.
  - `id: string` — UUID v4, generated at entry creation.
  - `scope: 'trade'` — discriminator so 7b and 7c can add `'session'` and `'strategy'` without reshaping the table. Indexed.
  - `tradeId: string` — `ReconstructedTrade.id` (format `${coin}-${tid}`, e.g. `BTC-1234567890`). Indexed.
  - `createdAt: number`, `updatedAt: number` — Unix ms.
  - `preTradeThesis: string`, `postTradeReview: string`, `lessonLearned: string` — default `''`.
  - `mood: 'calm' | 'confident' | 'anxious' | 'greedy' | 'regretful' | null` — five enum values plus unset.
  - `planFollowed: boolean | null` — tri-state: yes / no / unanswered. Unanswered is intentional; forcing a yes/no up front pushes the user toward the 50-50 answer.
  - `stopLossUsed: boolean | null` — same tri-state.
  - `provenance: 'observed'` — user-authored direct entry.

- `src/lib/storage/db.ts`: bump to schema v2. Add `journalEntries` table, primary key `id`, indexes on `tradeId`, `scope`, `updatedAt`. The existing v1 tables stay declared on `.version(1)`; v2 adds a `.version(2).stores({...})` call and an empty `.upgrade()` callback. Dexie handles additive migrations automatically on open.

- `src/lib/storage/journal-entries-repo.ts`: `JournalEntriesRepo` factory.
  - `findByTradeId(tradeId): Promise<JournalEntry | null>` — trade-scoped, so one entry per trade for now.
  - `upsert(entry): Promise<void>` — writes updatedAt = now (or a caller-supplied clock).
  - `remove(id): Promise<void>`.
  - `listAll(): Promise<ReadonlyArray<JournalEntry>>` — for export.
  - `listAllTradeIds(): Promise<Set<string>>` — for the pencil-icon query, cheap enough to read-all and dedupe.
- Fake-indexeddb tests for each method; one round-trip test that writes + reads back.

**Why one row per trade:** simpler, matches the "one journal entry per trade" UX (edits overwrite). Multi-entry per trade can be added in a later session if users want it, but every journaling product I've used treats "my notes on this trade" as a single document.

### Lane 2 — Route + TradeDetail shell + clickable history rows

**What:**
- `src/app/TradeDetail.tsx` at `/w/:address/t/:tradeId`.
  - Header: coin badge + side (long/short) tag + status (open/closed) + Settings link + Back link to `/w/:address`.
  - Trade summary card: opened / closed dates, avg entry / exit prices, opened size, realized PnL (tone-coloured), total fees, hold time. Data read by filtering `useWalletMetrics().trades.find(t => t.id === tradeId)`; redirects to `/w/:address` if the id doesn't resolve.
  - Below the summary: `<TradeJournalForm trade={trade} />`.
- `src/app/routes.tsx`: new route entry ordered `/` → `/w/:address` → `/w/:address/t/:tradeId` → `/settings`.
- `src/features/wallets/components/TradeHistoryList.tsx`:
  - Each row becomes a `<Link to={`/w/${address}/t/${trade.id}`}>`. Row semantics change from `role="row"` + bare divs to a link wrapping the row; ARIA is preserved by keeping `role="row"` on the link element and `role="cell"` on its children.
  - Focus-visible ring per CONVENTIONS §12. `TradeHistoryList` already accepts a `trades` prop but will now need the wallet address to build links — added as a prop.

**Why redirect on invalid tradeId (not 404):** the user's only way to reach this route from inside the app is clicking a row, so invalid ids typically come from stale bookmarks. `/w/:address` is a useful fallback; a 404 page is work for zero value.

### Lane 3 — Journal form + autosave-on-blur

**What:**
- `src/features/journal/components/TradeJournalForm.tsx` — six fields per Q3:
  - Three `<textarea>`s: pre-trade thesis, post-trade review, lesson learned. Labels clear; placeholder text as hints ("What was your thesis before entering this trade?").
  - Mood `<select>` — five options + `— unset`.
  - Plan followed / stop-loss used — each a radio-group tri-state (Yes / No / Unanswered), default Unanswered.
- Form-level status machine: `clean | dirty | saving | saved | error`.
  - `clean` initially when the form loads an existing entry unchanged.
  - `dirty` on any field change before blur.
  - `saving` while the upsert mutation is in flight.
  - `saved` after success; header chip shows "Saved at HH:MM" using the local clock. Reverts to `clean` semantics after rendering.
  - `error` if the upsert fails; chip shows a loss-tone message and a retry button.
- Autosave trigger: `onBlur` on every field. Before writing, check whether ANY field is non-default (truthy string OR non-null booleans OR non-null mood). If all fields are still default, skip the write — we don't create dead rows for users who navigated away without typing.
- If the entry doesn't exist yet, the UUID is generated at the moment of first save.
- `src/features/journal/hooks/useTradeJournalEntry.ts` — TanStack Query hook wrapping the repo. Query key: `['journal', 'trade', tradeId]`. Returns `{ entry, isLoading, save, remove }`.
- `src/features/journal/hooks/useJournalEntryIds.ts` — separate query, key `['journal', 'trade-ids']`. Returns `Set<string>` of tradeIds that have entries. Used by `TradeHistoryList` to decorate rows; invalidated whenever `save` or `remove` mutates.
- `src/features/journal/index.ts` — public surface exports: `TradeJournalForm`, `useTradeJournalEntry`, `useJournalEntryIds`.

**Why form-level status, not per-field:** simpler to reason about; per-field status can always be added later if the UX proves too coarse. BACKLOG.

### Lane 4 — Pencil icon on trade-history rows

**What:**
- `TradeHistoryList` consults `useJournalEntryIds()` once per render; when `set.has(trade.id)`, renders a small pencil SVG inline with the coin cell. Decorative-plus-label: `aria-label="Has journal notes"`, tooltip-like on hover.
- Icon is the standard 16×16 "pencil" glyph. Positioned after the coin text with `ml-1` and the `text-fg-muted` tone. Does NOT replace the row click behavior — the whole row is still a link to the detail route.

### Lane 5 — Export/import extension

**What:**
- `src/entities/export.ts`: `ExportData.journalEntries?: Array<JournalEntry> | undefined` — additive, so no `formatVersion` bump (per CONVENTIONS §13).
- `src/lib/validation/export.ts`: add `JournalEntrySchema`; add to `ExportDataSchema`. Update the `_schemaCheck` so schema output stays assignable to the entity.
- `src/lib/storage/export-repo.ts`: `readSnapshot()` also reads `journalEntries.toArray()`. `ExportSnapshot` entity gains `journalEntries: Array<JournalEntry>`.
- `src/lib/storage/import-repo.ts`: `applyMerge()` also upserts journal entries inside the existing transaction.
- `src/domain/export/buildExport.ts`: copy `snapshot.journalEntries` into `data.journalEntries` unconditionally when present. (No `includeJournal` toggle — journals are always user-authored and small.)
- `src/domain/export/mergeImport.ts`: upsert journal entries by `id`; incoming wins on conflict. `MergeResult.summary` gains `journalEntriesImported: number`.
- `ImportPanel.tsx` summary copy: append "and N journal entries" when `journalEntriesImported > 0`.

**Why no `includeJournal` toggle:** journal entries are user-authored content, not regenerable cache data. The reason `includeCache` exists is that the cache is re-fetchable. Journals aren't — they should always travel with the export.

---

## Data flow (end-to-end)

1. User pastes wallet → `/w/:address` (unchanged from Session 6).
2. `TradeHistoryList` mounts, `useJournalEntryIds()` resolves the tradeId set, rows with entries show the pencil icon.
3. User clicks a row → router navigates to `/w/:address/t/:tradeId`.
4. `TradeDetail` reads the trade from `useWalletMetrics().trades`, renders summary + form.
5. `TradeJournalForm` consults `useTradeJournalEntry(tradeId)` → Dexie returns the stored entry or `null`.
6. User types, blurs a field → mutation fires → Dexie upserts → TanStack Query invalidates both `['journal', 'trade', tradeId]` and `['journal', 'trade-ids']`.
7. Header chip flips to "Saved at HH:MM".
8. User navigates back → pencil icon now appears on the row (cache was invalidated).

## Test strategy

- **Unit (Vitest):**
  - `journal-entries-repo` — one test per method plus one round-trip.
  - `JournalEntrySchema` round-trip.
  - `buildExport` — 2 new cases: with journalEntries; round-trip with journalEntries.
  - `mergeImport` — 2 new cases: upserts new entries; upserts existing by id.
- **Component (RTL):**
  - `TradeJournalForm` — autosave on blur; empty-form blur does not create a row; "Saved at HH:MM" indicator; mood/tri-state rendering.
  - `TradeDetail` — renders for valid tradeId; redirects on invalid.
  - `TradeHistoryList` — pencil icon shows for trades with entries; link semantics (wallet-address-aware) navigate.
- **E2E (Playwright):** one test — paste wallet → click first trade row → type into post-trade-review → blur → reload the page → field still has the typed value. Covers Dexie persistence + route resolution + form rendering end-to-end.

## Error handling

Same CONVENTIONS §12 pattern (heading + recovery action). New surfaces:
- Dexie upsert failure on autosave — form status flips to `error`; chip shows "Couldn't save your notes. Try again?" with a Retry button next to the chip that re-runs the last mutation.
- Invalid tradeId on `/w/:address/t/:tradeId` — silent redirect to `/w/:address`. No error UI.

## Migration

Dexie schema v2 is strictly additive — no existing rows migrate. Existing clients on v1 pick up the new table on next open; new clients start at v2. `.version(1)` declaration stays in place so downgrade paths remain readable if ever needed.

## BACKLOG entries to file

1. Session/day journal scope — Session 7b.
2. Strategy/setup journal + tags — Session 7c.
3. Screenshots/images for journal entries — Session 7d (its own design).
4. Edit history / versioning.
5. Filter trade history by "has notes" / "no notes" — ties to the Phase 2 filter panel.
6. Selective import of journal entries — per-entry checkboxes in ImportPanel.
7. NanoGPT prompt generation from journal entries — Phase 4.
8. Per-field save status on `TradeJournalForm` if form-level proves too coarse.
9. Multi-entry per trade (several notes on the same trade) if users ask.

## Acceptance criteria (Session 7a end-of-day)

1. `/w/:address/t/:tradeId` route renders the trade summary card + journal form. Invalid tradeId redirects to `/w/:address`.
2. Typing in any form field and blurring persists the entry to Dexie. Reloading shows the data. Empty-form blurs do NOT create a row.
3. Trade-history rows with journal entries render a pencil icon; clicking still navigates to the detail route.
4. Export (via `/settings`) includes `journalEntries` when present; importing into a fresh browser context restores them.
5. `pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build` — all green. Domain coverage ≥ 90 %.
6. `pnpm test:e2e` — the new journal round-trip plus the two existing Session 6 specs all pass.
7. SESSION_LOG, BACKLOG, CONVENTIONS updated. CONVENTIONS gains §15 (Journaling) covering the one-entry-per-trade rule, the autosave-on-blur pattern, and the additive-schema-bump convention.

## Open questions

None at spec time.

---

## Appendix — known ambiguities worth flagging to the implementer

- **UUID generation in-browser.** Use `crypto.randomUUID()` — available in every target browser and in jsdom. Do not add a runtime dep.
- **Saved-at timestamp localization.** "HH:MM" in the user's locale via `toLocaleTimeString()` with `hour: '2-digit', minute: '2-digit'`. No timezone mode (BACKLOG for the calendar already sits on this axis).
- **TradeHistoryList link wrapping.** The existing structure uses `role="table"` + rowgroups + `role="row"` / `role="cell"` on plain divs. Replacing the outer row-div with an `<a>` element needs to preserve the role chain: `<a role="row">` is valid ARIA. Keep `role="cell"` on children. Keep the existing focus-visible ring class string.
- **`useJournalEntryIds` cache invalidation.** `useTradeJournalEntry().save` mutation must call `queryClient.invalidateQueries({ queryKey: ['journal', 'trade-ids'] })` after success so the pencil icon appears immediately on back-navigation.
- **Export-format-version stays at 1.** This is the first additive extension; CONVENTIONS §13 codified this exact case. The existing `_schemaCheck` keeps the Zod schema aligned with the extended `ExportData` entity.
- **`fillsCache` + `journalEntries` transaction.** `applyMerge` currently wraps three tables; adding `journalEntries` makes it four. Dexie supports this in one `.transaction('rw', db.wallets, db.userSettings, db.fillsCache, db.journalEntries, async () => ...)` call. Atomic import semantics preserved.
- **TradeDetail's trade lookup.** Since `useWalletMetrics` fetches fills and reconstructs per mount, the trade is derived fresh each time TradeDetail loads. Acceptable — the pipeline is cheap (~2 ms for 2000 fills per Session 3 measurements). If it turns out to be slow at much larger wallet sizes, memoize the tradeId → trade lookup.
- **Pencil icon rendering with virtualization.** `TradeHistoryList` uses `@tanstack/react-virtual`. The pencil icon per row is a single SVG element — no performance concern. Runs inside the row template, rendered only for visible rows.
