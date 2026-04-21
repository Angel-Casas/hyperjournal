import type { WalletAddress } from '@entities/wallet';
import type { RawFill } from '@entities/fill';
import type { FillsCacheEntry, HyperJournalDb } from './db';

export type FillsCacheRepo = {
  get(address: WalletAddress): Promise<FillsCacheEntry | null>;
  set(address: WalletAddress, fills: ReadonlyArray<RawFill>, fetchedAt: number): Promise<void>;
  invalidate(address: WalletAddress): Promise<void>;
  isFresh(address: WalletAddress, ttlMs: number, now: number): Promise<boolean>;
};

/**
 * Repository for cached /info userFills responses. `isFresh` takes a
 * caller-supplied clock (`now`) so callers are explicit about time —
 * keeps the repo testable without fake timers.
 */
export function createFillsCacheRepo(db: HyperJournalDb): FillsCacheRepo {
  return {
    async get(address) {
      const entry = await db.fillsCache.get(address);
      return entry ?? null;
    },
    async set(address, fills, fetchedAt) {
      await db.fillsCache.put({ address, fills, fetchedAt });
    },
    async invalidate(address) {
      await db.fillsCache.delete(address);
    },
    async isFresh(address, ttlMs, now) {
      const entry = await db.fillsCache.get(address);
      if (!entry) return false;
      return now - entry.fetchedAt < ttlMs;
    },
  };
}
