import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createJournalEntriesRepo } from '@lib/storage/journal-entries-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { StrategyJournalEntry } from '@entities/journal-entry';

type Options = { db?: HyperJournalDb; limit?: number };

export type UseStrategiesResult = {
  entries: ReadonlyArray<StrategyJournalEntry>;
  isLoading: boolean;
};

const EMPTY_LIST: ReadonlyArray<StrategyJournalEntry> = Object.freeze([]);

/**
 * Returns every strategy ordered by updatedAt desc. Default: no limit.
 * Consumed by the /strategies list page.
 */
export function useStrategies(options: Options = {}): UseStrategiesResult {
  const db = options.db ?? defaultDb;
  const limit = options.limit;
  const repo = useMemo(() => createJournalEntriesRepo(db), [db]);

  const query = useQuery<ReadonlyArray<StrategyJournalEntry>>({
    queryKey: ['journal', 'strategies', limit ?? 'all'],
    queryFn: () => repo.listStrategies(limit),
  });

  return {
    entries: query.data ?? EMPTY_LIST,
    isLoading: query.isLoading,
  };
}
