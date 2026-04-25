import type { ExportFile, ExportSnapshot, MergeResult } from '@entities/export';

/**
 * Pure. Computes the set of writes to apply to Dexie given an existing
 * snapshot and an incoming ExportFile. Strategy for v1:
 *
 *   - wallets: upsert by address. Incoming wins on conflict.
 *   - userSettings: overwrite (singleton row, latest wins). null in the
 *     file means "don't overwrite" — no explicit delete path today.
 *   - fillsCache: upsert by address IFF the file carries a fillsCache key.
 *
 * The `summary` breakdown is what the Settings UI shows before the user
 * confirms the import; the three writes lists are consumed by import-repo
 * as a single Dexie transaction.
 */
export function mergeImport(
  existing: ExportSnapshot,
  incoming: ExportFile,
): MergeResult {
  const existingAddresses = new Set(existing.wallets.map((w) => w.address));
  const walletsToUpsert = incoming.data.wallets;

  let walletsAdded = 0;
  let walletsUpdated = 0;
  for (const w of walletsToUpsert) {
    if (existingAddresses.has(w.address)) {
      walletsUpdated += 1;
    } else {
      walletsAdded += 1;
    }
  }

  const userSettingsToOverwrite = incoming.data.userSettings;
  const userSettingsOverwritten = userSettingsToOverwrite !== null;

  const fillsCacheToUpsert = incoming.data.fillsCache ?? [];
  const journalEntriesToUpsert = incoming.data.journalEntries ?? [];
  const imagesToUpsert = incoming.data.images ?? [];

  const existingImageIds = new Set(existing.images.map((i) => i.id));
  let imagesAdded = 0;
  let imagesUpdated = 0;
  for (const img of imagesToUpsert) {
    if (existingImageIds.has(img.id)) imagesUpdated += 1;
    else imagesAdded += 1;
  }

  return {
    walletsToUpsert,
    userSettingsToOverwrite,
    fillsCacheToUpsert,
    journalEntriesToUpsert,
    imagesToUpsert,
    summary: {
      walletsAdded,
      walletsUpdated,
      userSettingsOverwritten,
      fillsCacheEntries: fillsCacheToUpsert.length,
      journalEntriesImported: journalEntriesToUpsert.length,
      imagesAdded,
      imagesUpdated,
    },
  };
}
