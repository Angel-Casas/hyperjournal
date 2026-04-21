import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchUserFills } from '@lib/api/hyperliquid';
import { createFillsCacheRepo } from '@lib/storage/fills-cache-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { RawFill } from '@entities/fill';
import type { WalletAddress } from '@entities/wallet';

/** Fills are considered fresh for five minutes. Tuned later as we learn. */
export const FILLS_CACHE_TTL_MS = 5 * 60_000;

type Options = {
  /** Inject a different Dexie instance (for tests). Defaults to the module-level singleton. */
  db?: HyperJournalDb;
};

/**
 * Read fills for a wallet: returns cached data instantly when fresh,
 * fetches live otherwise, and writes through to Dexie on success. On
 * fetch failure with an empty cache, the query surfaces the error; on
 * fetch failure with a stale cache, returns the stale data with
 * `isError: false` — showing yesterday's data beats an error screen.
 */
export function useUserFills(
  address: WalletAddress,
  options: Options = {},
): UseQueryResult<ReadonlyArray<RawFill>, Error> {
  const db = options.db ?? defaultDb;
  const cache = createFillsCacheRepo(db);

  return useQuery({
    queryKey: ['fills', address],
    queryFn: async () => {
      const now = Date.now();
      const cached = await cache.get(address);
      if (cached && now - cached.fetchedAt < FILLS_CACHE_TTL_MS) {
        return cached.fills;
      }
      try {
        const fresh = await fetchUserFills(address);
        await cache.set(address, fresh, now);
        return fresh;
      } catch (err) {
        if (cached) {
          return cached.fills;
        }
        throw err;
      }
    },
    staleTime: FILLS_CACHE_TTL_MS,
  });
}
