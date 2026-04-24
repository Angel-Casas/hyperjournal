import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createJournalEntriesRepo } from '@lib/storage/journal-entries-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { TradeJournalEntry } from '@entities/journal-entry';

type Options = { db?: HyperJournalDb };

export type UseTradeJournalEntryResult = {
  entry: TradeJournalEntry | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  save: (entry: TradeJournalEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

/**
 * Read/write the trade journal entry for a single tradeId. Write
 * invalidates both this query and the cross-wallet tradeIds query
 * (so the pencil icon on trade-history rows updates immediately).
 */
export function useTradeJournalEntry(
  tradeId: string,
  options: Options = {},
): UseTradeJournalEntryResult {
  const db = options.db ?? defaultDb;
  const repo = useMemo(() => createJournalEntriesRepo(db), [db]);
  const queryClient = useQueryClient();

  const query = useQuery<TradeJournalEntry | null>({
    queryKey: ['journal', 'trade', tradeId],
    queryFn: () => repo.findByTradeId(tradeId),
  });

  const saveMutation = useMutation({
    mutationFn: (entry: TradeJournalEntry) => repo.upsert(entry),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['journal', 'trade', tradeId] });
      await queryClient.invalidateQueries({ queryKey: ['journal', 'trade-ids'] });
      await queryClient.invalidateQueries({ queryKey: ['journal', 'all-tags'] });
      await queryClient.invalidateQueries({ queryKey: ['journal', 'trade-tags-by-id'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => repo.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['journal', 'trade', tradeId] });
      await queryClient.invalidateQueries({ queryKey: ['journal', 'trade-ids'] });
      await queryClient.invalidateQueries({ queryKey: ['journal', 'all-tags'] });
      await queryClient.invalidateQueries({ queryKey: ['journal', 'trade-tags-by-id'] });
    },
  });

  const save = useCallback(
    async (entry: TradeJournalEntry) => {
      await saveMutation.mutateAsync(entry);
    },
    [saveMutation],
  );

  const remove = useCallback(
    async (id: string) => {
      await removeMutation.mutateAsync(id);
    },
    [removeMutation],
  );

  return {
    entry: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    save,
    remove,
  };
}
