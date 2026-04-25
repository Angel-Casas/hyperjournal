import type { MergeResult } from '@entities/export';
import type { JournalImage } from '@entities/journal-image';
import { dataUrlToBlob } from '@lib/images/dataUrlToBlob';
import type { HyperJournalDb } from './db';

export type ImportRepo = {
  applyMerge(result: MergeResult): Promise<void>;
};

/**
 * Applies a MergeResult to Dexie inside a single transaction. The
 * transaction scope includes db.images (Session 7f); a malformed dataUrl
 * anywhere in imagesToUpsert throws before any writes land (decoding
 * happens up-front).
 */
export function createImportRepo(db: HyperJournalDb): ImportRepo {
  return {
    async applyMerge(result) {
      // Decode dataUrls up-front so a malformed input fails BEFORE any
      // database writes happen.
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
        [db.wallets, db.userSettings, db.fillsCache, db.journalEntries, db.images],
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
