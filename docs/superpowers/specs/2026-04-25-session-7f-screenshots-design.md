# Session 7f — Screenshots / Images for Journal Entries

Status: **Approved (brainstorm)**, awaiting implementation plan.
Date: 2026-04-25
Owner: HyperJournal Phase 1.

This document is the validated design output of the brainstorming session. It is
the single source of truth for Session 7f scope. The implementation plan
(produced by `superpowers:writing-plans`) and the eventual ADR-0008 derive from
this spec.

---

## 1. Background and goals

Session 7e shipped tags across all three journal variants. Per `docs/plan.md`
§11.8, the next missing journaling capability is `screenshots/images`. This
session adds image attachments to journal entries — the workflow most likely to
matter is: a trader screenshots a chart at entry/exit and attaches it alongside
their notes.

**In-scope:**

- Multi-image attachments on **all three** journal variants (trade, session,
  strategy). Symmetrical with how 7e's tags work.
- Local persistence in IndexedDB via Dexie.
- File-picker and Cmd/Ctrl+V paste as upload paths.
- Thumbnail strip in the form (= read view); click-to-open-full-size opens the
  image in a new browser tab via a blob URL. No custom lightbox.
- Round-trip through the existing single-file JSON export/import pipeline using
  base64 data URLs. `formatVersion` stays `1`.
- A single architectural ADR (ADR-0008) recording the table-vs-inline,
  store-as-uploaded, base64-export decision bundle.

**Out of scope (explicitly deferred):**

- Thumbnails on virtualized list surfaces (TradeHistoryList, JournalPanel,
  /strategies). Detail view only.
- Image reorder UI.
- Inline lightbox / fullscreen modal.
- Drag-and-drop upload (paste covers the dominant workflow; drop is suppressed
  to prevent accidental tab-navigation, but no upload affordance is added).
- Auto-compression / re-encoding.
- Per-image annotations.
- ZIP-bundle export format.
- Boot-time orphan-image sweep.
- `navigator.storage.estimate()`-driven quota UI.

---

## 2. Architecture

### 2.1 Storage layer

**Dexie v3 → v4** is **additive only**. No `.upgrade()` callback because no
existing row needs transforming.

```ts
this.version(4).stores({
  wallets: '&address, addedAt',
  fillsCache: '&address, fetchedAt',
  userSettings: '&key',
  journalEntries: '&id, tradeId, scope, updatedAt, date',
  images: '&id, createdAt',
});
```

A new table `images` keyed on UUID `id`, with a secondary index on `createdAt`
for stable iteration order in admin/debug paths.

**Two image shapes — Dexie row vs wire format.**

`buildExport` in `src/domain/export/buildExport.ts` is synchronous and pure
(verified). `Blob → dataUrl` encoding via `FileReader` is async I/O, so it
**cannot** happen inside `buildExport`. The codebase therefore needs two
distinct image shapes:

- `JournalImage` (Dexie row) — `blob: Blob`. Lives in IndexedDB.
- `JournalImageExported` (wire format) — `dataUrl: string`. Used everywhere
  outside the storage boundary: `ExportSnapshot`, `ExportData`, `MergeResult`,
  the JSON file itself.

The Blob ↔ dataUrl transition is confined to `lib/storage/`:
`export-repo.readSnapshot` encodes on read; `import-repo.applyMerge` decodes
on write. Domain code (`buildExport`, `mergeImport`) never sees a `Blob`.

**New entities** `src/entities/journal-image.ts`:

```ts
export type JournalImage = {
  readonly id: string;
  readonly blob: Blob;
  readonly mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly createdAt: number;
  readonly provenance: Provenance; // always 'observed' for user uploads
};

export type JournalImageExported = {
  readonly id: string;
  readonly dataUrl: string; // "data:image/{png|jpeg|webp|gif};base64,..."
  readonly mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly createdAt: number;
  readonly provenance: Provenance;
};
```

**`ExportSnapshot`, `ExportData`, `MergeResult` extensions** —
`ExportSnapshot.images: Array<JournalImageExported>` (eager: snapshot is
already wire-shape post-encoding). `ExportData.images?:
Array<JournalImageExported>` (optional, mirrors Zod). `MergeResult` gains
`imagesToUpsert: Array<JournalImageExported>` and
`summary.imagesAdded` / `summary.imagesUpdated`.

**Entity extension** — all three `JournalEntry` variants gain:

```ts
readonly imageIds: ReadonlyArray<string>;
```

Pre-7f rows lack the field. Read-time coercion: `entry.imageIds ?? []` in the
repo; write-time: every upsert writes the array explicitly (`[]` if none).
Self-heals on next save. Mirrors the 7e tags pattern.

### 2.2 Repository

`src/lib/storage/journal-images-repo.ts`:

```ts
export type JournalImagesRepo = {
  getById(id: string): Promise<JournalImage | null>;
  getMany(ids: ReadonlyArray<string>): Promise<ReadonlyArray<JournalImage>>;
  create(image: JournalImage): Promise<void>;
  remove(id: string): Promise<void>;
  removeMany(ids: ReadonlyArray<string>): Promise<void>;
  listAll(): Promise<ReadonlyArray<JournalImage>>;
};
```

`journalEntriesRepo.remove(id)` is extended to **cascade** the entry's
`imageIds` into `images.removeMany`, inside the same Dexie transaction.

### 2.3 Pure helpers

`src/lib/images/` — fully unit-testable:

- `validateImageBlob(blob: Blob): { ok: true } | { ok: false; reason: 'too-big' | 'wrong-mime' }`
  — enforces 5 MB cap and the four-MIME whitelist.
- `decodeImageDimensions(blob: Blob): Promise<{ width: number; height: number }>`
  — wraps `createImageBitmap(blob)`. jsdom polyfill via an `Image()` wrapper for
  the test environment.
- `blobToDataUrl(blob: Blob): Promise<string>` — wraps `FileReader.readAsDataURL`.
- `dataUrlToBlob(dataUrl: string): Blob` — base64 decode via `atob` + typed
  array. Throws on malformed input.

Lives in `lib/`, not `domain/`, because each helper depends on a Web API
(`Blob`, `FileReader`, `createImageBitmap`, `atob`) — out of scope for
`domain/` per CLAUDE.md §3 rule 2.

### 2.4 Feature surface

`src/features/journal/`:

- `components/ImageGallery.tsx` — read-and-edit thumbnail strip. Anchor
  `<a href={blobUrl} target="_blank" rel="noopener noreferrer">` per thumbnail
  for click-to-open. Per-thumbnail `✕` invokes `removeImage`. Renders missing-
  image placeholder when `useJournalImage(id)` returns null.
- `components/ImageUploadButton.tsx` — `<input type="file" multiple
  accept="image/png,image/jpeg,image/webp,image/gif">`. One `addImage` call per
  selected file.
- `hooks/useJournalImage.ts` — id → `{ url, mime, width, height, bytes }`.
  Uses TanStack Query keyed on `imageId`. `URL.createObjectURL` on resolve;
  `URL.revokeObjectURL` on cache eviction (via cleanup callback).
- `hooks/useImagePasteHandler.ts` — paste-event listener attached at the form
  root. Filters on `clipboardData.items[*].kind === 'file'` with
  `type.startsWith('image/')`. Multi-image paste fans out to multiple
  `addImage` calls.
- Existing entry hooks (`useTradeJournalEntry`, `useSessionJournalEntry`,
  `useStrategyEntry`) extended with `addImage(file: File): Promise<...>` and
  `removeImage(id: string): Promise<void>` actions.

No new top-level dependency. Native `Blob`, `URL.createObjectURL`,
`createImageBitmap`, `ClipboardEvent`, `FileReader`, `atob`.

### 2.5 ADR

**ADR-0008: Separate images table for journal blob storage.**

Records the decision bundle:

- **Two-shape entity split:** `JournalImage` (Dexie row, `blob: Blob`) vs
  `JournalImageExported` (wire format, `dataUrl: string`). The transit
  boundary is confined to `lib/storage/`; domain code (`buildExport`,
  `mergeImport`) sees only the dataUrl shape. *Forced because:* `buildExport`
  is pure-synchronous per CLAUDE.md §3 rule 2, and base64 encoding is async
  I/O via `FileReader`.
- **Storage shape:** separate `images` Dexie table, journal entries reference
  by id. *Alternative considered:* embedded blobs on journal rows. *Rejected
  because:* every journal-table read (e.g., `useAllTags`'s scan,
  `useJournalTagsByTradeId`, `listAll`) would haul blob bytes through memory
  for no reason. Orphan cleanup also becomes a "rows with no matching entry"
  pass, which is straightforward.
- **Image processing:** store as-uploaded, no resize, no re-encode, 5 MB cap.
  *Alternatives considered:* (a) auto-compress to WebP/JPEG q=85 at max width
  1920px, (b) lossless WebP re-encode. *Rejected because:* trade-chart
  screenshots are detail-heavy (price labels, indicators); lossy compression
  reduces legibility. Lossless re-encoding adds canvas round-tripping
  complexity for modest wins. The 5 MB cap is generous; quota-pressure UX is
  separately deferred to BACKLOG.
- **Export format:** base64-embed in single-file JSON, `formatVersion` stays
  `1`. *Alternative considered:* ZIP bundle (data.json + images/<id>.png).
  *Rejected because:* keeping the existing buildExport / parseExport /
  applyMerge pipeline intact is high-value; the JSZip dependency is a
  significant addition for a worst-case ~25 MB single-user export that the
  current pipeline already handles. ZIP-format support stays a BACKLOG item if
  someone hits multi-GB exports.

---

## 3. Image lifecycle in the form

### 3.1 Save semantics

Adding or removing an image is a **discrete commit**, not an in-progress edit.
The form's `addImage` and `removeImage` actions therefore **flush any pending
text edits in the same write**:

1. Read the current form-state values from controlled inputs.
2. Build the next entry: `{ ...formState, imageIds: [...existing, newId] }`
   (or with the id removed for `removeImage`).
3. Open one `db.transaction('rw', db.journalEntries, db.images, ...)` at the
   entry-hook layer; inside it call `journalEntriesRepo.upsert(entry)` and
   either `journalImagesRepo.create(image)` or `journalImagesRepo.remove(id)`.
   The repo methods are thin `db.<table>.<op>(...)` wrappers — they
   auto-join an outer transaction when one is open. No transaction-handle
   parameter on the repo API.
4. Set the form's "saved" timestamp; clear dirty flags.

**Rationale:** an image add must not produce the state "image saved but my
notes weren't." This deviates slightly from the 7a–7c autosave-on-blur
convention, but is the right tradeoff — the alternative ("blur first, then
upload") is bad UX.

### 3.2 Concurrent add races

Two paste events fired in quick succession can both read the same `imageIds`
baseline → second write clobbers the first new id from the array (image row
survives, but the entry forgets it).

**Resolution:** each entry hook serializes its image-add calls via a promise
chain:

```ts
let pending: Promise<unknown> = Promise.resolve();
const addImage = (file: File) => {
  pending = pending.then(() => addImageInner(file));
  return pending;
};
```

Cheap, race-free, no library required.

### 3.3 Tab-close mid-upload (orphan handling)

`addImage` does two writes: image row first, then journal-entry upsert. If the
tab closes in between, an orphan image row exists. **Acceptable** — vanishing
window, no user-visible damage, and a future boot-time sweep (BACKLOG) can
clean it.

### 3.4 Drag-drop suppression

The browser's default for an image dropped on the page is to navigate to the
file URL — discarding in-progress edits. Each form root mounts a passive
`dragover` / `drop` handler that calls `preventDefault()`. **Suppress only**;
no upload affordance is added (paste is the supported workflow).

### 3.5 Paste interactions

The handler is attached at the form root. Behavior:

- Image item in clipboard → consume; `event.preventDefault()` and
  `stopPropagation()`. `addImage` fires.
- Text-only paste → falls through to native textarea paste. No preventDefault.
- Mixed clipboard (text + image) → image consumed, text discarded. Rare in
  practice; matches user intent ("I copied a screenshot").
- Multi-image paste (e.g., a screenshot grid copied from Finder) → fans out to
  N `addImage` calls, serialized via §3.2.

---

## 4. Errors, quota, and edge cases

### 4.1 Form-level errors

`addImage` surfaces a transient banner inside the gallery:

| Cause | Banner copy |
|---|---|
| `validateImageBlob` → too-big | *"Image rejected: max 5 MB."* |
| `validateImageBlob` → wrong-mime | *"Only PNG, JPEG, WebP, and GIF are supported."* |
| `decodeImageDimensions` throws | *"Couldn't read image."* |
| Dexie `QuotaExceededError` | *"Out of browser storage. Try removing old screenshots or wallets."* |
| Per-entry cap (10) reached | *"Up to 10 images per entry."* |

The banner clears on the next successful add or after ~5 seconds. State is
component-local, never persisted. Form data is untouched on any of these.

### 4.2 Import path

`applyMerge` already runs in a single `db.transaction('rw', ...)` (verified in
`src/lib/storage/import-repo.ts`). Session 7f extends the transaction scope to
include `db.images` and adds one more `bulkPut`. A `QuotaExceededError`
mid-import aborts the entire merge transaction; the user sees a single
"Import failed: storage full" message; no partial-import limbo.

### 4.3 Missing-image render

`useJournalImage(id)` returning `null` (image row missing — partial import,
manual DB edit, etc.) → `ImageGallery` renders a fixed-size placeholder tile
labelled *"image unavailable"* with a small `✕` to drop the dangling id from
`imageIds`. Mirrors how Session 7d handles orphan strategy ids.

### 4.4 Strategy form layout

The strategy form's existing free-text `examples` field stays. The image
gallery sits directly below `examples` so they read together — text describes
the example, gallery shows it. No re-wiring of the existing field.

### 4.5 Read view = form view

TradeDetail / DayDetail / StrategyDetail render the same form component for
both read and edit modes (existing pattern). `ImageGallery` therefore serves
both surfaces with no separate read-only variant.

### 4.6 Reduced motion

Thumbnail entry/exit transitions are gated on `useReducedMotion()`. The
placeholder-tile fade-in is also gated. Matches the rest of the codebase.

### 4.7 Empty-table export

`buildExport` always emits `images: []` when the table is empty (mirrors how
7e tags always emit `tags: []`). The schema's `.optional()` on `images` is for
parsing pre-7f files, not for omitting on export.

---

## 5. Schema migration & export format

### 5.1 Dexie migration

See §2.1. Additive `version(4)`. No `.upgrade()` body.

### 5.2 Zod schema additions (`src/lib/validation/export.ts`)

```ts
const JournalImageExportSchema = z.object({
  id: z.string().min(1),
  dataUrl: z.string().regex(/^data:image\/(png|jpeg|webp|gif);base64,/),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
  provenance: z.enum(['observed', 'derived', 'inferred', 'unknown']),
});
```

Each `*JournalEntrySchema` gains:

```ts
imageIds: z.array(z.string()).default([]),
```

`ExportDataSchema` gains:

```ts
images: z.array(JournalImageExportSchema).optional(),
```

`formatVersion` stays **`1`**. Pre-7f export files parse cleanly via `.optional()`
and `.default([])`. Lossy-forward, matching 7e tags.

### 5.3 Build / parse pipeline

The `Blob ↔ dataUrl` boundary lives entirely in `lib/storage/`. Domain code
stays pure.

- **`lib/storage/export-repo.ts`** — `readSnapshot()` extended to
  `await db.images.toArray()`, then async-iterate the rows calling
  `blobToDataUrl` per image, returning a snapshot whose `images` field is
  `Array<JournalImageExported>` (already wire-shape). The function was
  already async, so adding a `Promise.all` over the encoding is straight
  extension.
- **`src/domain/export/buildExport.ts`** — pure, synchronous. Receives the
  wire-shape snapshot; passes through `images` (or omits when empty per
  §4.7). No new I/O; no purity violation.
- **`lib/storage/import-repo.ts`** — `applyMerge` extended: for each image
  in `MergeResult.imagesToUpsert`, decode `dataUrl → Blob` via
  `dataUrlToBlob`, then `images.bulkPut(...)`. Fixed-upsert semantics,
  matching the Session 6 import decision. The `db.transaction('rw', ...)`
  scope is extended to include `db.images`.
- **`src/domain/export/mergeImport.ts`** — pure. Receives wire-shape parsed
  input; produces `MergeResult` with `imagesToUpsert` carrying
  `JournalImageExported` rows. Never touches Blob.

### 5.4 Import edge cases

- **Image referenced but not present** in the export → import succeeds; the
  gallery renders the missing-image placeholder per §4.3.
- **Image present but no entry references it** (orphan) → still imported.
  Lossy-forward; user might restore the entry later from another export.
  Cheap; rejecting would be surprising.

### 5.5 Dry-run summary in ImportPanel

The existing `{walletsAdded, walletsUpdated, ...}` summary gains
`imagesAdded` and `imagesUpdated`. One additional row in the dry-run table.
No design surgery.

### 5.6 Provenance preservation

Imported images carry through their original `provenance` field as written.
We do not downgrade `'observed' → 'inferred'` just because data round-tripped.
Same pattern as imported wallets/journal entries.

---

## 6. Defaults and limits

| Default | Value | Rationale |
|---|---|---|
| Per-entry image cap | 10 | Gallery layout breaks down past that |
| Per-image byte cap | 5 MB | Generous for typical screenshots; aggressive ceiling for outliers |
| MIME whitelist | PNG, JPEG, WebP, GIF | Dominant web-image formats; HEIC explicitly rejected |
| Image order | insertion order in `imageIds` | Reorder UI deferred to BACKLOG |
| Save trigger | immediate on add/remove | See §3.1 |
| Cascade | journal entry delete → images deleted | §2.2 |
| Orphan sweep | none in 7f | BACKLOG: optional boot-time sweep |
| Image provenance | `'observed'` | User upload, like journal text |

---

## 7. Testing

### 7.1 Pure helpers (Vitest, `src/lib/images/`)

- `validateImageBlob` — too-big, wrong-mime, all four MIME whitelist members,
  exact-5MB boundary.
- `decodeImageDimensions` — known dimensions returned; corrupt-blob
  rejection. jsdom doesn't provide `createImageBitmap`; a tiny
  `__test_polyfills.ts` wraps `Image()` for the test environment so the tests
  run rather than skip.
- `blobToDataUrl` / `dataUrlToBlob` — round-trip identity for each MIME;
  malformed `dataUrl` rejection.

### 7.2 Repository (Vitest, fake-indexeddb)

- `journal-images-repo` — CRUD coverage on every method.
- Cascade test — `journalEntriesRepo.remove(entryId)` with `imageIds = [a, b]`
  → both rows gone from `images`; orphan reference → no throw.
- Transaction scope on `applyMerge` extension — failing `images.bulkPut`
  rolls back the entire merge (other tables unchanged).

### 7.3 Schema validation (Vitest, `lib/validation/export.ts`)

- `JournalImageExportSchema` accepts valid base64 PNG/JPEG/WebP/GIF; rejects
  malformed `dataUrl`, negative dimensions, mismatched MIME prefix.
- Pre-7f export file (no `images`, no `imageIds`) parses cleanly with
  defaults applied.

### 7.4 Hooks (Vitest + RTL with TanStack Query test wrapper)

- `useJournalImage` — URL produced; `revokeObjectURL` called on unmount and
  id change; multi-consumer share via cache key.
- Per-entry `addImage` / `removeImage` — happy paths, cap-reached,
  wrong-mime, too-big, dexie-quota → form state untouched.
- `useImagePasteHandler` — image item consumed (preventDefault + addImage),
  text-only fallthrough (no preventDefault), mixed-clipboard prefers image,
  multi-image paste fans out and serializes.

### 7.5 Components (Vitest + RTL)

- `ImageUploadButton` — selecting files invokes `addImage` per file;
  multi-select supported; `accept` attribute correct.
- `ImageGallery` — renders N thumbnails; anchor `target="_blank"` and href
  is a blob URL; delete invokes `removeImage`; missing-image placeholder
  when hook returns null; transient error banner appears and clears on next
  success.
- All three form components — image add/remove triggers entry-save with
  dirty text included (§3.1); error states do not clobber form state.

### 7.6 E2E (Playwright, `e2e/images-roundtrip.spec.ts`)

- File-picker upload → save → reload → thumbnail still there.
- Synthesized `ClipboardEvent` paste (via `page.evaluate`) → thumbnail
  appears → save → reload.
- Click thumbnail → assert `target="_blank"` and href is a blob URL (we
  verify the link, not the navigation, since browser-tab assertions are
  host-dependent).
- Delete → save → reload → gone.
- Export → wipe DB → import → all images round-trip.
- Cap behavior: 10 uploads succeed, 11th surfaces banner.
- Wrong MIME: text file pretending to be image → banner.

### 7.7 Test-infra cleanup (deferred from 7c BACKLOG)

The jsdom Blob/URL stubs in `ExportPanel.test.tsx` get factored into
`src/tests/setup.ts`. 7f is the third Blob-using component — three is the
trigger for DRY (per the 7c BACKLOG entry). Saves duplicate setup across the
new image components.

### 7.8 Coverage targets

- `lib/images/` — full path.
- `lib/storage/journal-images-repo.ts` — full path.
- `domain/` — no new code; 90% threshold unchanged.
- Components — RTL behavior coverage; visual rendering edges (thumbnail
  layout) are E2E-only.

### 7.9 End-of-session gauntlet

- `pnpm test` — target ~395 unit tests (up from 360).
- `pnpm test:e2e` — target 14 specs (up from 13).
- `pnpm typecheck` — strict pass.
- `pnpm lint` — no warnings.
- `pnpm build` — production build green.
- Domain coverage holds ≥90%.

---

## 8. Out-of-scope items routed to BACKLOG

These will be added to `docs/BACKLOG.md` under "Session 7f deferrals" at the
end of the implementation session:

- `[next]` Inline lightbox / fullscreen modal — defer until users ask.
- `[maybe]` Drag-and-drop upload affordance.
- `[maybe]` Image reorder UI (drag-to-reorder thumbnails).
- `[maybe]` Auto-compression / lossless WebP re-encoding — for users hitting
  quota.
- `[maybe]` Per-image annotation / caption.
- `[maybe]` ZIP-bundle export format with `JSZip` — for users with
  multi-GB exports.
- `[maybe]` Boot-time orphan-image sweep — pick up rows whose id is in no
  entry's `imageIds`.
- `[maybe]` `navigator.storage.estimate()` UI in Settings — show usage and
  remaining quota.
- `[maybe]` Thumbnail chips on virtualized list surfaces (TradeHistoryList,
  JournalPanel session rows, /strategies rows).
- `[maybe]` Saved-image preview in the ImportPanel dry-run table.
- `[soon]` Quota-pressure copy when fillsCache writes start failing because
  images compete for browser storage. Not 7f-specific but newly relevant.

---

## 9. Acceptance criteria

Implementation is complete when all of the following hold:

1. Dexie schema is at v4 with the new `images` table; existing data migrates
   without `.upgrade()`.
2. All three journal forms support file-picker and Cmd/Ctrl+V paste image
   uploads.
3. Adding or removing an image flushes pending text edits into the same
   transactional save (§3.1).
4. Per-entry cap of 10 and per-image cap of 5 MB are enforced with the copy
   in §4.1.
5. The four MIME types (PNG/JPEG/WebP/GIF) are accepted; HEIC and others are
   rejected.
6. Click-to-open opens a blob URL in a new tab (`target="_blank"`,
   `rel="noopener noreferrer"`).
7. Delete removes the image from the entry's `imageIds` and from the
   `images` table in the same transaction.
8. Cascade-delete: removing a journal entry removes its image rows.
9. Export produces a JSON file with an `images` array of base64 data URLs;
   pre-7f export files still parse cleanly.
10. Import round-trips: export → wipe → import yields the same gallery
    state for every entry.
11. End-of-session gauntlet (§7.9) is green.
12. ADR-0008 is committed under `docs/DECISIONS.md` with status **Accepted**.
13. SESSION_LOG.md and BACKLOG.md updated per CLAUDE.md §5.

---

## 10. Open questions (none)

All architectural and UX choices were resolved during brainstorming. Smaller
implementation-detail decisions (e.g., exact polyfill shape for jsdom
`createImageBitmap`, exact wording of the missing-image placeholder) are left
to the implementation plan.
