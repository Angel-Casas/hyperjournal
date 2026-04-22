# Phase 1 Session 7b — Session/day journal (design spec)

- **Date:** 2026-04-22
- **Status:** Draft — awaiting user review
- **Author:** Claude (Opus 4.7)
- **Follow-up:** Implementation plan generated via `superpowers:writing-plans` after this spec is approved.

---

## Goal

Extend journaling to the session/day scope. One entry per UTC date, wallet-agnostic (entries belong to the trader, not the wallet — matches plan §11.8 Section B's framing). Dedicated `/d/:date` route with a six-field `SessionJournalForm`. The long-stubbed `JournalPanel` on SplitHome becomes real: recent entries list + "Today's journal" CTA. Trade journal from Session 7a untouched.

After this session lands, plan §24 #5 is satisfied at the "session notes" level too; only strategy journals + tags (Session 7c) remain before §24 #5 is fully closed.

## Why now

- Session 7a proved the journaling patterns (entity, Dexie, autosave, export/import). 7b applies them to the second scope without re-inventing.
- The JournalPanel stub has existed since Session 1 without real content; making it useful now is a pure upside and a natural home for session-entry discovery.
- Keeping scope discriminator on `JournalEntry` (introduced in 7a specifically to prepare for this) pays off.

## Non-goals (explicit)

1. **Strategy/setup scope + tags.** Session 7c.
2. **Screenshots / images.** Session 7d.
3. **Calendar-cell click → day detail.** ECharts custom event wiring is a standalone follow-up; filed as BACKLOG.
4. **Cross-wallet PnL summary on the day-detail page.** "Which wallets" is its own design problem — which saved wallets, across what window, displayed how? Defer to Phase 2 filter work.
5. **Edit history, selective import, filtering** — same BACKLOG entries from 7a.
6. **Per-wallet session entries.** Plan §11.8 fields are trader-level, not wallet-level. If demand surfaces, add an optional `walletAddress: string | null` field; additive.
7. **Multi-entry per date** (morning session + afternoon session). Same "one-per-key" constraint as 7a's trade scope.
8. **"Mistakes" as a separate field.** Folded into `summary` + `whatToAvoid`; keeps the form "lightweight enough to use regularly" (plan §11.8).

---

## Scope

### Lane 1 — Entity: `JournalEntry` becomes a discriminated union

**What:**

- `src/entities/journal-entry.ts` extends:
  - `Mindset` type: `'focused' | 'scattered' | 'reactive' | 'patient' | 'tilted'`.
  - Current `JournalEntry` shape becomes `TradeJournalEntry` (scope='trade'). No field changes — existing Dexie rows match this variant as-is, no data migration needed.
  - New `SessionJournalEntry` variant with scope='session', `date: string` (YYYY-MM-DD UTC), and the six session-specific fields from Q2.
  - `JournalEntry` is the discriminated union of both.

```ts
export type Mindset =
  | 'focused'
  | 'scattered'
  | 'reactive'
  | 'patient'
  | 'tilted';

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
  readonly provenance: Provenance;
};

export type SessionJournalEntry = {
  readonly id: string;
  readonly scope: 'session';
  readonly date: string; // YYYY-MM-DD (UTC)
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly marketConditions: string;
  readonly summary: string;
  readonly whatToRepeat: string;
  readonly whatToAvoid: string;
  readonly mindset: Mindset | null;
  readonly disciplineScore: number | null; // 1-5
  readonly provenance: Provenance;
};

export type JournalEntry = TradeJournalEntry | SessionJournalEntry;
```

- Dexie schema v3 in `src/lib/storage/db.ts`: additive — only adds `date` to the `journalEntries` index list. No `.upgrade()` callback. Existing rows unchanged.

```ts
this.version(3).stores({
  wallets: '&address, addedAt',
  fillsCache: '&address, fetchedAt',
  userSettings: '&key',
  journalEntries: '&id, tradeId, scope, updatedAt, date',
});
```

- `src/domain/dates/isValidDateString.ts` — pure `(s: string) => s is YYYYMMDD` helper. Validates format + real calendar date (rejects `2025-02-30`). Narrows to a branded `YYYYMMDD` type so route handlers and repos can pass a typed value.

**Why discriminated union (not separate tables):** Dexie stores arbitrary shapes; one table keeps the repo thin. The union on `scope` gives TypeScript narrowing for free, and Sessions 7c/7d extend the union rather than adding tables.

### Lane 2 — Repo extensions

**What:**

Extend `src/lib/storage/journal-entries-repo.ts`:

```ts
export type JournalEntriesRepo = {
  // Existing:
  findByTradeId(tradeId: string): Promise<TradeJournalEntry | null>;
  upsert(entry: JournalEntry): Promise<void>;
  remove(id: string): Promise<void>;
  listAll(): Promise<ReadonlyArray<JournalEntry>>;
  listAllTradeIds(): Promise<Set<string>>;
  // New in 7b:
  findByDate(date: string): Promise<SessionJournalEntry | null>;
  listSessionEntries(limit?: number): Promise<ReadonlyArray<SessionJournalEntry>>;
};
```

- `findByTradeId` return type narrows to `TradeJournalEntry | null` (it already only ever returns trade-scope entries, but the type was `JournalEntry | null` — tighten now).
- `findByDate` filters on `scope='session' AND date=date`. Dexie's `where('date').equals(date)` plus a post-filter on scope, or a compound index. Use post-filter for simplicity.
- `listSessionEntries` reads `scope='session'`, orders by `updatedAt desc`, limits to `limit ?? 7`. Dexie: `where('scope').equals('session').reverse().sortBy('updatedAt')`, then `.slice(0, limit)`.

### Lane 3 — Hooks

**What:**

- `src/features/journal/hooks/useSessionJournalEntry.ts` — parallel to `useTradeJournalEntry`. Query key `['journal', 'session', date]`. Same mutation shape (save/remove). Invalidates `['journal', 'session', date]`, `['journal', 'recent-sessions']`, and `['journal', 'trade-ids']` (the last for consistency — actually skip that, trade-ids is trade-only).
- `src/features/journal/hooks/useRecentSessionEntries.ts` — query key `['journal', 'recent-sessions']`. Returns `{ entries, isLoading }`. Invalidated by `useSessionJournalEntry` saves.
- Export both from `src/features/journal/index.ts`.

### Lane 4 — `/d/:date` route + `DayDetail` page + `SessionJournalForm`

**What:**

- Route `/d/:date` registered in `src/app/routes.tsx` after `/w/:address/t/:tradeId`.
- `src/app/DayDetail.tsx`:
  - Validates `date` param via `isValidDateString`. Invalid → `<Navigate to="/" replace />`.
  - Header: date label (formatted nicely, e.g., "Monday, April 22, 2026") + Back link to `/` + Settings link. Same focus-visible + landmark conventions.
  - Below: `<SessionJournalForm date={validatedDate} />`.
- `src/features/journal/components/SessionJournalForm.tsx`:
  - Six fields per Q2: marketConditions (textarea), summary (textarea), whatToRepeat (textarea), whatToAvoid (textarea), mindset (select), disciplineScore (inline radio group 1–5 + Unanswered).
  - Same autosave-on-blur + draftRef + hydration-guard + `isDraftEmpty` short-circuit + form-level status machine as `TradeJournalForm`.
  - DisciplineScore is a 6-radio inline group (1, 2, 3, 4, 5, Unanswered). Inline because importing a second three-state shape (TriStateRadio) for five-state + unanswered is awkward; the component lives in the form file.
- Public surface: export `SessionJournalForm` from `src/features/journal/index.ts`.

### Lane 5 — JournalPanel becomes real

**What:**

Current `src/features/journal/components/JournalPanel.tsx` is a Session 1 stub showing "No entries yet."

New behavior:
- Header: "Journal" heading.
- Primary action: `<Link to="/d/<today>">` rendering "+ Today's journal" as a `<Button variant="default">`. `<today>` computed as `YYYY-MM-DD` of `new Date()` in UTC at render time (a pure helper `todayUtcDateString(now)` injectable for testing).
- Recent entries list (up to 7): each row a `<Link to="/d/:date">` showing:
  - Date (e.g., "Apr 22, 2026")
  - First non-empty field's first line as a teaser (up to ~60 chars)
- Empty state: "No session journal yet. Start with today's."
- Loading state: small "Loading…" text (session entries load fast; no skeleton).

### Lane 6 — Zod schema: discriminated union

**What:**

In `src/lib/validation/export.ts`:

```ts
const MindsetSchema = z
  .enum(['focused', 'scattered', 'reactive', 'patient', 'tilted'])
  .nullable();

const TradeJournalEntrySchema = z.object({
  id: z.string().min(1),
  scope: z.literal('trade'),
  tradeId: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  preTradeThesis: z.string(),
  postTradeReview: z.string(),
  lessonLearned: z.string(),
  mood: MoodSchema,
  planFollowed: z.boolean().nullable(),
  stopLossUsed: z.boolean().nullable(),
  provenance: z.enum(['observed', 'derived', 'inferred', 'unknown']),
});

const SessionJournalEntrySchema = z.object({
  id: z.string().min(1),
  scope: z.literal('session'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  marketConditions: z.string(),
  summary: z.string(),
  whatToRepeat: z.string(),
  whatToAvoid: z.string(),
  mindset: MindsetSchema,
  disciplineScore: z.number().int().min(1).max(5).nullable(),
  provenance: z.enum(['observed', 'derived', 'inferred', 'unknown']),
});

const JournalEntrySchema = z.discriminatedUnion('scope', [
  TradeJournalEntrySchema,
  SessionJournalEntrySchema,
]);
```

- `ExportDataSchema.journalEntries?: z.array(JournalEntrySchema).optional()` — unchanged on the outside; the inner schema is now discriminated.
- `_schemaCheck` stays one-way (schema fits entity). No format-version bump per CONVENTIONS §13 — scope is a pre-existing field; adding a new enum value to a discriminated union is additive for readers accepting both variants.

### Lane 7 — Playwright E2E

One new spec `e2e/session-journal-roundtrip.spec.ts`:
- Navigate to `/`.
- Click "Today's journal" button in the JournalPanel.
- Assert URL matches `/d/<today>`.
- Type into summary field, blur, see "Saved at HH:MM".
- Reload, assert content persists.
- Navigate back to `/`, assert the entry appears in the recent list.

---

## Data flow

1. User lands on `/`.
2. `JournalPanel` mounts; `useRecentSessionEntries(7)` fetches from Dexie.
3. User clicks "+ Today's journal" → route to `/d/2026-04-22`.
4. `DayDetail` validates the date; `SessionJournalForm` mounts.
5. `useSessionJournalEntry('2026-04-22')` fetches existing entry or returns null.
6. User types into `summary`, blurs → mutation fires → Dexie upsert → invalidates `['journal', 'session', date]` and `['journal', 'recent-sessions']`.
7. Header chip flips to "Saved at HH:MM".
8. User navigates back to `/` → JournalPanel re-renders from refreshed cache; new entry is at the top.

## Test strategy

- **Unit (Vitest):**
  - `isValidDateString` (domain TDD): valid YYYY-MM-DD, rejects obvious bad formats, rejects impossible dates like `2025-02-30` and `2025-13-01`.
  - `todayUtcDateString(now)` (domain TDD): stable across timezones; injected clock.
  - Repo: `findByDate`, `listSessionEntries` with fake-indexeddb.
  - Zod: discriminated-union round-trip for both variants; rejects wrong-shape-for-scope (e.g., session entry with `tradeId` and no `date`).
- **Component (RTL):**
  - `SessionJournalForm` mirrors `TradeJournalForm`'s test coverage.
  - `DayDetail` renders for valid date; redirects on invalid.
  - `JournalPanel` empty / populated / today-CTA rendering.
- **E2E (Playwright):** one session round-trip spec.

## Error handling

- Invalid `/d/:date` → silent redirect to `/`. Same shape as 7a's invalid-tradeId behavior.
- Dexie save failure → form status flips to `error` with "Couldn't save your notes. Try again?" + Retry button. Inherited from 7a's pattern.

## Migration

Dexie v3 is additive: new `date` index on `journalEntries`. No row transforms. v2 → v3 upgrade runs silently on first open. No downgrade path (consistent with v1 → v2).

## BACKLOG entries to file

1. **Calendar-cell click → day detail.** ECharts custom click handler on the `PnlCalendarChart` navigating to `/d/:date`.
2. **Cross-wallet PnL summary on the day-detail page.** Needs "which wallets" design.
3. **Per-wallet session entries** (optional `walletAddress` field).
4. **JournalPanel filtering** (by mindset / date range / has-content).
5. **Keyboard shortcut for "today's journal"** (e.g., `j` then `t`).
6. **Multi-entry per date** (morning / afternoon sessions).
7. **Listing view for all session entries** (full history, not just last 7).

## Acceptance criteria

1. `/d/:date` route renders header + SessionJournalForm. Invalid `:date` redirects to `/`.
2. Typing in any field + blur persists the entry to Dexie. Reload shows the data. Empty-form blur does NOT create a row.
3. `JournalPanel` on `/` shows the "+ Today's journal" CTA + up to 7 recent session entries. Each row links to `/d/:date`.
4. Export includes session entries when present; import restores them into a fresh browser context.
5. `pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build` green. Domain coverage ≥ 90%.
6. `pnpm test:e2e` — new session round-trip + existing Session 7a + 6 specs all pass.
7. SESSION_LOG + BACKLOG + CONVENTIONS updated (§15 Journaling amended with discriminated-union note + session-specific guidance).

## Open questions

None at spec time.

---

## Appendix — known ambiguities worth flagging to the implementer

- **Dexie findByDate filtering.** `where('date').equals(date)` should work since the scalar index is set. A session entry and a (hypothetical future) strategy entry sharing a date is unlikely but possible in 7c; for 7b, only session entries carry a `date`, so the scope post-filter is paranoia, not necessity. Keep it for forward-compat.
- **Discipline score input shape.** Inline radio group with six options (1, 2, 3, 4, 5, Unanswered). ARIA: `<fieldset>` + `<legend>` + `<input type="radio" name="disciplineScore">` ×6. Focus-visible ring per CONVENTIONS §12.
- **Today's date at render time.** `todayUtcDateString(Date.now())` at render time, freshly computed per render. The JournalPanel can stay mounted across midnight UTC; if the user crosses midnight while the tab is open, "today" shifts on next render. Acceptable.
- **Date formatting for display.** Long-form (e.g., "Monday, April 22, 2026") on `DayDetail`'s header. Short-form (e.g., "Apr 22, 2026") in the JournalPanel list. Both via `toLocaleDateString()` with respectively `{ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }` and `{ year: 'numeric', month: 'short', day: 'numeric' }`.
- **TradeJournalForm unchanged.** All its tests continue to pass because `TradeJournalEntry` (the new variant name) has the exact same fields as the pre-7b `JournalEntry`. A rename-only refactor at the type level.
- **The `teaser` string in the JournalPanel list.** First non-empty field among `summary`, `marketConditions`, `whatToRepeat`, `whatToAvoid`, in that priority order. Truncated to 60 chars with an ellipsis. If all are empty but the entry exists (edge case: user toggled a mindset then abandoned), render "Mindset / discipline only" as a fallback teaser.
- **Route ordering in `routes.tsx`.** `/d/:date` after `/w/:address/t/:tradeId` and before `/settings`. React Router v6 matches most specific first, so ordering is cosmetic but keep it consistent.
- **Mutation invalidation for recent-sessions.** `useSessionJournalEntry(date).save` invalidates `['journal', 'recent-sessions']`. `useTradeJournalEntry.save` does NOT invalidate it (trade saves don't affect recent-sessions). Keep the invalidation graphs separate.
