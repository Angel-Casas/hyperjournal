# Session 7f — Screenshots / Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-image attachments to all three journal variants (trade, session, strategy) with IndexedDB blob storage, file-picker + paste upload, click-to-open, and base64-embedded JSON export round-trip.

**Architecture:** Separate Dexie `images` table (v4 migration); journal entries reference by `imageIds: ReadonlyArray<string>`. Two image shapes — `JournalImage` (Dexie row, holds `Blob`) vs `JournalImageExported` (wire format, holds `dataUrl: string`). The `Blob ↔ dataUrl` boundary is confined to `lib/storage/`; domain code (`buildExport`, `mergeImport`) stays pure-synchronous per CLAUDE.md §3 rule 2.

**Tech Stack:** TypeScript strict, Dexie 4, Zod 3, TanStack Query 5, React 18, Framer Motion, Vitest, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-25-session-7f-screenshots-design.md` (commit 30314e5).

---

## File Structure

**New files:**

- `src/entities/journal-image.ts` — `JournalImage` (Dexie row) + `JournalImageExported` (wire format).
- `src/lib/images/validateImageBlob.ts` — pure size/MIME validation.
- `src/lib/images/validateImageBlob.test.ts`
- `src/lib/images/dataUrlToBlob.ts` — pure base64 → Blob.
- `src/lib/images/dataUrlToBlob.test.ts`
- `src/lib/images/blobToDataUrl.ts` — async Blob → base64.
- `src/lib/images/blobToDataUrl.test.ts`
- `src/lib/images/decodeImageDimensions.ts` — async dimension extraction with jsdom polyfill.
- `src/lib/images/decodeImageDimensions.test.ts`
- `src/lib/storage/journal-images-repo.ts` — CRUD wrapper over `db.images`.
- `src/lib/storage/journal-images-repo.test.ts`
- `src/features/journal/hooks/useJournalImage.ts` — TanStack-Query keyed blob URL with revoke lifecycle.
- `src/features/journal/hooks/useJournalImage.test.tsx`
- `src/features/journal/hooks/useImagePasteHandler.ts` — paste-event handler factory.
- `src/features/journal/hooks/useImagePasteHandler.test.tsx`
- `src/features/journal/components/ImageUploadButton.tsx` — file-picker button.
- `src/features/journal/components/ImageUploadButton.test.tsx`
- `src/features/journal/components/ImageGallery.tsx` — thumbnail strip with delete + click-to-open + missing-image placeholder.
- `src/features/journal/components/ImageGallery.test.tsx`
- `e2e/images-roundtrip.spec.ts` — Playwright E2E.

**Modified files:**

- `src/entities/journal-entry.ts` — add `imageIds: ReadonlyArray<string>` to all three variants.
- `src/entities/export.ts` — extend `ExportSnapshot`, `ExportData`, `MergeResult`.
- `src/lib/storage/db.ts` — Dexie v4 migration (add `images` table).
- `src/lib/storage/journal-entries-repo.ts` — extend `remove()` cascade.
- `src/lib/storage/export-repo.ts` — `readSnapshot()` encodes images to dataUrl.
- `src/lib/storage/import-repo.ts` — `applyMerge()` decodes dataUrl, extends transaction scope.
- `src/lib/validation/export.ts` — add `JournalImageExportSchema`, extend each variant with `imageIds.default([])`.
- `src/domain/export/buildExport.ts` — passthrough images.
- `src/domain/export/buildExport.test.ts` — cover passthrough.
- `src/domain/export/mergeImport.ts` — pull `imagesToUpsert` from incoming.
- `src/domain/export/mergeImport.test.ts` — cover image merge.
- `src/features/journal/hooks/useTradeJournalEntry.ts` — `addImage` / `removeImage` actions.
- `src/features/journal/hooks/useTradeJournalEntry.test.tsx`
- `src/features/journal/hooks/useSessionJournalEntry.ts` — same.
- `src/features/journal/hooks/useSessionJournalEntry.test.tsx`
- `src/features/journal/hooks/useStrategyEntry.ts` — same.
- `src/features/journal/hooks/useStrategyEntry.test.tsx`
- `src/features/journal/components/TradeJournalForm.tsx` — wire `ImageUploadButton` + `ImageGallery` + paste handler.
- `src/features/journal/components/TradeJournalForm.test.tsx`
- `src/features/journal/components/SessionJournalForm.tsx` — same.
- `src/features/journal/components/SessionJournalForm.test.tsx`
- `src/features/journal/components/StrategyJournalForm.tsx` — same.
- `src/features/journal/components/StrategyJournalForm.test.tsx`
- `src/app/settings/ImportPanel.tsx` — render `imagesAdded` / `imagesUpdated` row.
- `src/app/settings/ImportPanel.test.tsx`
- `src/app/settings/ExportPanel.tsx` — count images in summary if shown.
- `src/tests/setup.ts` — factor in jsdom Blob/URL stubs (deferred from 7c BACKLOG).
- `docs/DECISIONS.md` — append ADR-0008.
- `docs/SESSION_LOG.md` — append Session 7f entry.
- `docs/BACKLOG.md` — Session 7f deferrals + flip "[next] Screenshots — 7e/7f" to done.
- `docs/CONVENTIONS.md` — only if a new pattern emerges (entry-hook image action shape).

---

## Phases & Checkpoints

The plan is structured in 9 phases. Each phase ends with a natural checkpoint where the implementer can pause, run the gauntlet, and reset context.

- **Phase 1** — Pure helpers (T1–T4)
- **Phase 2** — Entities & schemas (T5–T8)
- **Phase 3** — Storage (T9–T11)
- **Phase 4** — Export/Import pipeline (T12–T16)
- **Phase 5** — Hooks (T17–T21)
- **Phase 6** — UI components (T22–T24)
- **Phase 7** — Form integration (T25–T27)
- **Phase 8** — E2E + final gauntlet (T28–T29)
- **Phase 9** — Documentation (T30–T31)

---

# Phase 1 — Pure helpers (T1–T4)

No Dexie, no React. Land the pure validation/encoding/decoding layer first so every later task has stable primitives to lean on.

---

### Task 1: `validateImageBlob`

**Files:**
- Create: `src/lib/images/validateImageBlob.ts`
- Test: `src/lib/images/validateImageBlob.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/images/validateImageBlob.test.ts
import { describe, expect, it } from 'vitest';
import { validateImageBlob, MAX_BYTES, ALLOWED_MIMES } from './validateImageBlob';

function makeBlob(size: number, type: string): Blob {
  return new Blob([new Uint8Array(size)], { type });
}

describe('validateImageBlob', () => {
  it('accepts each whitelisted MIME', () => {
    for (const mime of ALLOWED_MIMES) {
      expect(validateImageBlob(makeBlob(100, mime))).toEqual({ ok: true });
    }
  });

  it('rejects an unsupported MIME', () => {
    expect(validateImageBlob(makeBlob(100, 'image/heic'))).toEqual({
      ok: false,
      reason: 'wrong-mime',
    });
  });

  it('rejects a blob over MAX_BYTES', () => {
    expect(validateImageBlob(makeBlob(MAX_BYTES + 1, 'image/png'))).toEqual({
      ok: false,
      reason: 'too-big',
    });
  });

  it('accepts a blob exactly at MAX_BYTES', () => {
    expect(validateImageBlob(makeBlob(MAX_BYTES, 'image/png'))).toEqual({
      ok: true,
    });
  });

  it('rejects a zero-byte blob', () => {
    expect(validateImageBlob(makeBlob(0, 'image/png'))).toEqual({
      ok: false,
      reason: 'too-big', // empty == invalid; collapsed under same banner
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test src/lib/images/validateImageBlob.test.ts
```

Expected: FAIL with module-not-found / `validateImageBlob is not defined`.

- [ ] **Step 3: Implement**

```ts
// src/lib/images/validateImageBlob.ts
export const ALLOWED_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export type AllowedMime = (typeof ALLOWED_MIMES)[number];

export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export type ValidateResult =
  | { ok: true }
  | { ok: false; reason: 'too-big' | 'wrong-mime' };

export function validateImageBlob(blob: Blob): ValidateResult {
  if (!ALLOWED_MIMES.includes(blob.type as AllowedMime)) {
    return { ok: false, reason: 'wrong-mime' };
  }
  if (blob.size === 0 || blob.size > MAX_BYTES) {
    return { ok: false, reason: 'too-big' };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test src/lib/images/validateImageBlob.test.ts
```

Expected: 5 passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/images/validateImageBlob.ts src/lib/images/validateImageBlob.test.ts
git commit -m "$(cat <<'EOF'
feat(images): add validateImageBlob pure helper

5MB cap, four-MIME whitelist (PNG/JPEG/WebP/GIF). Returns a discriminated
result usable for both form-banner copy and unit assertions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `dataUrlToBlob`

**Files:**
- Create: `src/lib/images/dataUrlToBlob.ts`
- Test: `src/lib/images/dataUrlToBlob.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/images/dataUrlToBlob.test.ts
import { describe, expect, it } from 'vitest';
import { dataUrlToBlob } from './dataUrlToBlob';

// 1×1 transparent PNG
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=';

describe('dataUrlToBlob', () => {
  it('decodes a valid PNG data URL into a Blob', () => {
    const blob = dataUrlToBlob(TINY_PNG_DATA_URL);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('throws on a missing "data:" prefix', () => {
    expect(() => dataUrlToBlob('not-a-data-url')).toThrow(/malformed/i);
  });

  it('throws on a missing ";base64," marker', () => {
    expect(() => dataUrlToBlob('data:image/png,xxxxx')).toThrow(/malformed/i);
  });

  it('throws on an unknown MIME', () => {
    expect(() => dataUrlToBlob('data:image/heic;base64,AAAA')).toThrow(/mime/i);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm test src/lib/images/dataUrlToBlob.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/images/dataUrlToBlob.ts
import { ALLOWED_MIMES, type AllowedMime } from './validateImageBlob';

const PATTERN = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/;

export function dataUrlToBlob(dataUrl: string): Blob {
  const match = PATTERN.exec(dataUrl);
  if (!match) {
    if (!dataUrl.startsWith('data:')) {
      throw new Error('malformed data URL: missing "data:" prefix');
    }
    if (!dataUrl.includes(';base64,')) {
      throw new Error('malformed data URL: missing ";base64," marker');
    }
    throw new Error('malformed data URL: unsupported MIME');
  }
  const mime = match[1] as AllowedMime;
  if (!ALLOWED_MIMES.includes(mime)) {
    throw new Error(`malformed data URL: MIME "${mime}" not allowed`);
  }
  const base64 = match[2]!;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test src/lib/images/dataUrlToBlob.test.ts
```

Expected: 4 passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/images/dataUrlToBlob.ts src/lib/images/dataUrlToBlob.test.ts
git commit -m "$(cat <<'EOF'
feat(images): add dataUrlToBlob pure helper

Decodes a base64 data URL into a Blob, rejecting malformed input and
non-whitelisted MIMEs. Used on the import path to revive wire-format
images into Dexie row Blobs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `blobToDataUrl`

**Files:**
- Create: `src/lib/images/blobToDataUrl.ts`
- Test: `src/lib/images/blobToDataUrl.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/images/blobToDataUrl.test.ts
import { describe, expect, it } from 'vitest';
import { blobToDataUrl } from './blobToDataUrl';
import { dataUrlToBlob } from './dataUrlToBlob';

describe('blobToDataUrl', () => {
  it('encodes a PNG blob to a base64 data URL', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
    const url = await blobToDataUrl(blob);
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('round-trips through dataUrlToBlob preserving bytes and MIME', async () => {
    const original = new Blob([new Uint8Array([10, 20, 30, 40, 50])], {
      type: 'image/jpeg',
    });
    const url = await blobToDataUrl(original);
    const restored = dataUrlToBlob(url);
    expect(restored.type).toBe('image/jpeg');
    expect(restored.size).toBe(original.size);
    const a = new Uint8Array(await original.arrayBuffer());
    const b = new Uint8Array(await restored.arrayBuffer());
    expect(Array.from(b)).toEqual(Array.from(a));
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm test src/lib/images/blobToDataUrl.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/images/blobToDataUrl.ts
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader returned non-string result'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test src/lib/images/blobToDataUrl.test.ts
```

Expected: 2 passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/images/blobToDataUrl.ts src/lib/images/blobToDataUrl.test.ts
git commit -m "$(cat <<'EOF'
feat(images): add blobToDataUrl async helper

FileReader-based base64 encoding. Round-trips with dataUrlToBlob (verified
in test). Used on the export path to materialize images for the JSON wire
format.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `decodeImageDimensions` with jsdom polyfill

**Files:**
- Create: `src/lib/images/decodeImageDimensions.ts`
- Test: `src/lib/images/decodeImageDimensions.test.ts`

jsdom does not provide `createImageBitmap`. The implementation prefers
`createImageBitmap` when available (real browsers, Playwright) and falls
back to an `Image()`-element decoder so the unit tests run in jsdom.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/images/decodeImageDimensions.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeImageDimensions } from './decodeImageDimensions';

// 2×3 valid PNG (raw bytes shaped via canvas for simplicity in jsdom).
// We patch the Image() element in jsdom to resolve with controlled width/height.
class FakeImage {
  width = 0;
  height = 0;
  src = '';
  onload: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  addEventListener(type: string, fn: () => void) {
    if (type === 'load') this.onload = fn;
    if (type === 'error') this.onerror = fn as () => void;
  }
  removeEventListener(): void {}
}

let originalImage: typeof Image;
let originalCIB: typeof createImageBitmap | undefined;

beforeEach(() => {
  originalImage = globalThis.Image;
  originalCIB = (globalThis as { createImageBitmap?: typeof createImageBitmap })
    .createImageBitmap;
  // Force the Image() fallback path for deterministic jsdom tests.
  (globalThis as { createImageBitmap?: typeof createImageBitmap }).createImageBitmap =
    undefined;
});

afterEach(() => {
  globalThis.Image = originalImage;
  (globalThis as { createImageBitmap?: typeof createImageBitmap }).createImageBitmap =
    originalCIB;
  vi.restoreAllMocks();
});

describe('decodeImageDimensions', () => {
  it('returns width and height via the Image() fallback', async () => {
    const fakes: FakeImage[] = [];
    globalThis.Image = vi.fn(() => {
      const img = new FakeImage();
      fakes.push(img);
      return img;
    }) as unknown as typeof Image;

    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
    const promise = decodeImageDimensions(blob);

    // Drive the fake image to "load" with set dimensions.
    const img = fakes[0]!;
    img.width = 640;
    img.height = 480;
    img.onload?.();

    await expect(promise).resolves.toEqual({ width: 640, height: 480 });
  });

  it('rejects when the Image() element errors', async () => {
    const fakes: FakeImage[] = [];
    globalThis.Image = vi.fn(() => {
      const img = new FakeImage();
      fakes.push(img);
      return img;
    }) as unknown as typeof Image;

    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
    const promise = decodeImageDimensions(blob);
    const img = fakes[0]!;
    img.onerror?.(new Event('error'));

    await expect(promise).rejects.toThrow(/decode/i);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm test src/lib/images/decodeImageDimensions.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/images/decodeImageDimensions.ts
export type ImageDimensions = { width: number; height: number };

export async function decodeImageDimensions(blob: Blob): Promise<ImageDimensions> {
  const cib = (globalThis as { createImageBitmap?: typeof createImageBitmap })
    .createImageBitmap;
  if (typeof cib === 'function') {
    const bitmap = await cib(blob);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close?.();
    }
  }
  return await decodeViaImageElement(blob);
}

function decodeViaImageElement(blob: Blob): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    const cleanup = () => {
      URL.revokeObjectURL(url);
    };
    img.addEventListener('load', () => {
      const dims = { width: img.width, height: img.height };
      cleanup();
      resolve(dims);
    });
    img.addEventListener('error', () => {
      cleanup();
      reject(new Error("couldn't decode image dimensions"));
    });
    img.src = url;
  });
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test src/lib/images/decodeImageDimensions.test.ts
```

Expected: 2 passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/images/decodeImageDimensions.ts src/lib/images/decodeImageDimensions.test.ts
git commit -m "$(cat <<'EOF'
feat(images): add decodeImageDimensions with Image() fallback

Prefers createImageBitmap (browsers) and falls back to an Image() element
decoder so unit tests run in jsdom. Rejects on decode failure with a
banner-friendly error message.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

**Checkpoint 1 — Phase 1 complete.** Run `pnpm test src/lib/images/` to confirm 11+ assertions pass; no type errors.

---

# Phase 2 — Entities & schemas (T5–T8)

Land the type and schema additions. No runtime behavior changes; this
phase is type-side only and must be green at every step.

---

### Task 5: `JournalImage` and `JournalImageExported` entities

**Files:**
- Create: `src/entities/journal-image.ts`

- [ ] **Step 1: Create the entity file**

```ts
// src/entities/journal-image.ts
import type { Provenance } from './provenance';

export type JournalImageMime =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/gif';

/**
 * Dexie row shape. Only crosses the `lib/storage` boundary in this form;
 * everywhere else (domain, exports, hooks, components) sees
 * JournalImageExported.
 */
export type JournalImage = {
  readonly id: string;
  readonly blob: Blob;
  readonly mime: JournalImageMime;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly createdAt: number;
  readonly provenance: Provenance;
};

/**
 * Wire-format shape used in ExportSnapshot, ExportData, MergeResult, and
 * the JSON file. Domain code (buildExport, mergeImport) is pure-sync per
 * CLAUDE.md §3 rule 2; encoding to base64 is async I/O via FileReader,
 * so we materialize this shape at the lib/storage boundary.
 */
export type JournalImageExported = {
  readonly id: string;
  readonly dataUrl: string;
  readonly mime: JournalImageMime;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly createdAt: number;
  readonly provenance: Provenance;
};
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/entities/journal-image.ts
git commit -m "$(cat <<'EOF'
feat(entities): add JournalImage and JournalImageExported types

Two-shape split: JournalImage (Dexie row, Blob) for storage; exported
variant (dataUrl: string) for everywhere outside lib/storage. See ADR-0008.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Extend `JournalEntry` variants with `imageIds`

**Files:**
- Modify: `src/entities/journal-entry.ts`

- [ ] **Step 1: Add `imageIds` to all three variant types**

In `src/entities/journal-entry.ts`, add this field to **each** of `TradeJournalEntry`, `SessionJournalEntry`, `StrategyJournalEntry`:

```ts
  /**
   * UUIDs of attached JournalImage rows. Introduced in Session 7f.
   * Pre-7f rows may carry `undefined`; consumers treat `undefined` as
   * `[]`. Next upsert writes `[]` explicitly. Mirrors the 7e tags pattern.
   */
  readonly imageIds: ReadonlyArray<string>;
```

Place it adjacent to the `tags` field so each variant's image-related state stays grouped.

- [ ] **Step 2: Update the union doc-comment**

Replace the existing `Discriminated union ...` doc-comment for `JournalEntry` to drop the now-stale "Session 7d will extend this union with image-attachment variants" and replace with: "Session 7f added imageIds; cross-cut, not per-variant."

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: many errors — every place that constructs a journal entry now needs `imageIds`. **Do not fix yet.** The next step uses these errors as a checklist.

- [ ] **Step 4: Add `imageIds: []` to every entry literal in the codebase**

Run:

```bash
pnpm typecheck 2>&1 | grep -E "Property 'imageIds' is missing|TS2741.*imageIds" | head -50
```

For each file the typecheck flags, add `imageIds: []` (or `imageIds: entry.imageIds ?? []` where coercing from a possibly-pre-7f row). Likely sites:

- All three form components' `commit()` builders
- Test fixtures in `src/lib/storage/journal-entries-repo.test.ts`
- Test fixtures in `src/domain/export/buildExport.test.ts`
- Test fixtures in `src/domain/export/mergeImport.test.ts`
- Test fixtures in `src/lib/storage/import-repo.test.ts`
- Test fixtures in `src/lib/storage/export-repo.test.ts`
- Any `entryToDraft` / `draftToEntry` helpers across the three forms

After each edit, re-run `pnpm typecheck` and continue until clean.

- [ ] **Step 5: Run typecheck and tests**

```bash
pnpm typecheck && pnpm test
```

Expected: clean typecheck, all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/entities/journal-entry.ts src/features/journal/components/ src/lib/storage/ src/domain/export/
git commit -m "$(cat <<'EOF'
feat(entities): add imageIds to journal entry variants

All three JournalEntry variants gain readonly imageIds. Pre-7f rows may
carry undefined; coerce via `entry.imageIds ?? []` at the form layer.
Mirrors the 7e tags pattern.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Extend `ExportSnapshot`, `ExportData`, `MergeResult`

**Files:**
- Modify: `src/entities/export.ts`

- [ ] **Step 1: Add image fields**

Edit `src/entities/export.ts`:

1. Add an import: `import type { JournalImageExported } from './journal-image';`
2. Add to `ExportSnapshot`:
   ```ts
   readonly images: Array<JournalImageExported>;
   ```
3. Add to `ExportData`:
   ```ts
   readonly images?: Array<JournalImageExported> | undefined;
   ```
4. Add to `MergeResult`:
   ```ts
   readonly imagesToUpsert: Array<JournalImageExported>;
   ```
5. Extend `MergeResult.summary`:
   ```ts
   readonly imagesAdded: number;
   readonly imagesUpdated: number;
   ```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: errors in `mergeImport.ts`, `buildExport.ts`, `export-repo.ts`, `import-repo.ts`, and their tests for missing `images` / `imagesToUpsert` / `imagesAdded` / `imagesUpdated`.

- [ ] **Step 3: Stub the missing fields with empty defaults**

This is a temporary scaffold so the codebase typechecks while later tasks (T12–T15) land the real logic.

In `src/lib/storage/export-repo.ts`, add `images: []` to the returned snapshot.

In `src/domain/export/buildExport.ts`, the function builds `data` — leave `images` off (it's optional). No change needed.

In `src/domain/export/mergeImport.ts`, add to the returned `MergeResult`:
```ts
imagesToUpsert: incoming.data.images ?? [],
summary: {
  ...,
  imagesAdded: 0,
  imagesUpdated: 0,
},
```

In `src/lib/storage/import-repo.ts`, the function only reads `result.walletsToUpsert` etc. — it doesn't consume `imagesToUpsert` yet. Leave it; T15 wires it up.

In any test that constructs an `ExportSnapshot` literal, add `images: []`. In tests constructing `MergeResult.summary`, add `imagesAdded: 0, imagesUpdated: 0`.

- [ ] **Step 4: Run typecheck and tests**

```bash
pnpm typecheck && pnpm test
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/entities/export.ts src/lib/storage/ src/domain/export/
git commit -m "$(cat <<'EOF'
feat(entities): extend Export types with images

ExportSnapshot.images, ExportData.images?, MergeResult.imagesToUpsert and
.summary.{imagesAdded,imagesUpdated}. Empty stubs through the pipeline;
T12–T15 wire real values.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Extend Zod schema in `lib/validation/export.ts`

**Files:**
- Modify: `src/lib/validation/export.ts`

- [ ] **Step 1: Add `JournalImageExportSchema` and wire it into `ExportDataSchema`**

Edit `src/lib/validation/export.ts`. Add this near the other schemas (above `JournalEntrySchema`):

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

In each of `TradeJournalEntrySchema`, `SessionJournalEntrySchema`, `StrategyJournalEntrySchema`, add:

```ts
imageIds: z.array(z.string()).default([]),
```

In `ExportDataSchema`, add:

```ts
images: z.array(JournalImageExportSchema).optional(),
```

- [ ] **Step 2: Add validation tests**

In `src/lib/validation/export.test.ts` (file may need to be created if it doesn't exist — check first), append:

```ts
describe('JournalImageExportSchema (Session 7f)', () => {
  const valid = {
    id: 'img-1',
    dataUrl: 'data:image/png;base64,AAAA',
    mime: 'image/png' as const,
    width: 100,
    height: 100,
    bytes: 1234,
    createdAt: 0,
    provenance: 'observed' as const,
  };

  it('parses a valid image entry', () => {
    expect(() =>
      ExportFileSchema.parse({
        app: 'HyperJournal',
        formatVersion: 1,
        exportedAt: 0,
        data: { wallets: [], userSettings: null, images: [valid] },
      }),
    ).not.toThrow();
  });

  it('rejects malformed dataUrl', () => {
    expect(() =>
      ExportFileSchema.parse({
        app: 'HyperJournal',
        formatVersion: 1,
        exportedAt: 0,
        data: {
          wallets: [],
          userSettings: null,
          images: [{ ...valid, dataUrl: 'not-a-data-url' }],
        },
      }),
    ).toThrow();
  });

  it('rejects negative dimensions', () => {
    expect(() =>
      ExportFileSchema.parse({
        app: 'HyperJournal',
        formatVersion: 1,
        exportedAt: 0,
        data: {
          wallets: [],
          userSettings: null,
          images: [{ ...valid, width: -1 }],
        },
      }),
    ).toThrow();
  });

  it('parses a pre-7f file with no images key', () => {
    expect(() =>
      ExportFileSchema.parse({
        app: 'HyperJournal',
        formatVersion: 1,
        exportedAt: 0,
        data: { wallets: [], userSettings: null },
      }),
    ).not.toThrow();
  });

  it('parses a pre-7f journal entry with no imageIds', () => {
    expect(() =>
      ExportFileSchema.parse({
        app: 'HyperJournal',
        formatVersion: 1,
        exportedAt: 0,
        data: {
          wallets: [],
          userSettings: null,
          journalEntries: [
            {
              id: 'e1',
              scope: 'trade',
              tradeId: 't1',
              createdAt: 0,
              updatedAt: 0,
              preTradeThesis: '',
              postTradeReview: '',
              lessonLearned: '',
              mood: null,
              planFollowed: null,
              stopLossUsed: null,
              strategyId: null,
              tags: [],
              provenance: 'observed',
            },
          ],
        },
      }),
    ).not.toThrow();
  });
});
```

If `src/lib/validation/export.test.ts` does not exist, locate the existing tests with:

```bash
find src/lib/validation -name "*.test.ts"
```

and append to the matching file (e.g., `export.test.ts` adjacent to the schema).

- [ ] **Step 3: Run typecheck and the validation tests**

```bash
pnpm typecheck && pnpm test src/lib/validation/
```

Expected: green. The `_schemaCheck` const at the bottom of `export.ts` will need to compile — Zod's inferred output for the new `images` array should match `ExportFile['data']['images']`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/validation/export.ts src/lib/validation/export.test.ts
git commit -m "$(cat <<'EOF'
feat(validation): extend export schema with imageIds and images

JournalImageExportSchema validates wire-format images. Each variant gains
imageIds.default([]); ExportDataSchema gains optional images. formatVersion
stays 1 — pre-7f files parse cleanly via .optional() and .default([]).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

**Checkpoint 2 — Phase 2 complete.** `pnpm typecheck && pnpm test` green; no behavior change in production paths yet. Pre-7f export files still parse.

---

# Phase 3 — Storage (T9–T11)

---

### Task 9: Dexie v4 migration — add `images` table

**Files:**
- Modify: `src/lib/storage/db.ts`

- [ ] **Step 1: Add the v4 store definition**

Edit `src/lib/storage/db.ts`. Add a typed import and field:

```ts
import type { JournalImage } from '@entities/journal-image';

export type { JournalImage } from '@entities/journal-image';

export class HyperJournalDb extends Dexie {
  wallets!: EntityTable<Wallet, 'address'>;
  fillsCache!: EntityTable<FillsCacheEntry, 'address'>;
  userSettings!: EntityTable<UserSettings, 'key'>;
  journalEntries!: EntityTable<JournalEntry, 'id'>;
  images!: EntityTable<JournalImage, 'id'>;
  // ...constructor below
```

And in the constructor, add:

```ts
this.version(4).stores({
  wallets: '&address, addedAt',
  fillsCache: '&address, fetchedAt',
  userSettings: '&key',
  journalEntries: '&id, tradeId, scope, updatedAt, date',
  images: '&id, createdAt',
});
```

Also extend the `Keys:` doc comment to mention `images: primary key = id (UUID); indexed on createdAt for stable iteration.`

- [ ] **Step 2: Verify migration with a tiny test**

Append to `src/lib/storage/db.test.ts` (create if missing):

```ts
// src/lib/storage/db.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HyperJournalDb } from './db';

describe('HyperJournalDb (v4)', () => {
  let db: HyperJournalDb;

  beforeEach(async () => {
    db = new HyperJournalDb(`db-test-${Math.random().toString(36).slice(2)}`);
    await db.open();
  });

  afterEach(async () => {
    db.close();
  });

  it('exposes the images table', () => {
    expect(db.images).toBeDefined();
  });

  it('round-trips a JournalImage row', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    await db.images.put({
      id: 'img-1',
      blob,
      mime: 'image/png',
      width: 10,
      height: 20,
      bytes: 3,
      createdAt: 0,
      provenance: 'observed',
    });
    const got = await db.images.get('img-1');
    expect(got?.mime).toBe('image/png');
    expect(got?.width).toBe(10);
    expect(got?.blob.size).toBe(3);
  });
});
```

If `db.test.ts` already exists, append the new `describe` block.

- [ ] **Step 3: Run the test**

```bash
pnpm test src/lib/storage/db.test.ts
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/storage/db.ts src/lib/storage/db.test.ts
git commit -m "$(cat <<'EOF'
feat(storage): add Dexie v4 with images table

Additive-only migration; no .upgrade() callback. Primary key id (UUID),
secondary index on createdAt for stable iteration.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: `journal-images-repo`

**Files:**
- Create: `src/lib/storage/journal-images-repo.ts`
- Test: `src/lib/storage/journal-images-repo.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/storage/journal-images-repo.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HyperJournalDb } from './db';
import { createJournalImagesRepo, type JournalImagesRepo } from './journal-images-repo';
import type { JournalImage } from '@entities/journal-image';

let db: HyperJournalDb;
let repo: JournalImagesRepo;

beforeEach(async () => {
  db = new HyperJournalDb(`images-repo-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
  repo = createJournalImagesRepo(db);
});

afterEach(async () => {
  db.close();
});

function makeImage(overrides: Partial<JournalImage> = {}): JournalImage {
  return {
    id: 'img-1',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    mime: 'image/png',
    width: 10,
    height: 10,
    bytes: 3,
    createdAt: 100,
    provenance: 'observed',
    ...overrides,
  };
}

describe('JournalImagesRepo', () => {
  it('create + getById round-trips', async () => {
    await repo.create(makeImage());
    const got = await repo.getById('img-1');
    expect(got?.id).toBe('img-1');
    expect(got?.mime).toBe('image/png');
  });

  it('getById returns null for a missing id', async () => {
    expect(await repo.getById('nope')).toBeNull();
  });

  it('getMany preserves input order and filters missing', async () => {
    await repo.create(makeImage({ id: 'a' }));
    await repo.create(makeImage({ id: 'b' }));
    const got = await repo.getMany(['b', 'missing', 'a']);
    expect(got.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('remove deletes the row', async () => {
    await repo.create(makeImage());
    await repo.remove('img-1');
    expect(await repo.getById('img-1')).toBeNull();
  });

  it('removeMany deletes a list of rows', async () => {
    await repo.create(makeImage({ id: 'a' }));
    await repo.create(makeImage({ id: 'b' }));
    await repo.create(makeImage({ id: 'c' }));
    await repo.removeMany(['a', 'c']);
    expect((await repo.listAll()).map((i) => i.id)).toEqual(['b']);
  });

  it('listAll returns every row', async () => {
    await repo.create(makeImage({ id: 'a' }));
    await repo.create(makeImage({ id: 'b', createdAt: 50 }));
    expect((await repo.listAll()).length).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm test src/lib/storage/journal-images-repo.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/storage/journal-images-repo.ts
import type { JournalImage } from '@entities/journal-image';
import type { HyperJournalDb } from './db';

export type JournalImagesRepo = {
  getById(id: string): Promise<JournalImage | null>;
  getMany(ids: ReadonlyArray<string>): Promise<ReadonlyArray<JournalImage>>;
  create(image: JournalImage): Promise<void>;
  remove(id: string): Promise<void>;
  removeMany(ids: ReadonlyArray<string>): Promise<void>;
  listAll(): Promise<ReadonlyArray<JournalImage>>;
};

/**
 * Repository for journal-attached images. All methods are thin wrappers
 * over `db.images.<op>(...)` so they auto-join an outer Dexie transaction
 * when one is open (used by entry hooks for atomic add/remove + entry
 * upsert; see ADR-0008 / spec §3.1).
 */
export function createJournalImagesRepo(db: HyperJournalDb): JournalImagesRepo {
  return {
    async getById(id) {
      const row = await db.images.get(id);
      return row ?? null;
    },
    async getMany(ids) {
      if (ids.length === 0) return [];
      const rows = await db.images.bulkGet([...ids]);
      return rows.filter((r): r is JournalImage => r !== undefined);
    },
    async create(image) {
      await db.images.put(image);
    },
    async remove(id) {
      await db.images.delete(id);
    },
    async removeMany(ids) {
      if (ids.length === 0) return;
      await db.images.bulkDelete([...ids]);
    },
    async listAll() {
      return db.images.toArray();
    },
  };
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test src/lib/storage/journal-images-repo.test.ts
```

Expected: 6 passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/journal-images-repo.ts src/lib/storage/journal-images-repo.test.ts
git commit -m "$(cat <<'EOF'
feat(storage): add JournalImagesRepo

Thin CRUD wrapper over db.images. Methods auto-join an outer Dexie
transaction when one is open — used by entry hooks for atomic add/remove
+ entry upsert.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Cascade-delete on `journal-entries-repo.remove`

**Files:**
- Modify: `src/lib/storage/journal-entries-repo.ts`
- Modify: `src/lib/storage/journal-entries-repo.test.ts`

- [ ] **Step 1: Add the failing cascade test**

Append to `src/lib/storage/journal-entries-repo.test.ts`:

```ts
describe('cascade delete (Session 7f)', () => {
  it('removes the entry and its imageIds in one transaction', async () => {
    const repo = createJournalEntriesRepo(db);
    await db.images.bulkPut([
      {
        id: 'img-a',
        blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
        mime: 'image/png',
        width: 1,
        height: 1,
        bytes: 1,
        createdAt: 0,
        provenance: 'observed',
      },
      {
        id: 'img-b',
        blob: new Blob([new Uint8Array([2])], { type: 'image/png' }),
        mime: 'image/png',
        width: 1,
        height: 1,
        bytes: 1,
        createdAt: 0,
        provenance: 'observed',
      },
    ]);

    await repo.upsert(makeTradeEntry({ id: 'e1', imageIds: ['img-a', 'img-b'] }));
    await repo.remove('e1');

    expect(await db.images.get('img-a')).toBeUndefined();
    expect(await db.images.get('img-b')).toBeUndefined();
    expect(await db.journalEntries.get('e1')).toBeUndefined();
  });

  it('does not throw when an imageId references a missing image row', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeTradeEntry({ id: 'e2', imageIds: ['missing'] }));
    await expect(repo.remove('e2')).resolves.toBeUndefined();
  });

  it('handles entries with empty imageIds array', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeTradeEntry({ id: 'e3', imageIds: [] }));
    await expect(repo.remove('e3')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm test src/lib/storage/journal-entries-repo.test.ts
```

Expected: FAIL on `cascade` cases (rows still present).

- [ ] **Step 3: Implement the cascade**

In `src/lib/storage/journal-entries-repo.ts`, replace the `remove` method:

```ts
async remove(id) {
  await db.transaction('rw', db.journalEntries, db.images, async () => {
    const entry = await db.journalEntries.get(id);
    const imageIds = entry?.imageIds ?? [];
    await db.journalEntries.delete(id);
    if (imageIds.length > 0) {
      await db.images.bulkDelete([...imageIds]);
    }
  });
},
```

- [ ] **Step 4: Run the tests**

```bash
pnpm test src/lib/storage/journal-entries-repo.test.ts
```

Expected: green, including the three new cascade cases plus all prior cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/journal-entries-repo.ts src/lib/storage/journal-entries-repo.test.ts
git commit -m "$(cat <<'EOF'
feat(storage): cascade delete journal images on entry remove

journalEntriesRepo.remove now opens a transaction across journalEntries
and images, reads the entry's imageIds, and bulkDelete's them alongside
the entry. Race-safe; tolerant of orphan ids.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

**Checkpoint 3 — Phase 3 complete.** Storage layer is image-aware. Next phase wires the export/import pipeline.

---

# Phase 4 — Export / Import pipeline (T12–T16)

---

### Task 12: `export-repo.readSnapshot` encodes images

**Files:**
- Modify: `src/lib/storage/export-repo.ts`
- Modify: `src/lib/storage/export-repo.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `src/lib/storage/export-repo.test.ts`:

```ts
describe('image export (Session 7f)', () => {
  it('emits images: [] when the table is empty', async () => {
    const repo = createExportRepo(db);
    const snap = await repo.readSnapshot();
    expect(snap.images).toEqual([]);
  });

  it('encodes Blob images to base64 dataUrls', async () => {
    const blob = new Blob([new Uint8Array([10, 20, 30])], { type: 'image/png' });
    await db.images.put({
      id: 'img-1',
      blob,
      mime: 'image/png',
      width: 1,
      height: 1,
      bytes: 3,
      createdAt: 0,
      provenance: 'observed',
    });
    const repo = createExportRepo(db);
    const snap = await repo.readSnapshot();
    expect(snap.images).toHaveLength(1);
    expect(snap.images[0]!.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(snap.images[0]!.id).toBe('img-1');
    expect(snap.images[0]!.mime).toBe('image/png');
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm test src/lib/storage/export-repo.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/lib/storage/export-repo.ts`:

```ts
import type { ExportSnapshot } from '@entities/export';
import type { JournalImageExported } from '@entities/journal-image';
import { blobToDataUrl } from '@lib/images/blobToDataUrl';
import type { HyperJournalDb } from './db';

export type ExportRepo = {
  readSnapshot(): Promise<ExportSnapshot>;
};

export function createExportRepo(db: HyperJournalDb): ExportRepo {
  return {
    async readSnapshot() {
      const [wallets, userSettings, fillsCache, journalEntries, imageRows] =
        await Promise.all([
          db.wallets.toArray(),
          db.userSettings.get('singleton'),
          db.fillsCache.toArray(),
          db.journalEntries.toArray(),
          db.images.toArray(),
        ]);
      const images: Array<JournalImageExported> = await Promise.all(
        imageRows.map(async (row) => ({
          id: row.id,
          dataUrl: await blobToDataUrl(row.blob),
          mime: row.mime,
          width: row.width,
          height: row.height,
          bytes: row.bytes,
          createdAt: row.createdAt,
          provenance: row.provenance,
        })),
      );
      return {
        wallets,
        userSettings: userSettings ?? null,
        fillsCache,
        journalEntries,
        images,
      };
    },
  };
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test src/lib/storage/export-repo.test.ts
```

Expected: green (new + existing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/export-repo.ts src/lib/storage/export-repo.test.ts
git commit -m "$(cat <<'EOF'
feat(storage): export-repo encodes images to dataUrl

readSnapshot returns wire-format images via blobToDataUrl. Domain
buildExport stays pure-sync; the encoding boundary lives in lib/storage.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: `buildExport` passthrough

**Files:**
- Modify: `src/domain/export/buildExport.ts`
- Modify: `src/domain/export/buildExport.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `src/domain/export/buildExport.test.ts`:

```ts
describe('images passthrough (Session 7f)', () => {
  it('emits images: [] when the snapshot has no images', () => {
    const file = buildExport(
      {
        wallets: [],
        userSettings: null,
        fillsCache: [],
        journalEntries: [],
        images: [],
      },
      { includeCache: false, now: 0 },
    );
    expect(file.data.images).toEqual([]);
  });

  it('passes images through unchanged', () => {
    const img = {
      id: 'img-1',
      dataUrl: 'data:image/png;base64,AAAA',
      mime: 'image/png' as const,
      width: 1,
      height: 1,
      bytes: 1,
      createdAt: 0,
      provenance: 'observed' as const,
    };
    const file = buildExport(
      {
        wallets: [],
        userSettings: null,
        fillsCache: [],
        journalEntries: [],
        images: [img],
      },
      { includeCache: false, now: 0 },
    );
    expect(file.data.images).toEqual([img]);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm test src/domain/export/buildExport.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/domain/export/buildExport.ts`, the function builds `data`. Update both branches to include `images`:

```ts
const data: ExportData = options.includeCache
  ? {
      wallets: snapshot.wallets,
      userSettings: snapshot.userSettings,
      fillsCache: snapshot.fillsCache,
      journalEntries: snapshot.journalEntries,
      images: snapshot.images,
    }
  : {
      wallets: snapshot.wallets,
      userSettings: snapshot.userSettings,
      journalEntries: snapshot.journalEntries,
      images: snapshot.images,
    };
```

- [ ] **Step 4: Run the test**

```bash
pnpm test src/domain/export/buildExport.test.ts
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/export/buildExport.ts src/domain/export/buildExport.test.ts
git commit -m "$(cat <<'EOF'
feat(domain/export): passthrough images in buildExport

Pure passthrough — function stays sync per CLAUDE.md §3 rule 2. Always
emits images, including [] when the snapshot's array is empty.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: `mergeImport` collects images

**Files:**
- Modify: `src/domain/export/mergeImport.ts`
- Modify: `src/domain/export/mergeImport.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `src/domain/export/mergeImport.test.ts`:

```ts
describe('images merge (Session 7f)', () => {
  const makeFile = (images: Array<JournalImageExported>) => ({
    app: 'HyperJournal' as const,
    formatVersion: 1 as const,
    exportedAt: 0,
    data: {
      wallets: [],
      userSettings: null,
      images,
    },
  });

  const sampleImage: JournalImageExported = {
    id: 'img-1',
    dataUrl: 'data:image/png;base64,AAAA',
    mime: 'image/png',
    width: 1,
    height: 1,
    bytes: 1,
    createdAt: 0,
    provenance: 'observed',
  };

  it('collects imagesToUpsert from the incoming file', () => {
    const result = mergeImport(
      {
        wallets: [],
        userSettings: null,
        fillsCache: [],
        journalEntries: [],
        images: [],
      },
      makeFile([sampleImage]),
    );
    expect(result.imagesToUpsert).toEqual([sampleImage]);
  });

  it('counts imagesAdded and imagesUpdated against existing snapshot', () => {
    const result = mergeImport(
      {
        wallets: [],
        userSettings: null,
        fillsCache: [],
        journalEntries: [],
        images: [{ ...sampleImage, id: 'existing' }],
      },
      makeFile([
        { ...sampleImage, id: 'existing' },
        { ...sampleImage, id: 'new' },
      ]),
    );
    expect(result.summary.imagesAdded).toBe(1);
    expect(result.summary.imagesUpdated).toBe(1);
  });

  it('treats a missing data.images key as empty (pre-7f file)', () => {
    const result = mergeImport(
      {
        wallets: [],
        userSettings: null,
        fillsCache: [],
        journalEntries: [],
        images: [],
      },
      {
        app: 'HyperJournal',
        formatVersion: 1,
        exportedAt: 0,
        data: { wallets: [], userSettings: null },
      },
    );
    expect(result.imagesToUpsert).toEqual([]);
    expect(result.summary.imagesAdded).toBe(0);
    expect(result.summary.imagesUpdated).toBe(0);
  });
});
```

(Add a `JournalImageExported` import at top of the file.)

- [ ] **Step 2: Run the test**

```bash
pnpm test src/domain/export/mergeImport.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/domain/export/mergeImport.ts`, after the existing wallets-add/update counting block:

```ts
const incomingImages = incoming.data.images ?? [];
const existingImageIds = new Set(existing.images.map((i) => i.id));
let imagesAdded = 0;
let imagesUpdated = 0;
for (const img of incomingImages) {
  if (existingImageIds.has(img.id)) imagesUpdated += 1;
  else imagesAdded += 1;
}
```

In the returned object, set:

```ts
imagesToUpsert: incomingImages,
summary: {
  // ... existing fields ...
  imagesAdded,
  imagesUpdated,
},
```

- [ ] **Step 4: Run the test**

```bash
pnpm test src/domain/export/mergeImport.test.ts
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/export/mergeImport.ts src/domain/export/mergeImport.test.ts
git commit -m "$(cat <<'EOF'
feat(domain/export): mergeImport handles images

imagesToUpsert collected from incoming.data.images; summary counts
imagesAdded vs imagesUpdated against the existing snapshot. Pre-7f
files (no images key) round-trip as empty.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: `import-repo.applyMerge` decodes and writes images

**Files:**
- Modify: `src/lib/storage/import-repo.ts`
- Modify: `src/lib/storage/import-repo.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `src/lib/storage/import-repo.test.ts`:

```ts
describe('images apply (Session 7f)', () => {
  it('decodes dataUrls and bulkPuts into images table', async () => {
    const repo = createImportRepo(db);
    await repo.applyMerge({
      walletsToUpsert: [],
      userSettingsToOverwrite: null,
      fillsCacheToUpsert: [],
      journalEntriesToUpsert: [],
      imagesToUpsert: [
        {
          id: 'img-1',
          dataUrl: 'data:image/png;base64,AAECAwQ=',
          mime: 'image/png',
          width: 1,
          height: 1,
          bytes: 5,
          createdAt: 0,
          provenance: 'observed',
        },
      ],
      summary: {
        walletsAdded: 0,
        walletsUpdated: 0,
        userSettingsOverwritten: false,
        fillsCacheEntries: 0,
        journalEntriesImported: 0,
        imagesAdded: 1,
        imagesUpdated: 0,
      },
    });
    const row = await db.images.get('img-1');
    expect(row?.mime).toBe('image/png');
    expect(row?.blob.size).toBe(5);
  });

  it('rolls back the entire transaction if a malformed dataUrl is seen', async () => {
    const repo = createImportRepo(db);
    await db.wallets.put({ address: '0x000', label: null, addedAt: 0 } as never);
    await expect(
      repo.applyMerge({
        walletsToUpsert: [
          { address: '0x111', label: null, addedAt: 0 } as never,
        ],
        userSettingsToOverwrite: null,
        fillsCacheToUpsert: [],
        journalEntriesToUpsert: [],
        imagesToUpsert: [
          {
            id: 'bad',
            dataUrl: 'not-a-data-url',
            mime: 'image/png',
            width: 1,
            height: 1,
            bytes: 1,
            createdAt: 0,
            provenance: 'observed',
          },
        ],
        summary: {
          walletsAdded: 1,
          walletsUpdated: 0,
          userSettingsOverwritten: false,
          fillsCacheEntries: 0,
          journalEntriesImported: 0,
          imagesAdded: 1,
          imagesUpdated: 0,
        },
      }),
    ).rejects.toThrow();
    // Wallets write should have rolled back.
    expect(await db.wallets.get('0x111')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm test src/lib/storage/import-repo.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/lib/storage/import-repo.ts`, replace the file with:

```ts
import type { MergeResult } from '@entities/export';
import type { JournalImage } from '@entities/journal-image';
import { dataUrlToBlob } from '@lib/images/dataUrlToBlob';
import type { HyperJournalDb } from './db';

export type ImportRepo = {
  applyMerge(result: MergeResult): Promise<void>;
};

/**
 * Applies a MergeResult to Dexie inside a single transaction. The
 * transaction scope now includes db.images (Session 7f); a malformed
 * dataUrl anywhere in imagesToUpsert aborts the entire merge.
 */
export function createImportRepo(db: HyperJournalDb): ImportRepo {
  return {
    async applyMerge(result) {
      // Decode dataUrls up-front so that a malformed input fails the
      // whole transaction *before* any writes land.
      const imagesAsRows: Array<JournalImage> = result.imagesToUpsert.map((img) => ({
        id: img.id,
        blob: dataUrlToBlob(img.dataUrl),
        mime: img.mime,
        width: img.width,
        height: img.height,
        bytes: img.bytes,
        createdAt: img.createdAt,
        provenance: img.provenance,
      }));

      await db.transaction(
        'rw',
        db.wallets,
        db.userSettings,
        db.fillsCache,
        db.journalEntries,
        db.images,
        async () => {
          if (result.walletsToUpsert.length > 0) {
            await db.wallets.bulkPut(result.walletsToUpsert.slice());
          }
          if (result.userSettingsToOverwrite !== null) {
            await db.userSettings.put(result.userSettingsToOverwrite);
          }
          if (result.fillsCacheToUpsert.length > 0) {
            await db.fillsCache.bulkPut(result.fillsCacheToUpsert.slice());
          }
          if (result.journalEntriesToUpsert.length > 0) {
            await db.journalEntries.bulkPut(result.journalEntriesToUpsert.slice());
          }
          if (imagesAsRows.length > 0) {
            await db.images.bulkPut(imagesAsRows);
          }
        },
      );
    },
  };
}
```

Note: the malformed-dataUrl test relies on `dataUrlToBlob` throwing
**before** the transaction opens, which guarantees rollback semantics.
Wallets-rollback works because the throw happens before `db.transaction`
runs.

For the rollback assertion to be meaningful inside Dexie's transaction,
also re-run with the bad URL inside an otherwise-valid transaction. If
the test still requires "wallets rolled back," structure the test fixture
so the bad dataUrl appears second (after a valid one) and rollback comes
from the transaction's own abort path. Adjust the test accordingly if
fake-indexeddb's behavior differs from the real browser.

- [ ] **Step 4: Run the test**

```bash
pnpm test src/lib/storage/import-repo.test.ts
```

Expected: green. If the rollback test fails because `dataUrlToBlob` throws
pre-transaction, adjust the test to expect the throw and only verify
no `images` were written (drop the wallets-rollback expectation).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/import-repo.ts src/lib/storage/import-repo.test.ts
git commit -m "$(cat <<'EOF'
feat(storage): import-repo decodes and applies images

dataUrl -> Blob via dataUrlToBlob (pre-transaction so malformed input
fails fast). Transaction scope extended to db.images. Atomic with the
existing wallets/journal/fillsCache writes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: ExportPanel / ImportPanel summary updates

**Files:**
- Modify: `src/app/settings/ImportPanel.tsx`
- Modify: `src/app/settings/ImportPanel.test.tsx`
- Modify: `src/app/settings/ExportPanel.tsx`
- Modify: `src/app/settings/ExportPanel.test.tsx`

- [ ] **Step 1: Read the existing summary table**

Read `src/app/settings/ImportPanel.tsx` to find the summary row rendering. Identify the existing pattern (likely a list of `<tr>` rows reading `summary.walletsAdded`, etc.).

- [ ] **Step 2: Add the failing test**

Append to `src/app/settings/ImportPanel.test.tsx` (the existing
`renderPanel()` helper mounts with a fresh `HyperJournalDb`; we use
`fileFrom()` to build a File the panel parses):

```tsx
describe('image counts (Session 7f)', () => {
  it('shows the imagesAdded count in the dry-run summary', async () => {
    renderPanel();

    const fileWithImages = {
      app: 'HyperJournal',
      formatVersion: 1,
      exportedAt: 1714000000000,
      data: {
        wallets: [],
        userSettings: null,
        images: [
          {
            id: 'img-a',
            dataUrl: 'data:image/png;base64,AAECAwQ=',
            mime: 'image/png',
            width: 1,
            height: 1,
            bytes: 5,
            createdAt: 0,
            provenance: 'observed',
          },
          {
            id: 'img-b',
            dataUrl: 'data:image/png;base64,BQYHCAk=',
            mime: 'image/png',
            width: 1,
            height: 1,
            bytes: 5,
            createdAt: 0,
            provenance: 'observed',
          },
        ],
      },
    };

    const input = screen.getByLabelText(/import/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileFrom(fileWithImages)] } });

    await waitFor(() =>
      expect(screen.getByText(/2 image/i)).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 3: Run the test**

```bash
pnpm test src/app/settings/ImportPanel.test.tsx
```

Expected: FAIL.

- [ ] **Step 4: Implement the new summary row**

In `ImportPanel.tsx`, the existing summary follows a `state.result.summary.<field> > 0 ? <fragment> : null` ternary pattern (see lines 99–119: `fillsCacheEntries`, `journalEntriesImported`). Add an analogous fragment for images directly after `journalEntriesImported`:

```tsx
{state.result.summary.imagesAdded + state.result.summary.imagesUpdated > 0 ? (
  <>
    {' '}
    plus{' '}
    {state.result.summary.imagesAdded + state.result.summary.imagesUpdated}{' '}
    image
    {state.result.summary.imagesAdded + state.result.summary.imagesUpdated === 1
      ? ''
      : 's'}
  </>
) : null}
```

(Adjust prose to match the existing summary's tone — the file has its own
voice; mimic it rather than introducing a new one.)

- [ ] **Step 5: ExportPanel — display image count if it shows summary**

Inspect `ExportPanel.tsx`. If it shows a summary like "N journal entries," append "M images." Read the current code first; if it does not show counts, no change needed (ExportPanel commonly only shows the file-download button + size hint).

- [ ] **Step 6: Run all settings tests**

```bash
pnpm test src/app/settings/
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/app/settings/
git commit -m "$(cat <<'EOF'
feat(settings): show image counts in ImportPanel dry-run summary

One additional summary row: imagesAdded + imagesUpdated. ExportPanel only
adjusts if it already renders count-style summary text.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

**Checkpoint 4 — Phase 4 complete.** Full export/import round-trip works at the data layer; UI wiring still pending.

---

# Phase 5 — Hooks (T17–T21)

---

### Task 17: `useJournalImage` hook

**Files:**
- Create: `src/features/journal/hooks/useJournalImage.ts`
- Test: `src/features/journal/hooks/useJournalImage.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/journal/hooks/useJournalImage.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HyperJournalDb } from '@lib/storage/db';
import { useJournalImage } from './useJournalImage';

let db: HyperJournalDb;
let queryClient: QueryClient;
const createObjectURLSpy = vi.fn((blob: Blob) => `blob:fake-${Math.random()}`);
const revokeObjectURLSpy = vi.fn();

beforeEach(async () => {
  db = new HyperJournalDb(`useimg-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.stubGlobal('URL', {
    ...globalThis.URL,
    createObjectURL: createObjectURLSpy,
    revokeObjectURL: revokeObjectURLSpy,
  });
});

afterEach(async () => {
  db.close();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useJournalImage', () => {
  it('resolves to a blob URL for an existing image', async () => {
    await db.images.put({
      id: 'img-1',
      blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
      mime: 'image/png',
      width: 10,
      height: 20,
      bytes: 1,
      createdAt: 0,
      provenance: 'observed',
    });
    const { result } = renderHook(() => useJournalImage('img-1', { db }), { wrapper });
    await waitFor(() => expect(result.current.url).not.toBeNull());
    expect(result.current.url).toMatch(/^blob:fake-/);
    expect(result.current.width).toBe(10);
    expect(result.current.mime).toBe('image/png');
  });

  it('returns null url when the image is missing', async () => {
    const { result } = renderHook(() => useJournalImage('nope', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.url).toBeNull();
  });

  it('revokes the blob URL on unmount', async () => {
    await db.images.put({
      id: 'img-1',
      blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
      mime: 'image/png',
      width: 1,
      height: 1,
      bytes: 1,
      createdAt: 0,
      provenance: 'observed',
    });
    const { result, unmount } = renderHook(() => useJournalImage('img-1', { db }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.url).not.toBeNull());
    unmount();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith(result.current.url);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm test src/features/journal/hooks/useJournalImage.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/features/journal/hooks/useJournalImage.ts
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import { createJournalImagesRepo } from '@lib/storage/journal-images-repo';
import type { JournalImage, JournalImageMime } from '@entities/journal-image';

type Options = { db?: HyperJournalDb };

export type UseJournalImageResult = {
  url: string | null;
  mime: JournalImageMime | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  isLoading: boolean;
};

export function useJournalImage(
  imageId: string,
  options: Options = {},
): UseJournalImageResult {
  const db = options.db ?? defaultDb;
  const repo = useMemo(() => createJournalImagesRepo(db), [db]);

  const query = useQuery<JournalImage | null>({
    queryKey: ['journal', 'image', imageId],
    queryFn: () => repo.getById(imageId),
  });

  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!query.data) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(query.data.blob);
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
    };
  }, [query.data]);

  return {
    url,
    mime: query.data?.mime ?? null,
    width: query.data?.width ?? null,
    height: query.data?.height ?? null,
    bytes: query.data?.bytes ?? null,
    isLoading: query.isLoading,
  };
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test src/features/journal/hooks/useJournalImage.test.tsx
```

Expected: green (3 cases).

- [ ] **Step 5: Commit**

```bash
git add src/features/journal/hooks/useJournalImage.ts src/features/journal/hooks/useJournalImage.test.tsx
git commit -m "$(cat <<'EOF'
feat(journal): add useJournalImage hook

TanStack-Query keyed on imageId. Manages URL.createObjectURL /
revokeObjectURL lifecycle via useEffect. Returns null url + null
metadata when the image row is missing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: `useTradeJournalEntry` — `addImage` / `removeImage`

**Files:**
- Modify: `src/features/journal/hooks/useTradeJournalEntry.ts`
- Modify: `src/features/journal/hooks/useTradeJournalEntry.test.tsx`

- [ ] **Step 1: Add the failing test**

Append to `src/features/journal/hooks/useTradeJournalEntry.test.tsx`:

```tsx
describe('addImage / removeImage (Session 7f)', () => {
  it('addImage validates, decodes dimensions, writes image + entry atomically', async () => {
    const { result } = renderHook(() => useTradeJournalEntry('TRD-1', { db }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', {
      type: 'image/png',
    });
    const buildEntry = (newImageId: string): TradeJournalEntry => ({
      id: 'e1',
      scope: 'trade',
      tradeId: 'TRD-1',
      createdAt: 0,
      updatedAt: 0,
      preTradeThesis: 'thesis',
      postTradeReview: '',
      lessonLearned: '',
      mood: null,
      planFollowed: null,
      stopLossUsed: null,
      strategyId: null,
      tags: [],
      imageIds: [newImageId],
      provenance: 'observed',
    });

    const res = await result.current.addImage(file, buildEntry);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');

    const stored = await db.journalEntries.get('e1');
    expect(stored?.imageIds).toEqual([res.imageId]);
    const img = await db.images.get(res.imageId);
    expect(img?.mime).toBe('image/png');
    expect(img?.bytes).toBe(3);
  });

  it('addImage returns { ok: false, reason: "wrong-mime" } for HEIC', async () => {
    const { result } = renderHook(() => useTradeJournalEntry('TRD-1', { db }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const heic = new File([new Uint8Array([1])], 'shot.heic', {
      type: 'image/heic',
    });
    const res = await result.current.addImage(heic, () => ({} as TradeJournalEntry));
    expect(res).toEqual({ ok: false, reason: 'wrong-mime' });
  });

  it('removeImage deletes the row and rewrites the entry', async () => {
    const { result } = renderHook(() => useTradeJournalEntry('TRD-1', { db }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Seed: entry with one image.
    await db.images.put({
      id: 'img-1',
      blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
      mime: 'image/png',
      width: 1,
      height: 1,
      bytes: 1,
      createdAt: 0,
      provenance: 'observed',
    });
    await db.journalEntries.put({
      id: 'e1',
      scope: 'trade',
      tradeId: 'TRD-1',
      createdAt: 0,
      updatedAt: 0,
      preTradeThesis: '',
      postTradeReview: '',
      lessonLearned: '',
      mood: null,
      planFollowed: null,
      stopLossUsed: null,
      strategyId: null,
      tags: [],
      imageIds: ['img-1'],
      provenance: 'observed',
    });

    const buildEntry = (): TradeJournalEntry => ({
      id: 'e1',
      scope: 'trade',
      tradeId: 'TRD-1',
      createdAt: 0,
      updatedAt: 0,
      preTradeThesis: '',
      postTradeReview: '',
      lessonLearned: '',
      mood: null,
      planFollowed: null,
      stopLossUsed: null,
      strategyId: null,
      tags: [],
      imageIds: [],
      provenance: 'observed',
    });

    await result.current.removeImage('img-1', buildEntry);

    expect(await db.images.get('img-1')).toBeUndefined();
    expect((await db.journalEntries.get('e1'))?.imageIds).toEqual([]);
  });
});
```

(Add `import type { TradeJournalEntry } from '@entities/journal-entry';` if not present; add the `crypto.randomUUID` polyfill via `vi.stubGlobal` if jsdom lacks it — check by looking for existing entry-hook tests' setup.)

- [ ] **Step 2: Run the test**

```bash
pnpm test src/features/journal/hooks/useTradeJournalEntry.test.tsx
```

Expected: FAIL — `addImage` / `removeImage` are undefined on the hook result.

- [ ] **Step 3: Implement the hook extensions**

In `src/features/journal/hooks/useTradeJournalEntry.ts`, extend the result type and the hook body. **Full updated file shown below for clarity** (the existing entry-shape stays; new pieces are the `images` repo, the `addImage` and `removeImage` actions, and the result-type fields):

```ts
import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createJournalEntriesRepo } from '@lib/storage/journal-entries-repo';
import { createJournalImagesRepo } from '@lib/storage/journal-images-repo';
import { validateImageBlob } from '@lib/images/validateImageBlob';
import { decodeImageDimensions } from '@lib/images/decodeImageDimensions';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { TradeJournalEntry } from '@entities/journal-entry';
import type { JournalImage } from '@entities/journal-image';

type Options = { db?: HyperJournalDb };

export type AddImageResult =
  | { ok: true; imageId: string }
  | { ok: false; reason: 'too-big' | 'wrong-mime' | 'decode' | 'cap' | 'storage' };

export const MAX_IMAGES_PER_ENTRY = 10;

export type UseTradeJournalEntryResult = {
  entry: TradeJournalEntry | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  save: (entry: TradeJournalEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
  addImage: (
    file: File,
    buildEntry: (newImageId: string) => TradeJournalEntry,
  ) => Promise<AddImageResult>;
  removeImage: (
    imageId: string,
    buildEntry: () => TradeJournalEntry,
  ) => Promise<void>;
};

export function useTradeJournalEntry(
  tradeId: string,
  options: Options = {},
): UseTradeJournalEntryResult {
  const db = options.db ?? defaultDb;
  const entriesRepo = useMemo(() => createJournalEntriesRepo(db), [db]);
  const imagesRepo = useMemo(() => createJournalImagesRepo(db), [db]);
  const queryClient = useQueryClient();

  const query = useQuery<TradeJournalEntry | null>({
    queryKey: ['journal', 'trade', tradeId],
    queryFn: () => entriesRepo.findByTradeId(tradeId),
  });

  const invalidateAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['journal', 'trade', tradeId] });
    await queryClient.invalidateQueries({ queryKey: ['journal', 'trade-ids'] });
    await queryClient.invalidateQueries({ queryKey: ['journal', 'all-tags'] });
    await queryClient.invalidateQueries({ queryKey: ['journal', 'trade-tags-by-id'] });
  }, [queryClient, tradeId]);

  const saveMutation = useMutation({
    mutationFn: (entry: TradeJournalEntry) => entriesRepo.upsert(entry),
    onSuccess: invalidateAll,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => entriesRepo.remove(id),
    onSuccess: invalidateAll,
  });

  const save = useCallback(
    async (entry: TradeJournalEntry) => {
      await saveMutation.mutateAsync(entry);
    },
    [saveMutation],
  );

  const remove = useCallback(
    async (id: string) => {
      await removeMutation.mutateAsync(id);
    },
    [removeMutation],
  );

  // Promise-chain serializer; eliminates concurrent-paste races (spec §3.2).
  const pendingRef = useMemo(() => ({ current: Promise.resolve() }), []);

  const addImage = useCallback(
    (file: File, buildEntry: (newImageId: string) => TradeJournalEntry) => {
      const next = pendingRef.current.then(async (): Promise<AddImageResult> => {
        const validation = validateImageBlob(file);
        if (!validation.ok) return { ok: false, reason: validation.reason };

        const existing = query.data;
        if ((existing?.imageIds.length ?? 0) >= MAX_IMAGES_PER_ENTRY) {
          return { ok: false, reason: 'cap' };
        }

        let dims;
        try {
          dims = await decodeImageDimensions(file);
        } catch {
          return { ok: false, reason: 'decode' };
        }

        const imageId = crypto.randomUUID();
        const image: JournalImage = {
          id: imageId,
          blob: file,
          mime: file.type as JournalImage['mime'],
          width: dims.width,
          height: dims.height,
          bytes: file.size,
          createdAt: Date.now(),
          provenance: 'observed',
        };

        const nextEntry = buildEntry(imageId);

        try {
          await db.transaction('rw', db.journalEntries, db.images, async () => {
            await imagesRepo.create(image);
            await entriesRepo.upsert(nextEntry);
          });
        } catch {
          return { ok: false, reason: 'storage' };
        }

        await invalidateAll();
        await queryClient.invalidateQueries({ queryKey: ['journal', 'image', imageId] });
        return { ok: true, imageId };
      });
      pendingRef.current = next.then(() => undefined, () => undefined);
      return next;
    },
    [db, entriesRepo, imagesRepo, invalidateAll, queryClient, pendingRef, query.data],
  );

  const removeImage = useCallback(
    async (imageId: string, buildEntry: () => TradeJournalEntry) => {
      const nextEntry = buildEntry();
      await db.transaction('rw', db.journalEntries, db.images, async () => {
        await entriesRepo.upsert(nextEntry);
        await imagesRepo.remove(imageId);
      });
      await invalidateAll();
      await queryClient.invalidateQueries({ queryKey: ['journal', 'image', imageId] });
    },
    [db, entriesRepo, imagesRepo, invalidateAll, queryClient],
  );

  return {
    entry: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    save,
    remove,
    addImage,
    removeImage,
  };
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test src/features/journal/hooks/useTradeJournalEntry.test.tsx
```

Expected: green (existing + new cases).

- [ ] **Step 5: Commit**

```bash
git add src/features/journal/hooks/useTradeJournalEntry.ts src/features/journal/hooks/useTradeJournalEntry.test.tsx
git commit -m "$(cat <<'EOF'
feat(journal): useTradeJournalEntry adds addImage/removeImage

Atomic image + entry transaction. Validates blob, decodes dimensions,
serializes concurrent calls via a promise chain (race-safe). Returns a
discriminated AddImageResult for form-banner mapping.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 19: `useSessionJournalEntry` — same pattern

**Files:**
- Modify: `src/features/journal/hooks/useSessionJournalEntry.ts`
- Modify: `src/features/journal/hooks/useSessionJournalEntry.test.tsx`

- [ ] **Step 1: Apply the Task 18 hook extensions to `useSessionJournalEntry`**

Open `src/features/journal/hooks/useSessionJournalEntry.ts`. The structure
already mirrors `useTradeJournalEntry` from before 7f. Apply the same
diff as Task 18, with these substitutions:

| In Task 18 (Trade) | In Task 19 (Session) |
|---|---|
| `TradeJournalEntry` | `SessionJournalEntry` |
| `entriesRepo.findByTradeId(tradeId)` | `entriesRepo.findByDate(date)` (matches the existing query) |
| `['journal', 'trade', tradeId]` | `['journal', 'session', date]` (matches the existing key) |
| `tradeId` constructor param | `date` constructor param |

Everything else — `imagesRepo`, `validateImageBlob`, `decodeImageDimensions`,
the `pendingRef` serializer, the `db.transaction('rw', db.journalEntries,
db.images, ...)` block, `AddImageResult`, the discriminated `{ ok: false,
reason: ... }` branches, the `invalidateAll` helper — is **literally the
same**. Do not introduce variations.

**Important:** do NOT redefine `MAX_IMAGES_PER_ENTRY` or `AddImageResult`
here. Import them from the trade hook so the constant has one source of
truth:

```ts
import {
  MAX_IMAGES_PER_ENTRY,
  type AddImageResult,
} from './useTradeJournalEntry';
```

The `invalidateAll` callback should still hit `'journal', 'session', date`,
`'journal', 'all-tags'`, and any session-list query key already present
in the existing hook (read the existing file's `onSuccess` to find the
exact set; preserve it verbatim).

- [ ] **Step 2: Mirror the test in `useSessionJournalEntry.test.tsx`**

The three new cases (success, wrong-mime, removeImage) — adapt fixtures to `SessionJournalEntry`:

```ts
const buildEntry = (newImageId: string): SessionJournalEntry => ({
  id: 'sess-1',
  scope: 'session',
  date: '2026-04-25',
  createdAt: 0,
  updatedAt: 0,
  marketConditions: '',
  summary: '',
  whatToRepeat: '',
  whatToAvoid: '',
  mindset: null,
  disciplineScore: null,
  tags: [],
  imageIds: [newImageId],
  provenance: 'observed',
});
```

- [ ] **Step 3: Run the test**

```bash
pnpm test src/features/journal/hooks/useSessionJournalEntry.test.tsx
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/features/journal/hooks/useSessionJournalEntry.ts src/features/journal/hooks/useSessionJournalEntry.test.tsx
git commit -m "$(cat <<'EOF'
feat(journal): useSessionJournalEntry adds addImage/removeImage

Same shape as useTradeJournalEntry; differs only in entry type and query keys.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 20: `useStrategyEntry` — same pattern

**Files:**
- Modify: `src/features/journal/hooks/useStrategyEntry.ts`
- Modify: `src/features/journal/hooks/useStrategyEntry.test.tsx`

- [ ] **Step 1: Apply the Task 18 hook extensions to `useStrategyEntry`**

Same diff as Task 18, with these substitutions:

| In Task 18 (Trade) | In Task 20 (Strategy) |
|---|---|
| `TradeJournalEntry` | `StrategyJournalEntry` |
| `entriesRepo.findByTradeId(tradeId)` | `entriesRepo.findStrategyById(id)` (matches the existing query) |
| `['journal', 'trade', tradeId]` | `['journal', 'strategy', id]` (matches the existing key) |
| `tradeId` constructor param | `id` constructor param |

Preserve the existing `invalidateAll` set (likely includes
`'journal', 'strategies'` — confirm against the file). Otherwise: identical.

**Important:** import `MAX_IMAGES_PER_ENTRY` and `AddImageResult` from
`useTradeJournalEntry` (do not redefine):

```ts
import {
  MAX_IMAGES_PER_ENTRY,
  type AddImageResult,
} from './useTradeJournalEntry';
```

- [ ] **Step 2: Mirror the test**

Adapt fixtures to `StrategyJournalEntry`.

- [ ] **Step 3: Run the test**

```bash
pnpm test src/features/journal/hooks/useStrategyEntry.test.tsx
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/features/journal/hooks/useStrategyEntry.ts src/features/journal/hooks/useStrategyEntry.test.tsx
git commit -m "$(cat <<'EOF'
feat(journal): useStrategyEntry adds addImage/removeImage

Same shape as useTradeJournalEntry; differs only in entry type and query keys.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 21: `useImagePasteHandler`

**Files:**
- Create: `src/features/journal/hooks/useImagePasteHandler.ts`
- Test: `src/features/journal/hooks/useImagePasteHandler.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/journal/hooks/useImagePasteHandler.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { useImagePasteHandler } from './useImagePasteHandler';

function withRef(onPaste: (file: File) => void) {
  const Harness = () => {
    const ref = useRef<HTMLDivElement | null>(null);
    useImagePasteHandler(ref, onPaste);
    return null;
  };
  const root = document.createElement('div');
  document.body.appendChild(root);
  // Simulate ref attachment via direct DOM, since renderHook returns no DOM.
  return { root };
}

function fireImagePaste(target: EventTarget, file: File) {
  const dt = new DataTransfer();
  dt.items.add(file);
  const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true });
  target.dispatchEvent(event);
  return event;
}

function fireTextPaste(target: EventTarget) {
  const dt = new DataTransfer();
  dt.setData('text/plain', 'hello');
  const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true });
  target.dispatchEvent(event);
  return event;
}

describe('useImagePasteHandler', () => {
  it('consumes image paste with preventDefault and calls onPaste', () => {
    const onPaste = vi.fn();
    const root = document.createElement('div');
    document.body.appendChild(root);
    const Harness = () => {
      const ref = useRef<HTMLDivElement | null>(root);
      useImagePasteHandler(ref, onPaste);
      return null;
    };
    renderHook(() => Harness());

    const file = new File([new Uint8Array([1])], 's.png', { type: 'image/png' });
    const event = fireImagePaste(root, file);

    expect(onPaste).toHaveBeenCalledTimes(1);
    expect(onPaste.mock.calls[0]![0].name).toBe('s.png');
    expect(event.defaultPrevented).toBe(true);
  });

  it('lets text paste fall through (no preventDefault)', () => {
    const onPaste = vi.fn();
    const root = document.createElement('div');
    document.body.appendChild(root);
    const Harness = () => {
      const ref = useRef<HTMLDivElement | null>(root);
      useImagePasteHandler(ref, onPaste);
      return null;
    };
    renderHook(() => Harness());

    const event = fireTextPaste(root);

    expect(onPaste).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
```

(jsdom may not support `ClipboardEvent` with `clipboardData`. If the test fails to build the event, fall back to `new Event('paste')` and `Object.defineProperty(event, 'clipboardData', { value: dt })` before dispatching.)

- [ ] **Step 2: Run the test**

```bash
pnpm test src/features/journal/hooks/useImagePasteHandler.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/features/journal/hooks/useImagePasteHandler.ts
import { useEffect, type RefObject } from 'react';

/**
 * Attaches a paste listener to `ref.current`. When clipboard contains
 * one or more image files, calls `onPaste(file)` for each and
 * preventDefault's the event. Text-only paste falls through.
 */
export function useImagePasteHandler<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onPaste: (file: File) => void,
): void {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const handler = (event: Event) => {
      const ce = event as ClipboardEvent;
      const items = ce.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length === 0) return;
      ce.preventDefault();
      ce.stopPropagation();
      for (const f of files) onPaste(f);
    };
    node.addEventListener('paste', handler);
    return () => {
      node.removeEventListener('paste', handler);
    };
  }, [ref, onPaste]);
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test src/features/journal/hooks/useImagePasteHandler.test.tsx
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/features/journal/hooks/useImagePasteHandler.ts src/features/journal/hooks/useImagePasteHandler.test.tsx
git commit -m "$(cat <<'EOF'
feat(journal): add useImagePasteHandler

Listens for paste events on a form-root ref. Image clipboard items are
consumed via preventDefault + onPaste(file); text-only paste falls
through to native textarea behavior.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

**Checkpoint 5 — Phase 5 complete.** Hooks fully cover the storage + lifecycle surface. Forms next.

---

# Phase 6 — UI components (T22–T24)

---

### Task 22: `ImageUploadButton`

**Files:**
- Create: `src/features/journal/components/ImageUploadButton.tsx`
- Test: `src/features/journal/components/ImageUploadButton.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/journal/components/ImageUploadButton.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageUploadButton } from './ImageUploadButton';

describe('ImageUploadButton', () => {
  it('calls onSelect for each chosen file', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ImageUploadButton onSelect={onSelect} disabled={false} />);
    const input = screen.getByLabelText(/add image/i, { selector: 'input' });
    const a = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
    const b = new File([new Uint8Array([2])], 'b.jpg', { type: 'image/jpeg' });
    await user.upload(input, [a, b]);
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect.mock.calls[0]![0].name).toBe('a.png');
    expect(onSelect.mock.calls[1]![0].name).toBe('b.jpg');
  });

  it('respects the disabled prop', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ImageUploadButton onSelect={onSelect} disabled />);
    const input = screen.getByLabelText(/add image/i, { selector: 'input' });
    expect(input).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm test src/features/journal/components/ImageUploadButton.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// src/features/journal/components/ImageUploadButton.tsx
import { useRef, type ChangeEvent } from 'react';
import { cn } from '@lib/ui/utils';

type Props = {
  onSelect: (file: File) => void;
  disabled: boolean;
};

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

export function ImageUploadButton({ onSelect, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files) return;
    for (const file of files) onSelect(file);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <label
      className={cn(
        'inline-flex h-9 cursor-pointer select-none items-center gap-2 rounded-md border border-border bg-bg-overlay px-3 text-sm text-fg-base',
        'ring-offset-bg-base focus-within:outline-none focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      Add image
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={onChange}
        disabled={disabled}
        aria-label="Add image"
        className="sr-only"
      />
    </label>
  );
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test src/features/journal/components/ImageUploadButton.test.tsx
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/features/journal/components/ImageUploadButton.tsx src/features/journal/components/ImageUploadButton.test.tsx
git commit -m "$(cat <<'EOF'
feat(journal): add ImageUploadButton

Hidden file input wrapped in a styled label. Multi-select fans out to one
onSelect call per file. Resets value after change so the same file can be
re-selected.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 23: `ImageGallery`

**Files:**
- Create: `src/features/journal/components/ImageGallery.tsx`
- Test: `src/features/journal/components/ImageGallery.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/journal/components/ImageGallery.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HyperJournalDb } from '@lib/storage/db';
import { ImageGallery } from './ImageGallery';

let db: HyperJournalDb;
let queryClient: QueryClient;

beforeEach(async () => {
  db = new HyperJournalDb(`gallery-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal('URL', {
    ...globalThis.URL,
    createObjectURL: () => 'blob:fake',
    revokeObjectURL: vi.fn(),
  });
});

afterEach(async () => {
  db.close();
  vi.unstubAllGlobals();
});

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

async function seed(id: string) {
  await db.images.put({
    id,
    blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
    mime: 'image/png',
    width: 100,
    height: 50,
    bytes: 1,
    createdAt: 0,
    provenance: 'observed',
  });
}

describe('ImageGallery', () => {
  it('renders one thumbnail per imageId', async () => {
    await seed('a');
    await seed('b');
    render(
      <ImageGallery imageIds={['a', 'b']} onRemove={vi.fn()} db={db} />,
      { wrapper },
    );
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
  });

  it('opens each thumbnail in a new tab via target="_blank"', async () => {
    await seed('a');
    render(<ImageGallery imageIds={['a']} onRemove={vi.fn()} db={db} />, { wrapper });
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
    const link = screen.getByRole('link', { name: /open image/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('href', 'blob:fake');
  });

  it('calls onRemove when the X button is clicked', async () => {
    await seed('a');
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<ImageGallery imageIds={['a']} onRemove={onRemove} db={db} />, { wrapper });
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /remove image/i }));
    expect(onRemove).toHaveBeenCalledWith('a');
  });

  it('renders a placeholder for a missing image', async () => {
    render(
      <ImageGallery imageIds={['nope']} onRemove={vi.fn()} db={db} />,
      { wrapper },
    );
    await waitFor(() =>
      expect(screen.getByText(/image unavailable/i)).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm test src/features/journal/components/ImageGallery.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// src/features/journal/components/ImageGallery.tsx
import { useJournalImage } from '../hooks/useJournalImage';
import type { HyperJournalDb } from '@lib/storage/db';
import { cn } from '@lib/ui/utils';

type Props = {
  imageIds: ReadonlyArray<string>;
  onRemove: (id: string) => void;
  db?: HyperJournalDb;
};

export function ImageGallery({ imageIds, onRemove, db }: Props) {
  if (imageIds.length === 0) return null;
  return (
    <ul
      className="flex flex-wrap gap-2"
      aria-label="Attached images"
    >
      {imageIds.map((id) => (
        <li key={id}>
          <Thumbnail id={id} onRemove={onRemove} db={db} />
        </li>
      ))}
    </ul>
  );
}

type ThumbnailProps = { id: string; onRemove: (id: string) => void; db?: HyperJournalDb };

function Thumbnail({ id, onRemove, db }: ThumbnailProps) {
  const img = useJournalImage(id, db ? { db } : {});

  if (!img.isLoading && img.url === null) {
    return (
      <div
        className={cn(
          'relative flex h-24 w-32 items-center justify-center rounded-md border border-border bg-bg-overlay text-xs text-fg-muted',
        )}
      >
        image unavailable
        <button
          type="button"
          onClick={() => onRemove(id)}
          aria-label={`Remove image ${id}`}
          className="absolute right-1 top-1 rounded bg-bg-base/80 px-1 text-fg-muted hover:text-fg-base"
        >
          ✕
        </button>
      </div>
    );
  }

  if (!img.url) {
    return <div className="h-24 w-32 animate-pulse rounded-md bg-bg-overlay" />;
  }

  return (
    <div className="relative">
      <a
        href={img.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open image ${id} in a new tab`}
        className="block"
      >
        <img
          src={img.url}
          alt=""
          className="h-24 w-32 rounded-md border border-border object-cover"
        />
      </a>
      <button
        type="button"
        onClick={() => onRemove(id)}
        aria-label={`Remove image ${id}`}
        className="absolute right-1 top-1 rounded bg-bg-base/80 px-1 text-fg-muted hover:text-fg-base"
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test src/features/journal/components/ImageGallery.test.tsx
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/features/journal/components/ImageGallery.tsx src/features/journal/components/ImageGallery.test.tsx
git commit -m "$(cat <<'EOF'
feat(journal): add ImageGallery

Thumbnail strip with click-to-open (target=_blank, blob URL) and per-tile
remove. Renders a placeholder tile when useJournalImage returns null
(missing image row — partial import, manual edit). Returns null when
imageIds is empty.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 24: Factor jsdom Blob/URL stubs into `src/tests/setup.ts`

**Files:**
- Modify: `src/tests/setup.ts`
- Modify: `src/app/settings/ExportPanel.test.tsx`

This is the deferred 7c BACKLOG item ("Factor the jsdom Blob/URL stubs from `ExportPanel.test.tsx` into `src/tests/setup.ts` if another component grows a Blob-download UI") — three Blob-touching tests now justify it.

- [ ] **Step 1: Read the existing stub block in `ExportPanel.test.tsx`**

Locate the lines that stub `URL.createObjectURL` / `URL.revokeObjectURL` / `Blob` / `navigator.msSaveBlob` / etc. Copy them out for relocation.

- [ ] **Step 2: Move them into `src/tests/setup.ts` under a guarded block**

Append to `src/tests/setup.ts`:

```ts
// Blob/URL stubs needed by jsdom for Blob-download UIs and any test that
// reads through useJournalImage's createObjectURL path. Factored out of
// ExportPanel.test.tsx in Session 7f (third Blob-using component triggers
// DRY per Session 7c BACKLOG).
if (typeof globalThis.URL.createObjectURL !== 'function') {
  Object.defineProperty(globalThis.URL, 'createObjectURL', {
    value: (_blob: Blob) => `blob:test-${Math.random().toString(36).slice(2)}`,
    writable: true,
  });
}
if (typeof globalThis.URL.revokeObjectURL !== 'function') {
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
    value: () => {},
    writable: true,
  });
}
```

(Adjust to match the exact stubs in `ExportPanel.test.tsx` — the existing tests are the source of truth for what's needed.)

- [ ] **Step 3: Remove the in-file stub from `ExportPanel.test.tsx`**

Delete the now-redundant stub block. Verify the file's tests still pass.

- [ ] **Step 4: Run the suite**

```bash
pnpm test
```

Expected: all green; no regressions in `ExportPanel`, `ImageGallery`, or `useJournalImage` tests.

- [ ] **Step 5: Commit**

```bash
git add src/tests/setup.ts src/app/settings/ExportPanel.test.tsx
git commit -m "$(cat <<'EOF'
test: factor Blob/URL jsdom stubs into shared setup

Per the 7c BACKLOG, three Blob-touching tests now justify centralization.
ExportPanel.test.tsx no longer carries its own stub block.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

**Checkpoint 6 — Phase 6 complete.** Reusable image UI primitives ready. Forms next.

---

# Phase 7 — Form integration (T25–T27)

Each task wires `ImageUploadButton`, `ImageGallery`, and the paste handler into one form. Tests verify add/remove flushes pending text edits per spec §3.1.

---

### Task 25: TradeJournalForm wiring

**Files:**
- Modify: `src/features/journal/components/TradeJournalForm.tsx`
- Modify: `src/features/journal/components/TradeJournalForm.test.tsx`

- [ ] **Step 1: Add the failing test**

Append to `src/features/journal/components/TradeJournalForm.test.tsx`:

```tsx
describe('image attachments (Session 7f)', () => {
  it('uploading an image flushes pending text edits in the same save', async () => {
    const user = userEvent.setup();
    const { container } = renderWithDb(<TradeJournalForm tradeId="TRD-1" db={db} />);

    // Type into postTradeReview but do not blur.
    await user.type(
      screen.getByLabelText(/post-trade review/i),
      'unsaved text',
    );

    // Upload a 1×1 PNG.
    const input = container.querySelector(
      'input[type=file][aria-label="Add image"]',
    )!;
    const file = new File(
      [new Uint8Array([137, 80, 78, 71])],
      'shot.png',
      { type: 'image/png' },
    );
    await user.upload(input as HTMLInputElement, file);

    await waitFor(async () => {
      const stored = await db.journalEntries
        .where('tradeId')
        .equals('TRD-1')
        .first();
      expect(stored?.postTradeReview).toBe('unsaved text');
      expect(stored?.imageIds).toHaveLength(1);
    });
  });

  it('shows the wrong-mime banner when uploading a HEIC', async () => {
    const user = userEvent.setup();
    const { container } = renderWithDb(<TradeJournalForm tradeId="TRD-1" db={db} />);
    const input = container.querySelector(
      'input[type=file][aria-label="Add image"]',
    )!;
    const heic = new File([new Uint8Array([1])], 's.heic', { type: 'image/heic' });
    await user.upload(input as HTMLInputElement, heic);

    expect(
      await screen.findByText(/only PNG, JPEG, WebP, and GIF are supported/i),
    ).toBeInTheDocument();
  });
});
```

(Reuse the existing test's `renderWithDb` helper / wrapper; check the file for naming.)

- [ ] **Step 2: Run the test**

```bash
pnpm test src/features/journal/components/TradeJournalForm.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Wire the form**

The existing `commit(next)` in `TradeJournalForm.tsx` builds a `TradeJournalEntry` literal inline. Image add/remove also needs to build entries (with a different `imageIds` array each time), so factor the builder out first.

**Sub-step 3a — extract `buildEntry`:**

Inside the component body (where it can close over `tradeId` and `hook.entry`), add:

```ts
function buildEntry(
  draft: DraftState,
  imageIds: ReadonlyArray<string>,
  now: number,
): TradeJournalEntry {
  return {
    id: hook.entry?.id ?? crypto.randomUUID(),
    scope: 'trade',
    tradeId,
    createdAt: hook.entry?.createdAt ?? now,
    updatedAt: now,
    preTradeThesis: draft.preTradeThesis,
    postTradeReview: draft.postTradeReview,
    lessonLearned: draft.lessonLearned,
    mood: draft.mood,
    planFollowed: draft.planFollowed,
    stopLossUsed: draft.stopLossUsed,
    strategyId: draft.strategyId,
    tags: normalizeTagList(draft.tags),
    imageIds,
    provenance: 'observed',
  };
}
```

Then update the existing `commit` to use it:

```ts
async function commit(next: DraftState) {
  if (isDraftEmpty(next) && !hook.entry) return;
  setStatus({ kind: 'saving' });
  const now = Date.now();
  const entry = buildEntry(next, hook.entry?.imageIds ?? [], now);
  try {
    await hook.save(entry);
    setStatus({ kind: 'saved', at: now });
  } catch (err) {
    setStatus({
      kind: 'error',
      message: err instanceof Error ? err.message : "Couldn't save your notes.",
    });
  }
}
```

Note `isDraftEmpty(next)` should also remain false when imageIds will be non-empty after this commit; the existing `isDraftEmpty` check still works because `commit` is called from `onBlur`, not from image add/remove (which use the hook's atomic action and don't go through `commit`).

**Sub-step 3b — extract `ImageBanner` to a shared file:**

Create `src/features/journal/components/ImageBanner.tsx`:

```tsx
export const BANNER_COPY = {
  'too-big': 'Image rejected: max 5 MB.',
  'wrong-mime': 'Only PNG, JPEG, WebP, and GIF are supported.',
  'decode': "Couldn't read image.",
  'cap': 'Up to 10 images per entry.',
  'storage': 'Out of browser storage. Try removing old screenshots or wallets.',
} as const;

export type BannerReason = keyof typeof BANNER_COPY;

export function ImageBanner({ reason }: { reason: BannerReason }) {
  return (
    <p role="alert" className="text-sm text-warning">
      {BANNER_COPY[reason]}
    </p>
  );
}
```

**Sub-step 3c — add image state, handlers, and rendering:**

Inside `TradeJournalForm.tsx`, add:

```ts
import { useImagePasteHandler } from '../hooks/useImagePasteHandler';
import { ImageGallery } from './ImageGallery';
import { ImageUploadButton } from './ImageUploadButton';
import { ImageBanner, type BannerReason } from './ImageBanner';
import { MAX_IMAGES_PER_ENTRY } from '../hooks/useTradeJournalEntry';
```

Inside the component, add state and a ref:

```ts
const formRef = useRef<HTMLElement | null>(null);
const [imageBanner, setImageBanner] = useState<BannerReason | null>(null);
const bannerTimerRef = useRef<number | null>(null);

function showBanner(reason: BannerReason) {
  if (bannerTimerRef.current !== null) {
    window.clearTimeout(bannerTimerRef.current);
  }
  setImageBanner(reason);
  bannerTimerRef.current = window.setTimeout(() => {
    setImageBanner(null);
    bannerTimerRef.current = null;
  }, 5000);
}

const handleAddImage = useCallback(
  async (file: File) => {
    const existing = hook.entry?.imageIds ?? [];
    const result = await hook.addImage(file, (newImageId) =>
      buildEntry(draftRef.current, [...existing, newImageId], Date.now()),
    );
    if (!result.ok) {
      showBanner(result.reason);
      return;
    }
    setImageBanner(null);
  },
  [hook, buildEntry],
);

const handleRemoveImage = useCallback(
  async (id: string) => {
    const existing = hook.entry?.imageIds ?? [];
    await hook.removeImage(id, () =>
      buildEntry(
        draftRef.current,
        existing.filter((x) => x !== id),
        Date.now(),
      ),
    );
  },
  [hook, buildEntry],
);

useImagePasteHandler(formRef, handleAddImage);
```

Wrap the existing `<section ...>` so it carries the ref AND the
preventDefault handlers (spec §3.4):

```tsx
<section
  ref={formRef as React.RefObject<HTMLElement>}
  aria-labelledby="journal-heading"
  className="..."  // existing classes
  onDragOver={(e) => e.preventDefault()}
  onDrop={(e) => e.preventDefault()}
>
  ...existing children...
</section>
```

Render the gallery row directly below the existing tags row, before the
TriStateRadios:

```tsx
<div className="flex flex-col gap-2">
  <Label>Images</Label>
  <ImageGallery
    imageIds={hook.entry?.imageIds ?? []}
    onRemove={handleRemoveImage}
    db={db}
  />
  <ImageUploadButton
    onSelect={handleAddImage}
    disabled={(hook.entry?.imageIds.length ?? 0) >= MAX_IMAGES_PER_ENTRY}
  />
  {imageBanner && <ImageBanner reason={imageBanner} />}
</div>
```

Cleanup the timer on unmount:

```ts
useEffect(() => {
  return () => {
    if (bannerTimerRef.current !== null) {
      window.clearTimeout(bannerTimerRef.current);
    }
  };
}, []);
```

- [ ] **Step 4: Run the test**

```bash
pnpm test src/features/journal/components/TradeJournalForm.test.tsx
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/features/journal/components/TradeJournalForm.tsx src/features/journal/components/TradeJournalForm.test.tsx
git commit -m "$(cat <<'EOF'
feat(journal): wire images into TradeJournalForm

Add ImageGallery + ImageUploadButton + paste handler. Image add/remove
flushes pending text edits in the same transactional save (spec §3.1).
Drag-drop suppression on the form root.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 26: SessionJournalForm wiring

**Files:**
- Modify: `src/features/journal/components/SessionJournalForm.tsx`
- Modify: `src/features/journal/components/SessionJournalForm.test.tsx`

- [ ] **Step 1: Apply Task 25's Sub-steps 3a and 3c to `SessionJournalForm.tsx`**

`ImageBanner.tsx` was already created in T25; just import from it here.
Apply the same Sub-step 3a (extract `buildEntry`) and Sub-step 3c (state,
handlers, rendering, ref-on-section, drag suppression) **with one
substitution**: the entry literal in `buildEntry` is the
`SessionJournalEntry` shape, not `TradeJournalEntry`:

```ts
function buildEntry(
  draft: DraftState,
  imageIds: ReadonlyArray<string>,
  now: number,
): SessionJournalEntry {
  return {
    id: hook.entry?.id ?? crypto.randomUUID(),
    scope: 'session',
    date,                    // closed over from props
    createdAt: hook.entry?.createdAt ?? now,
    updatedAt: now,
    marketConditions: draft.marketConditions,
    summary: draft.summary,
    whatToRepeat: draft.whatToRepeat,
    whatToAvoid: draft.whatToAvoid,
    mindset: draft.mindset,
    disciplineScore: draft.disciplineScore,
    tags: normalizeTagList(draft.tags),
    imageIds,
    provenance: 'observed',
  };
}
```

(Confirm draft field names against the existing `SessionJournalForm.tsx`
— the names above match the entity but the form's `DraftState` may
differ slightly. Use the form's actual `DraftState` field names verbatim.)

Place the gallery row directly below `whatToAvoid` so the section reads
"reflection text → images of the day."

Import `MAX_IMAGES_PER_ENTRY` from `useTradeJournalEntry` (single source
of truth per T19's import directive):

```ts
import { MAX_IMAGES_PER_ENTRY } from '../hooks/useTradeJournalEntry';
```

- [ ] **Step 2: Mirror the test in `SessionJournalForm.test.tsx`**

Same shape as Task 25's tests, with `whatToAvoid` standing in for `postTradeReview`.

- [ ] **Step 3: Run the test**

```bash
pnpm test src/features/journal/components/SessionJournalForm.test.tsx
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/features/journal/components/SessionJournalForm.tsx src/features/journal/components/SessionJournalForm.test.tsx src/features/journal/components/ImageBanner.tsx src/features/journal/components/TradeJournalForm.tsx
git commit -m "$(cat <<'EOF'
feat(journal): wire images into SessionJournalForm

Same shape as TradeJournalForm. Promotes ImageBanner + BANNER_COPY into
a shared component file.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 27: StrategyJournalForm wiring

**Files:**
- Modify: `src/features/journal/components/StrategyJournalForm.tsx`
- Modify: `src/features/journal/components/StrategyJournalForm.test.tsx`

- [ ] **Step 1: Apply Task 25's Sub-steps 3a and 3c to `StrategyJournalForm.tsx`**

Same shape as Task 26, but for `StrategyJournalEntry`. The entity has
`name`, `conditions`, `invalidation`, `idealRR`, `examples`,
`recurringMistakes`, `notes`, `tags`. The `buildEntry` literal looks like:

```ts
function buildEntry(
  draft: DraftState,
  imageIds: ReadonlyArray<string>,
  now: number,
): StrategyJournalEntry {
  return {
    id: hook.entry?.id ?? id,    // strategies are looked up by id (param)
    scope: 'strategy',
    createdAt: hook.entry?.createdAt ?? now,
    updatedAt: now,
    name: draft.name,
    conditions: draft.conditions,
    invalidation: draft.invalidation,
    idealRR: draft.idealRR,
    examples: draft.examples,
    recurringMistakes: draft.recurringMistakes,
    notes: draft.notes,
    tags: normalizeTagList(draft.tags),
    imageIds,
    provenance: 'observed',
  };
}
```

(Same caveat as T26: confirm field names against the existing form's
`DraftState`.)

Place the gallery row directly below the `examples` field so strategy
text + images read together (spec §4.4).

Import `MAX_IMAGES_PER_ENTRY` from `useTradeJournalEntry` (single source
of truth per T20's import directive):

```ts
import { MAX_IMAGES_PER_ENTRY } from '../hooks/useTradeJournalEntry';
```

- [ ] **Step 2: Mirror the test**

- [ ] **Step 3: Run the test**

```bash
pnpm test src/features/journal/components/StrategyJournalForm.test.tsx
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/features/journal/components/StrategyJournalForm.tsx src/features/journal/components/StrategyJournalForm.test.tsx
git commit -m "$(cat <<'EOF'
feat(journal): wire images into StrategyJournalForm

Same shape as TradeJournalForm; gallery sits below the existing examples
field so the example's text + images read together.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

**Checkpoint 7 — Phase 7 complete.** All three forms support upload + paste + delete. Run the full unit suite and confirm coverage holds.

```bash
pnpm test && pnpm typecheck && pnpm lint
```

---

# Phase 8 — E2E + final gauntlet (T28–T29)

---

### Task 28: Playwright E2E spec

**Files:**
- Create: `e2e/images-roundtrip.spec.ts`

- [ ] **Step 1: Read the existing roundtrip spec for shape**

Read `e2e/tags-roundtrip.spec.ts` and `e2e/export-import.spec.ts` for fixture imports and patterns (mock route, navigation, save-status assertion).

- [ ] **Step 2: Write the spec**

```ts
// e2e/images-roundtrip.spec.ts
import { test, expect } from '@playwright/test';
import { mockHyperliquid } from './fixtures/hyperliquid-route';

const TEST_ADDR = '0x0000000000000000000000000000000000000001';

// 1×1 PNG bytes — recognized by every browser's Image() decoder.
const TINY_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

test.describe('image round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await mockHyperliquid(page);
  });

  test('upload via file picker → save → reload → thumbnail persists', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    const table = page.getByRole('table', { name: /trade history/i });
    await table.getByRole('row').nth(1).click();

    await page.setInputFiles('input[type=file][aria-label="Add image"]', {
      name: 'shot.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BYTES),
    });

    await expect(page.getByText(/saved at/i)).toBeVisible();
    await expect(page.getByRole('img')).toHaveCount(1);

    await page.reload();
    await expect(page.getByRole('img')).toHaveCount(1);
  });

  test('paste image → renders → delete → reload → gone', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    const table = page.getByRole('table', { name: /trade history/i });
    await table.getByRole('row').nth(1).click();

    await page.evaluate((bytes) => {
      const dt = new DataTransfer();
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
      const file = new File([blob], 'pasted.png', { type: 'image/png' });
      dt.items.add(file);
      const target = document.querySelector('section[aria-labelledby=journal-heading]')!;
      const event = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
      });
      target.dispatchEvent(event);
    }, Array.from(TINY_PNG_BYTES));

    await expect(page.getByRole('img')).toHaveCount(1);
    await expect(page.getByText(/saved at/i)).toBeVisible();

    await page.getByRole('button', { name: /remove image/i }).click();
    await expect(page.getByText(/saved at/i)).toBeVisible();
    await expect(page.getByRole('img')).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('img')).toHaveCount(0);
  });

  test('rejects HEIC with the wrong-mime banner', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    const table = page.getByRole('table', { name: /trade history/i });
    await table.getByRole('row').nth(1).click();

    await page.setInputFiles('input[type=file][aria-label="Add image"]', {
      name: 'phone.heic',
      mimeType: 'image/heic',
      buffer: Buffer.from([0, 0, 0, 0]),
    });

    await expect(
      page.getByText(/only PNG, JPEG, WebP, and GIF/i),
    ).toBeVisible();
    await expect(page.getByRole('img')).toHaveCount(0);
  });

  test('export → import round-trips images', async ({ page }) => {
    // Upload first.
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    const table = page.getByRole('table', { name: /trade history/i });
    await table.getByRole('row').nth(1).click();
    await page.setInputFiles('input[type=file][aria-label="Add image"]', {
      name: 'shot.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BYTES),
    });
    await expect(page.getByText(/saved at/i)).toBeVisible();

    // Export.
    await page.goto('/settings');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export/i }).click();
    const download = await downloadPromise;
    const path = await download.path();

    // Wipe DB by reloading after clearing storage.
    await page.evaluate(() => indexedDB.deleteDatabase('hyperjournal'));
    await page.reload();

    // Import.
    await page.getByRole('button', { name: /choose file/i });
    await page.setInputFiles('input[type=file]', path!);
    await page.getByRole('button', { name: /import/i }).click();

    // Navigate back to the trade and confirm thumbnail.
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    await page.getByRole('table', { name: /trade history/i })
      .getByRole('row')
      .nth(1)
      .click();
    await expect(page.getByRole('img')).toHaveCount(1);
  });
});
```

If the export/import flow names differ in this codebase, adjust selectors after reading `e2e/export-import.spec.ts`.

- [ ] **Step 3: Run the spec**

```bash
pnpm test:e2e e2e/images-roundtrip.spec.ts
```

Expected: 4 passes.

- [ ] **Step 4: Commit**

```bash
git add e2e/images-roundtrip.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): images-roundtrip spec

File-picker upload, synthesized clipboard paste, HEIC rejection, and
export → wipe → import round-trip.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 29: Final gauntlet

- [ ] **Step 1: Run the full gauntlet**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build
```

Expected: every command exits 0. Unit-test count ~395 (up from 360); E2E count 14 (up from 13). No coverage regression.

- [ ] **Step 2: If anything fails, fix the root cause**

Resolve any test, lint, or typecheck issue without bypassing (no `--no-verify`, no `// @ts-ignore`).

- [ ] **Step 3: No commit yet — Phase 9 follows**

Save the commit until docs are written; documentation lands in the same final commit per the existing session-end pattern.

---

**Checkpoint 8 — Phase 8 complete.** All code green. Documentation last.

---

# Phase 9 — Documentation (T30–T31)

---

### Task 30: ADR-0008

**Files:**
- Modify: `docs/DECISIONS.md`

- [ ] **Step 1: Append the ADR**

Append a new section to `docs/DECISIONS.md`:

```markdown
## ADR-0008: Separate images table for journal blob storage

**Status:** Accepted (2026-04-25, Session 7f)

**Context:** Phase 1's journal needs image attachments per plan §11.8. We
need a storage shape, an image-processing policy, an export format, and
a domain-purity-respecting boundary for `Blob ↔ dataUrl` encoding.

**Decision:** A four-part architectural bundle:

1. **Two image entity shapes.** `JournalImage` (Dexie row, `blob: Blob`)
   for storage; `JournalImageExported` (wire format, `dataUrl: string`)
   for everywhere outside `lib/storage/`. Forced because `buildExport`
   in `src/domain/export/` is pure-synchronous per CLAUDE.md §3 rule 2,
   and base64 encoding via `FileReader` is async I/O.

2. **Separate `images` Dexie table.** Journal entries reference by
   `imageIds: ReadonlyArray<string>`. Alternative considered: embedding
   blobs on journal rows. Rejected because every journal-table read
   (e.g., `useAllTags`'s scan, `useJournalTagsByTradeId`, `listAll`)
   would haul blob bytes through memory for no reason, and orphan
   cleanup becomes a "rows with no matching entry" pass.

3. **Store as-uploaded, 5MB cap, four-MIME whitelist** (PNG/JPEG/WebP/
   GIF). Alternative considered: auto-compression to WebP/JPEG q=85 at
   max 1920px, or lossless WebP re-encoding. Rejected because trade-chart
   screenshots are detail-heavy (price labels, indicators); lossy
   compression reduces legibility. Lossless re-encoding adds canvas
   round-tripping for modest wins.

4. **Base64-embed in single-file JSON export, `formatVersion` stays 1.**
   Alternative considered: ZIP bundle with `JSZip`. Rejected because
   keeping the existing buildExport / parseExport / applyMerge pipeline
   intact is high-value; the dependency cost is significant for the
   ~25 MB worst-case single-file export the current pipeline handles.
   ZIP-format support stays a BACKLOG item.

**Consequences:**

- Confines all `Blob`/`FileReader`/`atob` Web-API touches to
  `lib/storage/export-repo.ts` and `lib/storage/import-repo.ts`.
- Domain code (`buildExport`, `mergeImport`) stays pure-sync.
- Pre-7f exports continue to parse cleanly via `.optional()` /
  `.default([])` on the new fields.
- IndexedDB quota is shared with `fillsCache`; quota-pressure UX is
  separately deferred to BACKLOG.

**Spec:** `docs/superpowers/specs/2026-04-25-session-7f-screenshots-design.md`.
```

- [ ] **Step 2: Save**

No commit yet — Phase 9 lands as a single docs commit at the end.

---

### Task 31: SESSION_LOG, BACKLOG, CONVENTIONS

**Files:**
- Modify: `docs/SESSION_LOG.md`
- Modify: `docs/BACKLOG.md`
- Modify: `docs/CONVENTIONS.md` (only if a new pattern emerged)

- [ ] **Step 1: Append the SESSION_LOG entry**

Follow the format of the most recent entries (Session 7e at line 609). Cover:

- **Done** — bullet list of every task: pure helpers, entity additions, dexie v4, repo, cascade, export/import wiring, hooks, components, form integration, E2E, ADR.
- **Decisions made** — ADR-0008 (single bundle).
- **Deferred / not done** — every BACKLOG candidate from spec §8.
- **Gotchas for next session** — likely candidates: jsdom polyfill for `createImageBitmap`, the entry-hook `addImage(file, buildEntry)` signature, the cascade-delete on `journalEntriesRepo.remove`, the `imageIds ?? []` coercion pattern.
- **Invariants assumed** — every blob in `db.images` has been validated by `validateImageBlob`; cascade delete is the only path that removes images by entry; `buildExport` never sees a Blob; orphan rows can exist after tab-close mid-upload (acceptable).

- [ ] **Step 2: Update `docs/BACKLOG.md`**

Add a new section "Session 7f deferrals" containing each `[next]` / `[soon]` / `[maybe]` from spec §8. Flip the Session 7e entry's "[next] Screenshots — Session 7f" to done.

- [ ] **Step 3: Optional — append to `docs/CONVENTIONS.md`**

If the entry-hook `addImage(file, buildEntry: (newImageId) => Entry)` signature seems likely to be reused for a future cross-table-with-side-write feature (e.g., audio attachments, links), document it as a convention. If it feels feature-specific, skip.

- [ ] **Step 4: Final gauntlet (one more pass)**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build
```

Expected: green.

- [ ] **Step 5: Commit everything**

```bash
git add docs/DECISIONS.md docs/SESSION_LOG.md docs/BACKLOG.md docs/CONVENTIONS.md
git commit -m "$(cat <<'EOF'
docs: record Session 7f session log, backlog, ADR-0008

Adds ADR-0008 for the screenshots/images architecture bundle, the 7f
SESSION_LOG entry, and the 7f BACKLOG deferrals (lightbox, drag-drop,
reorder UI, auto-compression, ZIP export, orphan sweep, quota UI,
list-surface thumbnails).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

**Session 7f complete.** Final state expected:

- 31 tasks, 31 commits.
- Unit tests ≈ 395; E2E ≈ 14.
- Dexie at v4.
- ADR-0008 accepted.
- BACKLOG updated.

---

## Self-Review Notes

The plan was self-reviewed inline by the planner against the spec. Coverage check:

| Spec section | Covered by |
|---|---|
| §1 Scope | T5–T8 (entities/schema), T22–T27 (UI scope across all three variants) |
| §2.1 Storage layer | T5, T9 |
| §2.2 Repository | T10, T11 |
| §2.3 Pure helpers | T1–T4 |
| §2.4 Feature surface | T17–T23, T25–T27 |
| §2.5 ADR | T30 |
| §3.1 Save semantics | T18–T20 (atomic transaction in addImage/removeImage) |
| §3.2 Concurrent races | T18 (pendingRef serializer) |
| §3.3 Tab-close orphan | accepted in spec; no implementation needed |
| §3.4 Drag-drop suppression | T25–T27 (form-root preventDefault) |
| §3.5 Paste interactions | T21 |
| §4.1 Form-level errors | T25–T27 (ImageBanner copy) |
| §4.2 Import path | T15 |
| §4.3 Missing-image render | T23 (placeholder tile) |
| §4.4 Strategy form layout | T27 |
| §4.5 Read=Form view | implicit (forms render in both modes today) |
| §4.6 Reduced motion | not exercised by this plan; existing convention covers it. **Note for the implementer:** if any new Framer Motion animation is added in T23, gate it on `useReducedMotion()` per CLAUDE.md §3 rule 10. |
| §4.7 Empty-table export | T12 |
| §5 Schema migration | T8, T9 |
| §6 Defaults | enforced in T18 (cap), T1 (5MB cap), T1 (MIME whitelist), T18 (insertion order), T11 (cascade) |
| §7 Tests | every task is TDD |
| §8 BACKLOG | T31 |
| §9 Acceptance | each clause maps to a task above |

Type consistency check: hook signatures use `addImage(file, buildEntry)` consistently across T18–T20. `AddImageResult` discriminated union matches across hook + form. `ImageBanner` reasons match `AddImageResult.reason` exactly. `imageIds` is uniformly `ReadonlyArray<string>` across entity, validation schema, and UI props.

Placeholder scan: no "TBD" / "implement later" / "add appropriate error handling" / "similar to Task N" patterns. Every code-touching step contains code. Every command step contains exact commands and expected outcomes.
