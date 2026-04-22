import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUserFills } from './useUserFills';
import { reconstructTrades } from '@domain/reconstruction/reconstructTrades';
import { computeTradeStats } from '@domain/metrics/computeTradeStats';
import { createFillsCacheRepo } from '@lib/storage/fills-cache-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { ReconstructedTrade } from '@entities/trade';
import type { TradeStats } from '@entities/trade-stats';
import type { WalletAddress } from '@entities/wallet';

type Options = { db?: HyperJournalDb };

export type UseWalletMetricsResult = {
  stats: TradeStats | null;
  trades: ReadonlyArray<ReconstructedTrade>;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  /**
   * Discard the Dexie cache entry for this wallet and trigger a fresh
   * fetch. Returns the refetch promise so callers can await completion
   * (e.g. to disable a button until the refresh finishes).
   */
  refresh: () => Promise<unknown>;
};

/**
 * Composes useUserFills → reconstructTrades → computeTradeStats. Memoized
 * so the pure-domain pipeline runs exactly once per fetch. `refresh()`
 * invalidates both the Dexie cache and the TanStack Query entry so the
 * next queryFn call fetches live.
 */
export function useWalletMetrics(
  address: WalletAddress,
  options: Options = {},
): UseWalletMetricsResult {
  const db = options.db ?? defaultDb;
  const fills = useUserFills(address, options);
  const queryClient = useQueryClient();

  const result = useMemo<{
    stats: TradeStats | null;
    trades: ReadonlyArray<ReconstructedTrade>;
  }>(() => {
    if (!fills.data) return { stats: null, trades: [] };
    const trades = reconstructTrades(fills.data);
    return { stats: computeTradeStats(trades), trades };
  }, [fills.data]);

  const refresh = useCallback(async () => {
    const cache = createFillsCacheRepo(db);
    await cache.invalidate(address);
    await queryClient.invalidateQueries({ queryKey: ['fills', address] });
    return fills.refetch();
  }, [address, db, fills, queryClient]);

  return {
    stats: result.stats,
    trades: result.trades,
    isLoading: fills.isLoading,
    isFetching: fills.isFetching,
    isError: fills.isError,
    error: fills.error,
    refresh,
  };
}
