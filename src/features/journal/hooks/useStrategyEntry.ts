import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createJournalEntriesRepo } from '@lib/storage/journal-entries-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { StrategyJournalEntry } from '@entities/journal-entry';

type Options = { db?: HyperJournalDb };

export type UseStrategyEntryResult = {
  entry: StrategyJournalEntry | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  save: (entry: StrategyJournalEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

/**
 * Read/write the strategy journal entry for a given id (UUID).
 * Mutations invalidate this query + the strategies listing query so
 * the /strategies list updates immediately.
 */
export function useStrategyEntry(
  id: string,
  options: Options = {},
): UseStrategyEntryResult {
  const db = options.db ?? defaultDb;
  const repo = useMemo(() => createJournalEntriesRepo(db), [db]);
  const queryClient = useQueryClient();

  const query = useQuery<StrategyJournalEntry | null>({
    queryKey: ['journal', 'strategy', id],
    queryFn: () => repo.findStrategyById(id),
  });

  const saveMutation = useMutation({
    mutationFn: (entry: StrategyJournalEntry) => repo.upsert(entry),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['journal', 'strategy', id] });
      await queryClient.invalidateQueries({ queryKey: ['journal', 'strategies'] });
      await queryClient.invalidateQueries({ queryKey: ['journal', 'all-tags'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (rid: string) => repo.remove(rid),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['journal', 'strategy', id] });
      await queryClient.invalidateQueries({ queryKey: ['journal', 'strategies'] });
      await queryClient.invalidateQueries({ queryKey: ['journal', 'all-tags'] });
    },
  });

  const save = useCallback(
    async (entry: StrategyJournalEntry) => {
      await saveMutation.mutateAsync(entry);
    },
    [saveMutation],
  );

  const remove = useCallback(
    async (rid: string) => {
      await removeMutation.mutateAsync(rid);
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
