import type { Provenance } from './provenance';

export type JournalImageMime =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/gif';

/**
 * Dexie row shape. Only crosses the lib/storage boundary in this form;
 * everywhere else (domain, exports, hooks, components) sees
 * JournalImageExported. Introduced in Session 7f. See ADR-0008.
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
