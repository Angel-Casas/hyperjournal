import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createJournalEntriesRepo } from '@lib/storage/journal-entries-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { SessionJournalEntry } from '@entities/journal-entry';

type Options = { db?: HyperJournalDb; limit?: number };

export type UseRecentSessionEntriesResult = {
  entries: ReadonlyArray<SessionJournalEntry>;
  isLoading: boolean;
};

const EMPTY_LIST: ReadonlyArray<SessionJournalEntry> = Object.freeze([]);

/**
 * Returns the most recent session journal entries (default 7). Used by
 * JournalPanel to list session journaling activity.
 */
export function useRecentSessionEntries(
  options: Options = {},
): UseRecentSessionEntriesResult {
  const db = options.db ?? defaultDb;
  const limit = options.limit ?? 7;
  const repo = useMemo(() => createJournalEntriesRepo(db), [db]);

  const query = useQuery<ReadonlyArray<SessionJournalEntry>>({
    queryKey: ['journal', 'recent-sessions', limit],
    queryFn: () => repo.listSessionEntries(limit),
  });

  return {
    entries: query.data ?? EMPTY_LIST,
    isLoading: query.isLoading,
  };
}
