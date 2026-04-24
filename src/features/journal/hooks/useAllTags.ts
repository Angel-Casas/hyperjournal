import { useQuery } from '@tanstack/react-query';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';

type Options = { db?: HyperJournalDb };

export type UseAllTagsResult = {
  tags: ReadonlyArray<string>;
  isLoading: boolean;
};

const EMPTY_LIST: ReadonlyArray<string> = Object.freeze([]);

/**
 * Returns every distinct tag used across all journal variants, sorted
 * alphabetically. Powers autocomplete in the three form-level
 * TagInputs. Read-all-and-dedupe is cheap at Phase 1 volumes (dozens
 * of entries); revisit with an index-backed aggregate once entries
 * reach the thousands.
 */
export function useAllTags(options: Options = {}): UseAllTagsResult {
  const db = options.db ?? defaultDb;

  const query = useQuery<ReadonlyArray<string>>({
    queryKey: ['journal', 'all-tags'],
    queryFn: async () => {
      const rows = await db.journalEntries.toArray();
      const seen = new Set<string>();
      for (const row of rows) {
        const tags = (row as { tags?: ReadonlyArray<string> }).tags ?? [];
        for (const t of tags) seen.add(t);
      }
      return Array.from(seen).sort();
    },
  });

  return {
    tags: query.data ?? EMPTY_LIST,
    isLoading: query.isLoading,
  };
}
