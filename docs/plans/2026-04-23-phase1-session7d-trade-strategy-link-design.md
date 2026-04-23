# Phase 1 Session 7d — Trade ↔ Strategy Link (Design)

**Status:** Accepted (2026-04-23).
**Implements:** plan.md §11.8 "manual link to strategies" for the trade-journal scope.
**Depends on:** Session 7c (StrategyJournalEntry + /strategies + /s/:id).
**Splits from:** The original "7d — Tags + trade↔strategy linking" BACKLOG entry. Tags move to Session 7e; screenshots become 7f. Split per focused-sessions guidance.

---

## 1. Goal

Let the user mark a trade journal entry as "using strategy X" by picking from their existing strategies. The link is a single structured reference (UUID), not a free-text tag. Surface the link in two places: the TradeJournalForm (edit) and the TradeDetail header (glance + click-through).

## 2. Out of scope

- **Tags.** Deferred to Session 7e. Cross-cutting on all three journal variants; its own chip-input component; its own normalization design.
- **Screenshots/images.** Deferred to Session 7f.
- **Reverse lookup** ("which trades link to strategy X") on `StrategyDetail`. Not a 7d feature; added to BACKLOG for post-tags work.
- **Per-strategy analytics** (win rate, avg R, etc. of trades linked to a strategy). BACKLOG; unblocks after 7d ships the link.
- **Strategy deletion.** No deletion UI exists yet. Orphaned links are handled gracefully (see §5.3) but not actively managed.
- **Multi-link per trade.** Only one strategy per trade. Widening `strategyId: string | null` → `strategyIds: string[]` is an additive migration if the need materialises later.
- **Session↔strategy link.** Sessions reference strategies implicitly through same-day trades. An explicit field is not justified.

## 3. Architectural decisions (locked in via brainstorm 2026-04-23)

1. **Tags and strategy references are separate concepts.** Tags = freeform labels (future); strategy ref = structured id reference.
2. **Single strategy per trade.** `strategyId: string | null`.
3. **Strategy ref only on `TradeJournalEntry`.** `SessionJournalEntry` and `StrategyJournalEntry` unchanged in 7d.
4. **Denormalized id, no registry table.** `strategyId` is a raw UUID string pointing at a `StrategyJournalEntry.id`. No foreign-key table; Dexie doesn't enforce it anyway.
5. **Scope kept tight** — ship strategy-link alone in 7d; tags in 7e.

## 4. Data model

### 4.1 Entity

In `src/entities/journal-entry.ts`:

```ts
export type TradeJournalEntry = {
  readonly id: string;
  readonly scope: 'trade';
  readonly tradeId: string;
  readonly createdAt: number;
  readonly updatedAt: number;

  readonly preTradeThesis: string;
  readonly postTradeReview: string;
  readonly lessonLearned: string;

  readonly mood: Mood | null;
  readonly planFollowed: boolean | null;
  readonly stopLossUsed: boolean | null;

  // NEW in 7d:
  readonly strategyId: string | null;

  readonly provenance: Provenance;
};
```

### 4.2 Dexie schema

**No schema bump.** Only the row value shape changes; no new index required. Reverse lookup ("trades for strategy X") is explicitly out of scope; when it lands (post-tags), consider an index then.

**Migration from pre-7d rows:** Existing rows lack `strategyId` in storage. On read, `hook.entry?.strategyId` is `undefined`. The form and detail chip treat `undefined` as `null` (display "— no strategy"). On next upsert the field is written as `null` explicitly, so the missing-field state is transient and self-heals.

### 4.3 Zod schema

In `src/lib/validation/export.ts`:

```ts
const TradeJournalEntrySchema = z.object({
  // ...existing fields unchanged...
  strategyId: z.string().min(1).nullable().default(null),
});
```

- `.nullable()` — accepts `null` explicitly.
- `.default(null)` — old export files written before 7d lack the field; Zod coerces missing to `null`.
- `.min(1)` — prevents empty-string accidents. Does **not** validate UUID format (keeps test fixtures loose; the id is opaque to the schema).

**`formatVersion` stays at 1.** Additive change per CONVENTIONS §13.

## 5. UI design

### 5.1 TradeJournalForm — strategy picker

- **Placement:** below `lessonLearned`, above the tri-state booleans (plan-followed / stop-loss). Grouped under a small "Context" sub-heading to signal it's a structural field, not prose.
- **Component:** inline native `<select>` — consistent with the `mindset` select in `SessionJournalForm`. No new component, no combobox dependency.
- **Options:** `useStrategies()` drives the list. Structure:
  ```
  <option value="">— no strategy</option>
  <option value="<uuid-1>">Breakout</option>
  <option value="<uuid-2>">Untitled</option>   ← blank name → "Untitled"
  ...
  ```
- **Change semantics:** `onChange` marks draft dirty; `onBlur` commits — same handler shape as every other field on the form and matches the `mindset` select in `SessionJournalForm`. Picker commits when focus leaves the `<select>`; in practice that's the click on the selected option (browsers blur the control after the pointer-up).
- **Zero-strategy state:** user has no strategies yet → render only `"— no strategy"` plus a subtle helper: `"Create strategies in /strategies"` (small link text, `text-fg-muted`).
- **Orphaned-id state:** trade has `strategyId: "abc"` but no matching strategy in `useStrategies` (strategy was deleted offline, or import carried a dangling ref). Behaviour:
  - An additional `<option>` is rendered **only** when the current `draft.strategyId` has no match in the loaded list. Its `value` is the orphan id; its label is `— deleted strategy`. This keeps `<select>.value` in sync without a controlled-input mismatch warning.
  - The orphan option is not `disabled` — if the user blurs without changing, the orphan id is rewritten unchanged, which is the correct behaviour (we don't silently unlink on render).
  - Once the user selects any real option (or `"— no strategy"`), the orphan option disappears on the next render because the condition no longer holds.

### 5.2 TradeDetail — header chip

- **Placement:** header, right of the existing `<SideBadge>` + `<StatusBadge>`:
  ```
  BTC  [long]  [closed]  [Strategy: Breakout →]
  ```
- **Visibility:** rendered only when `strategyId` is set AND resolves to an existing strategy. Orphaned ids → no chip (the picker still shows "deleted strategy" to clue the user; the chip staying silent is the cleaner reading signal — "there's nothing to link to").
- **Content:** `"Strategy: <name>"`. Blank-name fallback: `"Strategy: Untitled"`.
- **Interaction:** clickable, navigates to `/s/<strategyId>`. Keyboard-accessible with focus ring (same pattern as the "Settings"/"Back" header links).
- **Styling:** consistent with the existing header badges — `rounded-md px-2 py-0.5 text-xs`. Tone: neutral/underline to mark it as a link, not a metric — so not gain/loss.

### 5.3 Data flow on TradeDetail

`TradeDetailInner` composes two existing hooks:
- `useTradeJournalEntry(tradeId)` — reads `strategyId` (same hook the form uses).
- `useStrategies()` — resolves id → name with `entries.find(s => s.id === strategyId)`.

Both hooks are already cheap (single Dexie read each). No new hook.

### 5.4 Accessibility

- The strategy picker is a native `<select>` — baseline-accessible (labeled, keyboard-navigable, screen-reader-announced). `<Label htmlFor="strategy">` required.
- The chip is rendered as a `<Link>`, inherits focus-visible styling used across the app.
- `prefers-reduced-motion` — no new animations introduced.

## 6. Tests

### 6.1 Zod validation (+3 in `export.test.ts`)

- Accepts a trade entry with `strategyId: "uuid-string"`.
- Accepts a trade entry with `strategyId: null`.
- Accepts an old-format trade entry with no `strategyId` field (defaulted to `null`).

### 6.2 TradeJournalForm (+5 in `TradeJournalForm.test.tsx`)

- Renders the strategy picker labelled "Strategy" with the "— no strategy" option present.
- Renders loaded strategies by name; blank-name → "Untitled".
- Selecting a strategy (`fireEvent.change` + `fireEvent.blur`) saves the id to the Dexie row.
- Selecting "— no strategy" after a prior link (`change` + `blur`) saves `strategyId: null`.
- When the stored `strategyId` has no matching strategy in the list, a "— deleted strategy" option is rendered as the current selection.

### 6.3 TradeDetail (+4 in `TradeDetail.test.tsx`)

- Chip not rendered when `strategyId: null`.
- Chip renders with strategy name and `href="/s/<id>"` when linked.
- Chip shows "Strategy: Untitled" when the linked strategy has a blank name.
- Chip not rendered when `strategyId` points at a nonexistent strategy (orphaned).

### 6.4 Playwright E2E (+2 in `e2e/trade-strategy-link.spec.ts`)

1. **Link + persist.** Mock wallet → navigate to a trade detail → (create a strategy via `/strategies` and come back, OR seed a strategy directly via IndexedDB in `beforeEach`) → open the picker → select the strategy → verify chip appears in header → reload → chip still there, picker still shows the selection.
2. **Unlink.** Same setup with a linked trade → pick "— no strategy" → chip disappears → reload → still unlinked.

**Estimated total delta:** +9 component, +3 validation, +2 E2E. New totals: **329 unit tests / 11 E2E** (up from 317 / 9).

## 7. Backwards compatibility

- **Dexie rows from pre-7d storage** (current user databases): `strategyId` field is missing. Treated as `null` on read via optional-chaining. No migration step; self-heals on next save.
- **Export files from pre-7d app** (`formatVersion: 1`, no `strategyId` in trade entries): Zod `.default(null)` coerces. Import proceeds normally.
- **Export files from 7d imported into a pre-7d app** (reverse compatibility): not a real concern — HyperJournal is local-first, there's no heterogenous deployment. Included for completeness.

## 8. File manifest

| File | Change |
|---|---|
| `src/entities/journal-entry.ts` | MODIFY — add `strategyId` field |
| `src/lib/validation/export.ts` | MODIFY — extend `TradeJournalEntrySchema` |
| `src/lib/validation/export.test.ts` | MODIFY — +3 cases |
| `src/features/journal/components/TradeJournalForm.tsx` | MODIFY — picker + draft state |
| `src/features/journal/components/TradeJournalForm.test.tsx` | MODIFY — +5 cases |
| `src/app/TradeDetail.tsx` | MODIFY — header chip |
| `src/app/TradeDetail.test.tsx` | MODIFY — +4 cases |
| `e2e/trade-strategy-link.spec.ts` | NEW — +2 E2E |
| `docs/SESSION_LOG.md` | MODIFY — Session 7d entry |
| `docs/BACKLOG.md` | MODIFY — 7d deferrals + promoted items |
| `docs/CONVENTIONS.md` | MODIFY — §15 note on strategyId ref + orphan UX |

**Not touched:** `src/lib/storage/journal-entries-repo.ts`, `src/lib/storage/db.ts`, hooks (all of `useTradeJournalEntry`, `useStrategies`, `useStrategyEntry`, `useCreateStrategy`), `StrategyJournalForm`, `Strategies.tsx`, `StrategyDetail.tsx`, `JournalPanel.tsx`.

## 9. Acceptance

1. Opening a trade detail shows a "Strategy" select in the journal form.
2. Selecting a strategy persists (Dexie row has `strategyId`); reload preserves.
3. After selection, a header chip "Strategy: <name> →" appears on the same page and navigates to `/s/<id>`.
4. Selecting "— no strategy" removes the link and the chip.
5. When a strategy id is orphaned (no matching row), the picker shows "— deleted strategy" and the chip is hidden.
6. Pre-7d entries load without error and round-trip cleanly through export/import.
7. `pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build` all green; domain coverage ≥ 90%.
8. `pnpm test:e2e` — new spec passes; existing 9 specs still pass.
9. SESSION_LOG / BACKLOG / CONVENTIONS updated.

## 10. Decisions not taken (intentionally)

- **No combobox / typeahead for the strategy picker.** Strategies are created explicitly via `/strategies`; a user with 5–30 of them is fine scrolling a native `<select>`. Revisit only if a user gets past 50.
- **No strategy-delete UI in this session.** Orphan handling is defence-in-depth, not a pre-condition for delete.
- **No reverse-lookup list on `StrategyDetail`.** Genuinely useful once tags + multi-link patterns settle; doing it now would constrain those later designs.
- **No `useLinkedStrategy(tradeId)` composite hook.** `TradeDetail` composing two cheap hooks is clearer than hiding them behind a third.
