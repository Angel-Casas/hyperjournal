import type { Wallet } from './wallet';
import type { UserSettings } from './user-settings';
import type { FillsCacheEntry } from './fills-cache';

/**
 * A full exportable snapshot of the Dexie-stored user data. Domain
 * consumers receive this shape (not a Dexie handle) so they stay pure.
 */
export type ExportSnapshot = {
  readonly wallets: ReadonlyArray<Wallet>;
  readonly userSettings: UserSettings | null;
  readonly fillsCache: ReadonlyArray<FillsCacheEntry>;
};

/**
 * Options controlling what ends up in the exported file.
 */
export type BuildExportOptions = {
  /** When true, serialize the fillsCache rows; when false, omit the key. */
  readonly includeCache: boolean;
  /** Injectable clock for testing. Defaults to Date.now() at the caller site. */
  readonly now: number;
};

/**
 * The `data` payload of an ExportFile. `fillsCache` is optional — when
 * the user exports without the "Include cached market data" checkbox,
 * this key is omitted entirely (not `null`, not `[]`).
 */
export type ExportData = {
  readonly wallets: ReadonlyArray<Wallet>;
  readonly userSettings: UserSettings | null;
  readonly fillsCache?: ReadonlyArray<FillsCacheEntry>;
};

/**
 * The JSON file format. formatVersion is the contract — breaking changes
 * bump it; additive changes under `data` do not. `app` lets us reject
 * foreign-origin files with a clear error before the heavier Zod check.
 */
export type ExportFile = {
  readonly app: 'HyperJournal';
  readonly formatVersion: 1;
  readonly exportedAt: number;
  readonly data: ExportData;
};

/**
 * Result of merging an incoming ExportFile into the existing Dexie state.
 * A `MergeResult` is exactly the set of writes the import-repo will
 * apply inside a single transaction; `summary` is the human-readable
 * breakdown the UI shows before committing.
 */
export type MergeResult = {
  readonly walletsToUpsert: ReadonlyArray<Wallet>;
  readonly userSettingsToOverwrite: UserSettings | null;
  readonly fillsCacheToUpsert: ReadonlyArray<FillsCacheEntry>;
  readonly summary: {
    readonly walletsAdded: number;
    readonly walletsUpdated: number;
    readonly userSettingsOverwritten: boolean;
    readonly fillsCacheEntries: number;
  };
};
