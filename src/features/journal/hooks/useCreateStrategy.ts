import { useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createJournalEntriesRepo } from '@lib/storage/journal-entries-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { StrategyJournalEntry } from '@entities/journal-entry';

type Options = { db?: HyperJournalDb };

export type UseCreateStrategyResult = {
  create: (name: string) => Promise<string>;
  isLoading: boolean;
};

/**
 * Creates a new strategy journal entry with the given name. Other
 * content fields start empty. Returns the new id (UUID v4) so the
 * caller can navigate to /s/:id immediately.
 */
export function useCreateStrategy(options: Options = {}): UseCreateStrategyResult {
  const db = options.db ?? defaultDb;
  const repo = useMemo(() => createJournalEntriesRepo(db), [db]);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (name: string) => {
      const now = Date.now();
      const id = crypto.randomUUID();
      const entry: StrategyJournalEntry = {
        id,
        scope: 'strategy',
        createdAt: now,
        updatedAt: now,
        name,
        conditions: '',
        invalidation: '',
        idealRR: '',
        examples: '',
        recurringMistakes: '',
        notes: '',
        tags: [],
        imageIds: [],
        provenance: 'observed',
      };
      await repo.upsert(entry);
      return id;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['journal', 'strategies'] });
    },
  });

  const create = useCallback(
    async (name: string) => mutation.mutateAsync(name),
    [mutation],
  );

  return {
    create,
    isLoading: mutation.isPending,
  };
}
