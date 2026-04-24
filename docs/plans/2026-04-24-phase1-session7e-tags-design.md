# Phase 1 Session 7e — Tags (Design)

**Status:** Accepted (2026-04-24).
**Implements:** plan.md §11.8 "tags" scope item across all three journal variants.
**Depends on:** Session 7c (strategy variant) and 7d (trade↔strategy link — establishes the backwards-compat pattern for adding required fields to existing variants).
**Splits from:** The original "7d — Tags + trade↔strategy linking" BACKLOG entry; 7d shipped linking, 7e ships tags, 7f will ship screenshots.

---

## 1. Goal

Add free-form `tags: ReadonlyArray<string>` to every journal variant (trade, session, strategy). Build a canonical chip-input component with autocomplete pooled across all variants, wire it into all three forms, and render tag chips on the existing read surfaces: trade-history rows, `/strategies` list, `JournalPanel` session rows.

## 2. Out of scope

- **Tag filtering.** No tag-based list filter in 7e. That's a natural next step but deserves its own scope discussion (multi-tag AND vs OR, where the filter lives, how it composes with existing filters).
- **Tag management UI.** No rename / merge / archive surface. Phase 1 data volumes make in-place rewriting practical; a dedicated surface is premature.
- **Multi-entry index.** Dexie `*tags` multiEntry indexes aren't added in 7e. Add when filter lands.
- **Tag counts / usage stats.** "This tag has been used on 7 trades" — useful but off-scope.
- **Drag-reorder chips inside a form.** Tag order isn't semantic; storage dedupes, display sorts alphabetically.
- **Paste-comma-separated bulk entry.** Nice-to-have; add to BACKLOG.
- **Screenshots.** Session 7f.

## 3. Architectural decisions (locked via brainstorm 2026-04-24)

1. **Scope B — input + storage + read-surface display.** No filtering in 7e.
2. **Canonical chip-input UX.** Enter/comma commits, Backspace-in-empty removes last, X on chip removes, autocomplete dropdown with arrow-key navigation. Familiar GitHub/Gmail-labels pattern.
3. **Autocomplete pooled across all variants.** One global vocabulary; a tag from a strategy suggests on a trade and vice versa.
4. **Strict normalization on save.** Lowercase, trim, collapse internal whitespace runs to single spaces. Max 40 chars (truncated on commit with no warning in 7e — the input enforces via `maxLength`).
5. **Spaces allowed inside tags.** `"revenge trade"` is a single tag. Commit only on Enter or comma; space stays in the tag.
6. **Denormalized string storage, no registry table.** Each entry carries `tags: string[]`. Renaming is a future find-and-replace pass; acceptable for Phase 1 data volumes.

## 4. Data model

### 4.1 Entity additions

In `src/entities/journal-entry.ts`, add to all three variants:

```ts
readonly tags: ReadonlyArray<string>;
```

- Stored lowercased + trimmed + whitespace-collapsed. Deduplicated on save.
- Empty array (`[]`) when no tags.

### 4.2 Normalization

Pure helper at `src/domain/tags/normalizeTag.ts`:

```ts
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeTagList(
  raws: ReadonlyArray<string>,
  maxLen = 40,
): ReadonlyArray<string> {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of raws) {
    const t = normalizeTag(raw).slice(0, maxLen);
    if (t === '' || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
```

Consumers use `normalizeTagList` when ingesting a full list (form save, import). The 40-char cap is a UI-enforced invariant but `normalizeTagList` enforces it too so storage is always well-formed.

### 4.3 Dexie schema

**No bump.** Row-value shape change only. No new index.

Pre-7e rows lack `tags` in storage → consumers coerce `entry.tags ?? []` on read → next upsert writes `[]` (or populated array). Same self-heal pattern as 7d's `strategyId`.

### 4.4 Zod schema

In `src/lib/validation/export.ts`, add to `TradeJournalEntrySchema`, `SessionJournalEntrySchema`, `StrategyJournalEntrySchema`:

```ts
tags: z.array(z.string()).default([]),
```

- `.default([])` — pre-7e export files lack `tags`; Zod coerces missing to `[]`.
- No length or content validation inside the schema. Keeps the schema loose-forward; normalization happens at write time in the forms.
- `formatVersion` unchanged at 1. Additive per CONVENTIONS §13.

## 5. Component design

### 5.1 `TagInput` — primitive

`src/lib/ui/components/tag-input.tsx`. Generic (not journal-specific) so future consumers can reuse.

```ts
type TagInputProps = {
  id: string;
  value: ReadonlyArray<string>;
  onChange: (tags: ReadonlyArray<string>) => void;
  onBlur?: () => void;
  suggestions: ReadonlyArray<string>;
  placeholder?: string;
  maxLength?: number;  // default 40
};
```

**Behavior:**

- Renders existing chips left-to-right; a flexible text input fills the remainder.
- **Commit:** Enter or comma → normalize (`normalizeTag`) → dedupe against current value → append → clear input. Focus stays.
- **Remove:** X on chip, or Backspace in empty input → remove last chip.
- **Autocomplete:** dropdown appears when input is non-empty and `suggestions` has `startsWith(normalized-input)` matches that aren't already present. Up to 8 suggestions, sorted alphabetically. Arrow keys navigate (highlighting an item); Escape closes; click picks. **Enter with a highlighted item** picks the suggestion (which may differ from the typed text — e.g., typed `br`, highlighted `breakout`). **Enter with nothing highlighted** commits the literal typed text.
- **Blur:** if input has pending text, fire commit-pending first (same pipeline as Enter-with-nothing-highlighted → fires `onChange` with the grown array), then fire `onBlur?.()`. Order matters: the parent's `onBlur` handler reads the latest value array to persist to Dexie; committing first ensures it sees the final state.
- **Accessibility:** input has `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`. Each chip X is a `<button type="button" aria-label="Remove tag: <name>">`.

**Tests (7 cases):**
1. Renders each existing chip with its label.
2. Enter commits typed text as a new chip.
3. Comma commits typed text as a new chip.
4. Backspace in empty input removes the last chip.
5. Suggestion dropdown filters by `startsWith`.
6. Arrow+Enter picks the highlighted suggestion.
7. Blur commits pending input.

### 5.2 `TagChipList` — read-only primitive

`src/features/journal/components/TagChipList.tsx`. Journal-scoped because tag-display styling is part of the journal visual identity; promoting to `lib/ui` only if another feature needs it.

```ts
type TagChipListProps = {
  tags: ReadonlyArray<string>;
  max?: number;  // default 3
};
```

**Behavior:**
- Empty array → returns `null` (no wrapper rendered).
- ≤ `max` tags → renders each as a chip.
- `> max` → renders first `max` chips + one `"+N more"` neutral chip (non-interactive).
- Tags are NOT clickable in 7e (filtering is out of scope).

**Styling:** `text-xs rounded-full border border-border bg-bg-overlay text-fg-muted px-2 py-0.5`.

**Tests (3 cases):** empty → null; 2 tags → 2 chips; 5 tags with max=3 → 3 chips + "+2 more".

## 6. Hooks

### 6.1 `useAllTags`

`src/features/journal/hooks/useAllTags.ts`.

```ts
export type UseAllTagsResult = {
  tags: ReadonlyArray<string>;  // unique, sorted alphabetically
  isLoading: boolean;
};

export function useAllTags(options?: { db?: HyperJournalDb }): UseAllTagsResult;
```

- Query key `['journal', 'all-tags']`.
- `queryFn`: `db.journalEntries.toArray()` → flatMap `entry.tags ?? []` → dedupe via `Set` → sort alphabetically.
- **Invalidation:** the three existing save hooks (`useTradeJournalEntry`, `useSessionJournalEntry`, `useStrategyEntry`) each get an `await queryClient.invalidateQueries({ queryKey: ['journal', 'all-tags'] })` added to `onSuccess`. One line per hook, three hooks.

**Cost analysis:** full table scan on every form render. Phase 1 = dozens of entries. Sub-ms. When someone has 10k+ entries, re-evaluate (likely adds a multiEntry index + incremental tag aggregation).

**Tests (2 cases):** empty db → empty array; populated db with overlapping tags across variants → deduped + sorted array.

### 6.2 `useJournalTagsByTradeId`

`src/features/journal/hooks/useJournalTagsByTradeId.ts`.

```ts
export type UseJournalTagsByTradeIdResult = {
  tagsByTradeId: ReadonlyMap<string, ReadonlyArray<string>>;
  isLoading: boolean;
};

export function useJournalTagsByTradeId(options?: {
  db?: HyperJournalDb;
}): UseJournalTagsByTradeIdResult;
```

- Query key `['journal', 'trade-tags-by-id']`.
- `queryFn`: read all trade-scope rows → build `Map<tradeId, tags>`.
- Invalidated by trade-journal save (add to existing `useTradeJournalEntry.save.onSuccess`).

**Purpose:** thread trade-row tags down from `WalletView` to `TradeHistoryList` without breaking the feature boundary (wallets ↛ journal).

**Tests (2 cases):** empty map when no entries; populated map with mixed trade + session rows (sessions filtered out).

## 7. Form integration

Each of `TradeJournalForm`, `SessionJournalForm`, `StrategyJournalForm` gets a parallel update:

1. `DraftState` adds `tags: ReadonlyArray<string>`.
2. `EMPTY_DRAFT` adds `tags: []`.
3. `isDraftEmpty` adds `&& draft.tags.length === 0` — tags DO count as content (typing a tag creates a row on blur, matching how typing a mood or picking a strategy does).
4. `entryToDraft` adds `tags: entry.tags ?? []` (pre-7e coercion).
5. `commit` entry construction adds `tags: normalizeTagList(next.tags)` — defence-in-depth even though `TagInput` already normalizes per-add.
6. Hook call: `const allTags = useAllTags(db ? { db } : {})`.
7. `suggestions = useMemo(() => allTags.tags.filter((t) => !draft.tags.includes(t)), [allTags.tags, draft.tags])`.
8. New JSX block with `<Label htmlFor="tags">Tags</Label>` + `<TagInput ... />`.

**Placement inside each form:**
- `TradeJournalForm`: below the strategy picker, above the plan-followed tri-state.
- `SessionJournalForm`: below `whatToAvoid`, above the mindset select.
- `StrategyJournalForm`: last field, below `notes` (tags feel like a catch-all label on an open-ended doc).

**Tests per form (+2 each):**
1. Renders `<Label>Tags</Label>` and the input.
2. Typing a tag + Enter + blur persists `tags: ["the-tag"]` on the Dexie row.

Deep chip/keyboard behavior is covered in `TagInput.test.tsx` — no need to re-exercise.

## 8. Read-surface integrations

### 8.1 Trade history rows

`src/features/wallets/components/TradeHistoryList.tsx` already accepts `tradeIdsWithNotes: ReadonlySet<string>` for the pencil icon. Add a sibling prop:

```ts
tradeTagsByTradeId: ReadonlyMap<string, ReadonlyArray<string>>;
```

Rendered inline on each row: `<TagChipList tags={tradeTagsByTradeId.get(row.id) ?? []} max={3} />` at the end of the content column. Composing route (`src/app/WalletView.tsx`) fetches via `useJournalTagsByTradeId` and threads it down — same boundary discipline as `useJournalEntryIds` (per CONVENTIONS §15 "Wallet-feature components cannot import `features/journal`").

+1 test in `TradeHistoryList.test.tsx`: row renders tag chips when the map has tags for that tradeId.

### 8.2 `/strategies` list

`src/app/Strategies.tsx` list items show name + updated-date + teaser today. Append `<TagChipList tags={e.tags} max={3} />` below the teaser line.

+1 test in `Strategies.test.tsx`: list row renders a tag chip when the strategy has tags.

### 8.3 `JournalPanel` session rows

`src/features/journal/components/JournalPanel.tsx` list items show date + teaser. Append `<TagChipList tags={e.tags} max={3} />` below the teaser line.

+1 test in `JournalPanel.test.tsx`: session row renders a tag chip.

## 9. Playwright E2E

`e2e/tags-roundtrip.spec.ts`, two tests:

1. **Trade tag round-trip.** Mock wallet → open a trade → focus tag input → type `"breakout"` + Enter → type `"revenge trade"` + Enter → blur → "Saved at" appears → reload → both tags present as chips in the form → remove `"breakout"` via its X → blur → reload → only `"revenge trade"` persists → back to trade-history → row shows the remaining tag chip.
2. **Cross-variant autocomplete.** Create a strategy at `/strategies` with tag `"breakout"` → navigate to a trade detail → type `br` in the trade tag input → verify `breakout` appears in the suggestion dropdown → ArrowDown + Enter picks it → blur → reload → tag persists on the trade.

## 10. Backwards compatibility

- **Pre-7e Dexie rows** (journal entries from 7a/b/c/d sessions): `tags` field missing. Every read path uses `entry.tags ?? []`. Self-heals on next upsert.
- **Pre-7e export files**: Zod `.default([])` coerces.
- **Cross-version import**: a file written by 7e carries `tags`; re-importing into pre-7e software would ignore unknown fields. Not a concern — HyperJournal is local-first, no multi-version ecosystem.

## 11. File manifest

| File | Change |
|---|---|
| `src/entities/journal-entry.ts` | MODIFY — `tags` on all three variants |
| `src/domain/tags/normalizeTag.ts` | NEW |
| `src/domain/tags/normalizeTag.test.ts` | NEW |
| `src/lib/validation/export.ts` | MODIFY — `tags` on all three schema branches |
| `src/lib/validation/export.test.ts` | MODIFY (+3) |
| `src/lib/ui/components/tag-input.tsx` | NEW |
| `src/lib/ui/components/tag-input.test.tsx` | NEW (+7) |
| `src/features/journal/hooks/useAllTags.ts` | NEW |
| `src/features/journal/hooks/useAllTags.test.tsx` | NEW (+2) |
| `src/features/journal/hooks/useJournalTagsByTradeId.ts` | NEW |
| `src/features/journal/hooks/useJournalTagsByTradeId.test.tsx` | NEW (+2) |
| `src/features/journal/hooks/useTradeJournalEntry.ts` | MODIFY — invalidate all-tags + trade-tags-by-id on save |
| `src/features/journal/hooks/useSessionJournalEntry.ts` | MODIFY — invalidate all-tags on save |
| `src/features/journal/hooks/useStrategyEntry.ts` | MODIFY — invalidate all-tags on save |
| `src/features/journal/components/TagChipList.tsx` | NEW |
| `src/features/journal/components/TagChipList.test.tsx` | NEW (+3) |
| `src/features/journal/components/TradeJournalForm.tsx` | MODIFY |
| `src/features/journal/components/TradeJournalForm.test.tsx` | MODIFY (+2) |
| `src/features/journal/components/SessionJournalForm.tsx` | MODIFY |
| `src/features/journal/components/SessionJournalForm.test.tsx` | MODIFY (+2) |
| `src/features/journal/components/StrategyJournalForm.tsx` | MODIFY |
| `src/features/journal/components/StrategyJournalForm.test.tsx` | MODIFY (+2) |
| `src/features/journal/components/JournalPanel.tsx` | MODIFY — render TagChipList on session rows |
| `src/features/journal/components/JournalPanel.test.tsx` | MODIFY (+1) |
| `src/features/journal/index.ts` | MODIFY — export new hooks + TagChipList |
| `src/features/wallets/components/TradeHistoryList.tsx` | MODIFY — accept + render `tradeTagsByTradeId` prop |
| `src/features/wallets/components/TradeHistoryList.test.tsx` | MODIFY (+1) |
| `src/app/WalletView.tsx` | MODIFY — thread `useJournalTagsByTradeId` down |
| `src/app/Strategies.tsx` | MODIFY — TagChipList |
| `src/app/Strategies.test.tsx` | MODIFY (+1) |
| Peripheral test files with literal trade/session/strategy entries | MODIFY — add `tags: []` (same pattern as 7d's `strategyId: null` backfill) |
| `e2e/tags-roundtrip.spec.ts` | NEW (+2 E2E) |
| `docs/SESSION_LOG.md` | MODIFY |
| `docs/BACKLOG.md` | MODIFY |
| `docs/CONVENTIONS.md` | MODIFY (§15) |

## 12. Test delta

Target totals end-of-session:
- `normalizeTag` — 2 tests (single tag + list normalize).
- `TagInput` — 7 tests.
- `useAllTags` — 2 tests.
- `useJournalTagsByTradeId` — 2 tests.
- `TagChipList` — 3 tests.
- Form integration — 6 tests (2 × 3 forms).
- Surface integration — 3 tests (TradeHistoryList + Strategies + JournalPanel, 1 each).
- Validation — 3 tests.
- **Total delta: +28 unit/component, +2 E2E.**
- **End state: ~357 unit / 13 E2E** (from 329 / 11).

## 13. Acceptance

1. All three journal forms expose a "Tags" field with chip-input behavior.
2. Typing a tag + Enter + blur persists `tags: ["the-tag"]` on Dexie; reload preserves.
3. Autocomplete draws from every existing tag across all three variants.
4. X on a chip or Backspace-in-empty removes; form autosaves the updated array.
5. Trade-history rows, `/strategies` list, and `JournalPanel` session rows render up to 3 chips per row with "+N more" overflow.
6. Pre-7e entries load without error; export/import round-trips cleanly including when old files lack the field.
7. `pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build` all green; domain coverage ≥ 90%.
8. `pnpm test:e2e` — new spec passes; existing 11 specs still pass.
9. SESSION_LOG / BACKLOG / CONVENTIONS updated.

## 14. Decisions not taken (intentionally)

- **No Dexie multiEntry index on `tags`.** Fine for Phase 1 volumes; revisit when tag-filtering (a later session) lands.
- **No tag-usage count in the autocomplete dropdown.** "breakout (used 7×)" is nice but premature. If a user has >50 distinct tags, revisit.
- **No tag-color customization.** All chips are neutral. Tag-color is a product-identity decision deserving its own design.
- **No chip rendering inside the forms' existing status indicator.** The form-level "Saved at HH:MM" chip continues to be a status affordance, not a tag chip.
- **No normalization during import.** Import accepts tags as-is; the first form save re-normalizes. This preserves forward-compat with hypothetical future schema enrichment.
