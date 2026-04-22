import Dexie, { type EntityTable } from 'dexie';
import type { Wallet } from '@entities/wallet';
import type { FillsCacheEntry } from '@entities/fills-cache';
import type { UserSettings } from '@entities/user-settings';

// Re-exported for callers that already import from @lib/storage/db.
// New call sites should prefer @entities/* directly.
export type { FillsCacheEntry } from '@entities/fills-cache';
export type { UserSettings } from '@entities/user-settings';

/**
 * Dexie database for HyperJournal. Schema version 1; future sessions add
 * versions via `this.version(N).stores({...}).upgrade(...)`.
 *
 * Keys:
 * - wallets: primary key = address
 * - fillsCache: primary key = address
 * - userSettings: primary key = key (always 'singleton')
 */
export class HyperJournalDb extends Dexie {
  wallets!: EntityTable<Wallet, 'address'>;
  fillsCache!: EntityTable<FillsCacheEntry, 'address'>;
  userSettings!: EntityTable<UserSettings, 'key'>;

  constructor(name = 'hyperjournal') {
    super(name);
    this.version(1).stores({
      wallets: '&address, addedAt',
      fillsCache: '&address, fetchedAt',
      userSettings: '&key',
    });
  }
}

/**
 * Shared module-level database instance. Tests override via the
 * HyperJournalDb constructor's optional `name` argument so each test
 * opens a unique DB.
 */
export const db = new HyperJournalDb();
