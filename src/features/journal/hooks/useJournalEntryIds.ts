import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createJournalEntriesRepo } from '@lib/storage/journal-entries-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';

type Options = { db?: HyperJournalDb };

export type UseJournalEntryIdsResult = {
  ids: Set<string>;
  isLoading: boolean;
};

const EMPTY_SET: Set<string> = new Set();

/**
 * Returns the set of tradeIds that have journal entries. Used by
 * TradeHistoryList to render a pencil icon per row. Cheap enough to
 * read-all-and-dedupe; when entries start reaching the thousands,
 * revisit with an index-backed count query.
 */
export function useJournalEntryIds(options: Options = {}): UseJournalEntryIdsResult {
  const db = options.db ?? defaultDb;
  const repo = useMemo(() => createJournalEntriesRepo(db), [db]);

  const query = useQuery<Set<string>>({
    queryKey: ['journal', 'trade-ids'],
    queryFn: () => repo.listAllTradeIds(),
  });

  return {
    ids: query.data ?? EMPTY_SET,
    isLoading: query.isLoading,
  };
}
