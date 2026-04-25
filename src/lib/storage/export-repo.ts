import type { ExportSnapshot } from '@entities/export';
import type { JournalImageExported } from '@entities/journal-image';
import { blobToDataUrl } from '@lib/images/blobToDataUrl';
import type { HyperJournalDb } from './db';

export type ExportRepo = {
  readSnapshot(): Promise<ExportSnapshot>;
};

/**
 * One-shot reader that pulls every row from every Dexie table into a
 * plain ExportSnapshot. Images are encoded to base64 dataUrls at this
 * boundary so domain code (buildExport, mergeImport) stays pure-sync per
 * CLAUDE.md §3 rule 2 — encoding via FileReader is async I/O.
 */
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
