import type { ExportSnapshot } from '@entities/export';
import type { HyperJournalDb } from './db';

export type ExportRepo = {
  readSnapshot(): Promise<ExportSnapshot>;
};

/**
 * One-shot reader that pulls every row from every Dexie table into a
 * plain ExportSnapshot. No transformations — the domain layer decides
 * what ends up in the exported file.
 */
export function createExportRepo(db: HyperJournalDb): ExportRepo {
  return {
    async readSnapshot() {
      const [wallets, userSettings, fillsCache, journalEntries] = await Promise.all([
        db.wallets.toArray(),
        db.userSettings.get('singleton'),
        db.fillsCache.toArray(),
        db.journalEntries.toArray(),
      ]);
      return {
        wallets,
        userSettings: userSettings ?? null,
        fillsCache,
        journalEntries,
        images: [],
      };
    },
  };
}
