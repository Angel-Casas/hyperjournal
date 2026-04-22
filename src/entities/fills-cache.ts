import type { RawFill } from './fill';
import type { WalletAddress } from './wallet';

/**
 * Snapshot of fills for a wallet, stored under the wallet's address.
 * fetchedAt is the epoch ms when these fills were returned by the API —
 * used by the cache layer to decide when to refetch.
 */
export type FillsCacheEntry = {
  readonly address: WalletAddress;
  readonly fetchedAt: number;
  readonly fills: ReadonlyArray<RawFill>;
};
