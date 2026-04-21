import type { Wallet, WalletAddress } from '@entities/wallet';
import type { HyperJournalDb } from './db';

export type WalletsRepo = {
  save(wallet: Wallet): Promise<void>;
  list(): Promise<ReadonlyArray<Wallet>>;
  findByAddress(address: WalletAddress): Promise<Wallet | null>;
  remove(address: WalletAddress): Promise<void>;
};

/**
 * Repository for locally-saved wallets. save is upsert semantics. list
 * is sorted by addedAt descending so the UI's "recent wallets" list is
 * naturally in the right order. findByAddress returns null (not
 * undefined) so callers get a consistent empty shape.
 */
export function createWalletsRepo(db: HyperJournalDb): WalletsRepo {
  return {
    async save(wallet) {
      await db.wallets.put(wallet);
    },
    async list() {
      return db.wallets.orderBy('addedAt').reverse().toArray();
    },
    async findByAddress(address) {
      const found = await db.wallets.get(address);
      return found ?? null;
    },
    async remove(address) {
      await db.wallets.delete(address);
    },
  };
}
