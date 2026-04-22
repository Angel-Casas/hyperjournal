import type { MergeResult } from '@entities/export';
import type { HyperJournalDb } from './db';

export type ImportRepo = {
  applyMerge(result: MergeResult): Promise<void>;
};

/**
 * Applies a MergeResult to Dexie inside a single transaction. All three
 * tables are declared in the transaction scope so rollback is atomic if
 * any one write fails — matters less today (all puts are independent)
 * but matters a lot when journaling tables join in Phase 3.
 */
export function createImportRepo(db: HyperJournalDb): ImportRepo {
  return {
    async applyMerge(result) {
      await db.transaction(
        'rw',
        db.wallets,
        db.userSettings,
        db.fillsCache,
        db.journalEntries,
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
        },
      );
    },
  };
}
