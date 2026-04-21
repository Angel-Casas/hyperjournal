import Dexie, { type EntityTable } from 'dexie';
import type { Wallet } from '@entities/wallet';
import type { RawFill } from '@entities/fill';

/**
 * Snapshot of fills for a wallet, stored under the wallet's address.
 * fetchedAt is the epoch ms when these fills were returned by the API —
 * used by the cache layer to decide when to refetch.
 */
export type FillsCacheEntry = {
  readonly address: string;
  readonly fetchedAt: number;
  readonly fills: ReadonlyArray<RawFill>;
};

/**
 * Singleton user-settings row. Keyed by the literal string 'singleton' so
 * there is exactly one row.
 */
export type UserSettings = {
  readonly key: 'singleton';
  readonly lastSelectedAddress: string | null;
};

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
