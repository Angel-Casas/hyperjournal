import type {
  BuildExportOptions,
  ExportData,
  ExportFile,
  ExportSnapshot,
} from '@entities/export';

/**
 * Pure. Produces the file-format shape from a Dexie snapshot + export
 * options. fillsCache is omitted (not null, not []) when includeCache is
 * false so the resulting JSON has no fillsCache key at all — stays in
 * lockstep with ExportFileSchema's `.optional()`.
 */
export function buildExport(
  snapshot: ExportSnapshot,
  options: BuildExportOptions,
): ExportFile {
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

  return {
    app: 'HyperJournal',
    formatVersion: 1,
    exportedAt: options.now,
    data,
  };
}
