import { useMemo } from 'react';
import { useUserFills } from './useUserFills';
import { reconstructTrades } from '@domain/reconstruction/reconstructTrades';
import { computeTradeStats } from '@domain/metrics/computeTradeStats';
import type { HyperJournalDb } from '@lib/storage/db';
import type { TradeStats } from '@entities/trade-stats';
import type { WalletAddress } from '@entities/wallet';

type Options = { db?: HyperJournalDb };

export type UseWalletMetricsResult = {
  stats: TradeStats | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
};

/**
 * Composes useUserFills → reconstructTrades → computeTradeStats. Memoized
 * so the pure-domain pipeline runs exactly once per fetch, not per render.
 * stats is null until fills load; error path propagates from the fetch.
 */
export function useWalletMetrics(
  address: WalletAddress,
  options: Options = {},
): UseWalletMetricsResult {
  const fills = useUserFills(address, options);

  const stats = useMemo(() => {
    if (!fills.data) return null;
    const trades = reconstructTrades(fills.data);
    return computeTradeStats(trades);
  }, [fills.data]);

  return {
    stats,
    isLoading: fills.isLoading,
    isError: fills.isError,
    error: fills.error,
  };
}
