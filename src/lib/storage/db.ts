import Dexie, { type EntityTable } from 'dexie';
import type { Wallet } from '@entities/wallet';
import type { FillsCacheEntry } from '@entities/fills-cache';
import type { UserSettings } from '@entities/user-settings';
import type { JournalEntry } from '@entities/journal-entry';

// Re-exported for callers that already import from @lib/storage/db.
// New call sites should prefer @entities/* directly.
export type { FillsCacheEntry } from '@entities/fills-cache';
export type { UserSettings } from '@entities/user-settings';
export type { JournalEntry } from '@entities/journal-entry';

/**
 * Dexie database for HyperJournal.
 *
 * v1: wallets, fillsCache, userSettings (Session 2b).
 * v2: adds journalEntries (Session 7a). Additive only — no .upgrade()
 *     callback because no existing row needs transforming.
 *
 * Keys:
 * - wallets: primary key = address
 * - fillsCache: primary key = address
 * - userSettings: primary key = key (always 'singleton')
 * - journalEntries: primary key = id (UUID); indexed on tradeId, scope,
 *   updatedAt for list/filter queries
 */
export class HyperJournalDb extends Dexie {
  wallets!: EntityTable<Wallet, 'address'>;
  fillsCache!: EntityTable<FillsCacheEntry, 'address'>;
  userSettings!: EntityTable<UserSettings, 'key'>;
  journalEntries!: EntityTable<JournalEntry, 'id'>;

  constructor(name = 'hyperjournal') {
    super(name);
    this.version(1).stores({
      wallets: '&address, addedAt',
      fillsCache: '&address, fetchedAt',
      userSettings: '&key',
    });
    this.version(2).stores({
      wallets: '&address, addedAt',
      fillsCache: '&address, fetchedAt',
      userSettings: '&key',
      journalEntries: '&id, tradeId, scope, updatedAt',
    });
  }
}

/**
 * Shared module-level database instance. Tests override via the
 * HyperJournalDb constructor's optional `name` argument so each test
 * opens a unique DB.
 */
export const db = new HyperJournalDb();
