# Phase 1 Session 7c — Strategy/setup journal (design spec)

- **Date:** 2026-04-22
- **Status:** Draft — awaiting user review
- **Author:** Claude (Opus 4.7)
- **Follow-up:** Implementation plan generated via `superpowers:writing-plans` after this spec is approved.

---

## Goal

Ship the strategy/setup journal scope — the third and final journal scope for plan §24 #5 completeness. `StrategyJournalEntry` joins the `JournalEntry` discriminated union. New `/strategies` list + `/s/:id` detail routes, parallel to the list+detail pattern already established for trade and session scopes. `JournalPanel` on SplitHome gets a small "Strategies →" entry point.

After this session lands, a user can maintain structured notes about their trading setups (conditions, invalidation, R:R, recurring mistakes) alongside their trade-level and session-level journals.

## Why now

- Sessions 7a + 7b proved the journaling patterns (discriminated union, autosave-on-blur, Dexie additive schema). 7c applies the same patterns to the third scope without re-inventing anything.
- Strategy entries are reference material — edit-once, consult-often — and benefit from their own surface rather than being mixed into JournalPanel's session listing.
- Plan §11.8 Section C names these fields; shipping them completes the journaling triad the product's positioning depends on.

## Non-goals (explicit)

1. **Tags.** Session 7d. Cross-cutting concern with its own design (input UX, autocomplete, normalization, cross-variant application).
2. **Screenshots / images.** Session 7e. IndexedDB blob storage + thumbnail generation.
3. **Trade → strategy linking.** A field on `TradeJournalEntry` that references a strategy id, plus the UI to pick one when editing a trade journal. Plays into Session 7d's tags design because "strategy" is a kind of tag.
4. **Strategy-filtered analytics** (e.g., "win rate of trades tagged with Strategy X" on `/w/:address`). Phase 2 pattern detection.
5. **Strategy delete.** v0 doesn't ship delete; deferred to BACKLOG.
6. **Strategy archive / active-retired status.** BACKLOG.
7. **Duplicate-name prevention.** Two strategies named "Breakout" are allowed; names are just display labels, IDs are UUID.
8. **Edit history.** Shared cross-scope BACKLOG from prior sessions.
9. **Reorder / custom ordering.** List is `updatedAt desc`.

---

## Scope

### Lane 1 — Entity: extend `JournalEntry` with `StrategyJournalEntry`

**What:**

`src/entities/journal-entry.ts` gains a third variant:

```ts
export type StrategyJournalEntry = {
  readonly id: string;                     // UUID v4
  readonly scope: 'strategy';
  readonly createdAt: number;              // Unix ms
  readonly updatedAt: number;              // Unix ms
  readonly name: string;                   // user-authored display label
  readonly conditions: string;
  readonly invalidation: string;
  readonly idealRR: string;                // free-form text: "2:1", "2-3:1", "3R min"
  readonly examples: string;
  readonly recurringMistakes: string;
  readonly notes: string;
  readonly provenance: Provenance;
};

export type JournalEntry =
  | TradeJournalEntry
  | SessionJournalEntry
  | StrategyJournalEntry;
```

No Dexie bump. The v3 schema's `scope + updatedAt` indexes cover the strategy list query (filter by scope, sort in-memory by updatedAt for the small data volume expected).

**Why free-form `idealRR`:** Traders write "2:1", "2-3:1", "3R min" interchangeably. A numeric field would force one form over the others; a free-text field lets users express their actual mental model. No math happens on this value in v0 — it's just reference text.

### Lane 2 — Repo extensions

Extend `src/lib/storage/journal-entries-repo.ts`:

```ts
export type JournalEntriesRepo = {
  // existing...
  findStrategyById(id: string): Promise<StrategyJournalEntry | null>;
  listStrategies(limit?: number): Promise<ReadonlyArray<StrategyJournalEntry>>;
};
```

- `findStrategyById(id)` — filter by `id` + narrow on scope. Return `null` if the row is the wrong scope.
- `listStrategies(limit)` — `where('scope').equals('strategy').toArray()`, sort by `updatedAt desc` in memory, slice to limit (default unbounded).
- `listAllTradeIds` stays scope-gated to trade only (already correct from 7b).

### Lane 3 — Hooks

Three hooks in `src/features/journal/hooks/`:

- `useStrategyEntry(id)` — parallel to `useSessionJournalEntry`. Read the entry by id, save + remove mutations. Mutations invalidate both `['journal', 'strategy', id]` and `['journal', 'strategies']`.

- `useStrategies(limit?)` — lists all strategies for the `/strategies` page. Query key `['journal', 'strategies', limit]`. Same stable-empty-array pattern as `useRecentSessionEntries`.

- `useCreateStrategy()` — mutation that:
  1. Generates UUID v4 via `crypto.randomUUID()`.
  2. Writes `{ id, scope: 'strategy', name, createdAt: now, updatedAt: now, ...empty content fields, provenance: 'observed' }`.
  3. Returns the new `id` for the caller to navigate to.
  4. Invalidates `['journal', 'strategies']`.

### Lane 4 — `/strategies` list page

`src/app/Strategies.tsx` at route `/strategies`:

- Header: `<h1>Strategies</h1>` + Settings link + Back link to `/`.
- Inline "+ New strategy" form: a labeled text input (`name`, required) + "Create" button. Submits on Enter. Empty name shows inline error "Give the strategy a name." Valid submit → `useCreateStrategy()` → navigates to `/s/:newId`.
- List below: rows from `useStrategies()`. Each row is a `<Link to="/s/:id">` showing:
  - Name (bold)
  - "Updated <Apr 22, 2026>" in muted color
  - Teaser (first non-empty content field's first line, truncated to 60 chars; same helper as JournalPanel's session teaser)
- Empty state: "No strategies yet. Name one above to start."

### Lane 5 — `/s/:id` detail page + `StrategyJournalForm`

Route `/s/:id` in `src/app/routes.tsx`, after `/d/:date` and before `/settings`.

`src/app/StrategyDetail.tsx`:
- Header: the strategy's `name` (read live from `useStrategyEntry`, falls back to "Untitled" if empty) + Settings + Back to `/strategies`.
- Invalid `id` (no entry found) → `<Navigate to="/strategies" replace />`.
- `<StrategyJournalForm id={id} />` below.

`src/features/journal/components/StrategyJournalForm.tsx`:
- Seven fields: `name` (text input), then six textareas in plan §11.8 order (conditions, invalidation, idealRR as short `<input type="text">`, examples, recurringMistakes, notes).
- Same autosave-on-blur pattern from 7a/7b: `draftRef`, hydration guard, `isDraftEmpty` short-circuit, form-level status machine, "Saved at HH:MM" chip.
- `isDraftEmpty` extended: returns true only when `name.trim() === ''` AND all content fields empty. Since the entry already exists (created by `useCreateStrategy`), the guard is a defense against the user clearing all fields. Save still fires on clearing because `hook.entry` exists.
- `name` is a regular field — rename is just blur-on-change.

### Lane 6 — JournalPanel entry point

Minimal rewrite of `src/features/journal/components/JournalPanel.tsx`:

Add a secondary link below the "+ Today's journal" CTA (or as a second action in the header flex):

```tsx
<Link to="/strategies" className="...">
  Strategies →
</Link>
```

No strategy listing or count inside JournalPanel. The `/strategies` route owns that surface.

### Lane 7 — Zod discriminated union

`src/lib/validation/export.ts` extends the union:

```ts
const StrategyJournalEntrySchema = z.object({
  id: z.string().min(1),
  scope: z.literal('strategy'),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  name: z.string(),
  conditions: z.string(),
  invalidation: z.string(),
  idealRR: z.string(),
  examples: z.string(),
  recurringMistakes: z.string(),
  notes: z.string(),
  provenance: z.enum(['observed', 'derived', 'inferred', 'unknown']),
});

const JournalEntrySchema = z.discriminatedUnion('scope', [
  TradeJournalEntrySchema,
  SessionJournalEntrySchema,
  StrategyJournalEntrySchema,
]);
```

No format-version bump per CONVENTIONS §13 — additive.

### Lane 8 — Playwright E2E

One new spec `e2e/strategy-journal-roundtrip.spec.ts`:

Test 1 (creation + persistence):
1. Visit `/strategies`.
2. Type "Breakout" in the new-strategy input, submit.
3. Expect URL to match `/s/<uuid>`.
4. Type into `conditions` field, blur.
5. Expect "Saved at HH:MM" chip.
6. Reload, verify field content persists.

Test 2 (list surfaces the new strategy):
1. After creation from test 1's flow (or a second create), navigate back to `/strategies`.
2. Expect the strategy's name to appear in the list.

---

## Data flow

1. User on `/` clicks "Strategies →" on JournalPanel → `/strategies`.
2. `useStrategies()` populates the list.
3. User types "Breakout" + submits → `useCreateStrategy()` writes a row → navigates to `/s/:newId`.
4. `useStrategyEntry(id)` fetches the just-created entry.
5. `StrategyJournalForm` hydrates from the entry (mostly empty, `name: 'Breakout'`).
6. User types conditions, blurs → mutation upserts → invalidates both `['journal', 'strategy', id]` and `['journal', 'strategies']`.
7. Header shows "Saved at HH:MM".
8. Back to `/strategies` → list refreshed with the new teaser from `conditions`.

## Test strategy

- **Unit (Vitest):**
  - Repo `findStrategyById`, `listStrategies` with fake-indexeddb.
  - Zod: all three variants parse; strategy entry with wrong `scope` or missing required field rejected.
- **Component (RTL):**
  - `StrategyJournalForm` autosave-on-blur, empty-form guard, name renames.
  - `Strategies` list page empty state, populated list, new-strategy form validation (empty-name error, valid submit).
  - `StrategyDetail` valid id renders; invalid id redirects.
- **E2E (Playwright):** strategy round-trip spec.

## Error handling

Same §12 pattern:
- Invalid `/s/:id` (id doesn't exist) → silent redirect to `/strategies`.
- Empty-name submit on `/strategies` → inline form error "Give the strategy a name." Recovery: type a name and resubmit.
- Dexie save failure → form status `error` chip + Retry button.

## Migration

No Dexie schema change. Existing v3 covers strategies (scope + updatedAt indexes suffice for listing).

## BACKLOG entries to file

1. **Tags + trade↔strategy linking — Session 7d.** Cross-cutting `tags: string[]` on all journal variants; trades reference strategies by id; tag input UX (chips vs freetext); autocomplete from existing tags.
2. **Screenshots/images — Session 7e.** IndexedDB blob storage.
3. **Strategy delete.** Soft-delete (archive) vs hard-delete with confirmation dialog.
4. **Strategy archive/status.** Active / retired / paused states. Filter in the list.
5. **Strategy-filtered analytics** on `/w/:address` — blocked by tags + trade↔strategy linking.
6. **Duplicate-name warnings.** Soft UX nudge when creating with an existing name.
7. **Reorder strategies.** Drag-to-reorder on `/strategies`; stored as per-strategy `sortKey` or explicit ordering array.
8. **Strategy teaser enhancements.** Icon badges for R:R, last-updated color-coding, etc.

## Acceptance criteria

1. `/strategies` list renders + accepts new strategies via inline form. Empty state shows. Duplicate names allowed.
2. `/s/:id` renders form for a valid id; invalid id redirects to `/strategies`.
3. Typing + blur on any form field (including `name`) persists the entry to Dexie. Reload preserves.
4. Export via `/settings` includes strategy entries when present; import restores them.
5. `JournalPanel` on `/` carries a "Strategies →" link.
6. `pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build` green. Domain coverage ≥ 90%.
7. `pnpm test:e2e` — new strategy round-trip + all existing specs pass.
8. SESSION_LOG, BACKLOG, CONVENTIONS updated (§15 amended).

## Open questions

None at spec time.

---

## Appendix — known ambiguities worth flagging to the implementer

- **Creation flow UX.** The `/strategies` inline form submits on Enter OR click. After create, auto-navigate to `/s/:newId` for immediate editing — saves the user a second click. If the user wants to batch-create multiple strategies, they hit Back, type another name, submit again.
- **`name` as both a field AND the page heading.** `StrategyDetail`'s `<h1>` reads the live `entry.name` value (via `useStrategyEntry`). When the user renames in the form, the heading updates on save (TanStack Query invalidation re-fetches). Consider memoizing if render cost matters; in practice the 7-field form is cheap.
- **`idealRR` as a regular input, not textarea.** Short enough to fit on one line. No validation — free-form per the rationale above.
- **List ordering.** `updatedAt desc` — most recently touched appears first. Matches how users think about "what's the strategy I've been working on lately." If users want alphabetical or custom, BACKLOG.
- **Boundary rule stays clean.** `features/journal` owns the form + list logic. `src/app/Strategies.tsx` is the route-level composer (like SplitHome, WalletView, DayDetail). No `features/wallets` coupling needed.
- **Handling empty-content strategies.** A strategy with a name but all content fields empty is valid; it shows up in the list with a fallback teaser (e.g., "Untitled content" — reuse JournalPanel's "Mindset / discipline only" equivalent logic). `isDraftEmpty` only fires when EVERY field including `name` is blank, which shouldn't happen on `/s/:id` because the entry has a name from creation.
- **UUID collisions.** `crypto.randomUUID()` returns ~2^122 unique values. Not a concern.
- **"Untitled" fallback.** If the user renames to blank (deletes all text from the `name` field), the detail page heading shows "Untitled" and the list row also shows "Untitled". This is user-visible feedback that something needs a name.
