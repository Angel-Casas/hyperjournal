import { useQuery } from '@tanstack/react-query';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { TradeJournalEntry } from '@entities/journal-entry';

type Options = { db?: HyperJournalDb };

export type UseJournalTagsByTradeIdResult = {
  tagsByTradeId: ReadonlyMap<string, ReadonlyArray<string>>;
  isLoading: boolean;
};

const EMPTY_MAP: ReadonlyMap<string, ReadonlyArray<string>> = new Map();

/**
 * Returns a Map from tradeId to tags array for every trade-scope
 * journal entry. Threaded down from WalletView into TradeHistoryList
 * so wallets-feature components don't have to import journal-feature
 * code (boundaries rule).
 */
export function useJournalTagsByTradeId(
  options: Options = {},
): UseJournalTagsByTradeIdResult {
  const db = options.db ?? defaultDb;

  const query = useQuery<ReadonlyMap<string, ReadonlyArray<string>>>({
    queryKey: ['journal', 'trade-tags-by-id'],
    queryFn: async () => {
      const rows = await db.journalEntries.where('scope').equals('trade').toArray();
      const map = new Map<string, ReadonlyArray<string>>();
      for (const row of rows) {
        const trade = row as TradeJournalEntry;
        map.set(trade.tradeId, trade.tags ?? []);
      }
      return map;
    },
  });

  return {
    tagsByTradeId: query.data ?? EMPTY_MAP,
    isLoading: query.isLoading,
  };
}
