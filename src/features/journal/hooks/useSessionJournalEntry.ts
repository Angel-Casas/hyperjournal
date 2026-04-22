import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createJournalEntriesRepo } from '@lib/storage/journal-entries-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { SessionJournalEntry } from '@entities/journal-entry';

type Options = { db?: HyperJournalDb };

export type UseSessionJournalEntryResult = {
  entry: SessionJournalEntry | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  save: (entry: SessionJournalEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

/**
 * Read/write the session journal entry for a given date (YYYY-MM-DD).
 * Mutations invalidate this query + the recent-sessions listing query
 * so the JournalPanel updates immediately.
 */
export function useSessionJournalEntry(
  date: string,
  options: Options = {},
): UseSessionJournalEntryResult {
  const db = options.db ?? defaultDb;
  const repo = useMemo(() => createJournalEntriesRepo(db), [db]);
  const queryClient = useQueryClient();

  const query = useQuery<SessionJournalEntry | null>({
    queryKey: ['journal', 'session', date],
    queryFn: () => repo.findByDate(date),
  });

  const saveMutation = useMutation({
    mutationFn: (entry: SessionJournalEntry) => repo.upsert(entry),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['journal', 'session', date] });
      await queryClient.invalidateQueries({ queryKey: ['journal', 'recent-sessions'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => repo.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['journal', 'session', date] });
      await queryClient.invalidateQueries({ queryKey: ['journal', 'recent-sessions'] });
    },
  });

  const save = useCallback(
    async (entry: SessionJournalEntry) => {
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
