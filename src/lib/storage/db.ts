import Dexie, { type EntityTable } from 'dexie';
import type { Wallet } from '@entities/wallet';
import type { FillsCacheEntry } from '@entities/fills-cache';
import type { UserSettings } from '@entities/user-settings';
import type { JournalEntry } from '@entities/journal-entry';
import type { JournalImage } from '@entities/journal-image';

// Re-exported for callers that already import from @lib/storage/db.
// New call sites should prefer @entities/* directly.
export type { FillsCacheEntry } from '@entities/fills-cache';
export type { UserSettings } from '@entities/user-settings';
export type { JournalEntry } from '@entities/journal-entry';
export type { JournalImage } from '@entities/journal-image';

/**
 * Dexie database for HyperJournal.
 *
 * v1: wallets, fillsCache, userSettings (Session 2b).
 * v2: adds journalEntries (Session 7a). Additive only.
 * v3: adds `date` index on journalEntries for session-scope lookups
 *     (Session 7b). Additive only — no .upgrade() callback because
 *     no existing row needs transforming.
 * v4: adds images table (Session 7f). Additive only.
 *
 * Keys:
 * - wallets: primary key = address
 * - fillsCache: primary key = address
 * - userSettings: primary key = key (always 'singleton')
 * - journalEntries: primary key = id (UUID); indexed on tradeId, scope,
 *   updatedAt, date for list/filter queries
 * - images: primary key = id (UUID); indexed on createdAt for stable
 *   iteration in admin/debug paths
 */
export class HyperJournalDb extends Dexie {
  wallets!: EntityTable<Wallet, 'address'>;
  fillsCache!: EntityTable<FillsCacheEntry, 'address'>;
  userSettings!: EntityTable<UserSettings, 'key'>;
  journalEntries!: EntityTable<JournalEntry, 'id'>;
  images!: EntityTable<JournalImage, 'id'>;

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
    this.version(3).stores({
      wallets: '&address, addedAt',
      fillsCache: '&address, fetchedAt',
      userSettings: '&key',
      journalEntries: '&id, tradeId, scope, updatedAt, date',
    });
    this.version(4).stores({
      wallets: '&address, addedAt',
      fillsCache: '&address, fetchedAt',
      userSettings: '&key',
      journalEntries: '&id, tradeId, scope, updatedAt, date',
      images: '&id, createdAt',
    });
  }
}

/**
 * Shared module-level database instance. Tests override via the
 * HyperJournalDb constructor's optional `name` argument so each test
 * opens a unique DB.
 */
export const db = new HyperJournalDb();
