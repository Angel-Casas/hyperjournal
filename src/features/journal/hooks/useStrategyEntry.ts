import { useCallback, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createJournalEntriesRepo } from '@lib/storage/journal-entries-repo';
import { createJournalImagesRepo } from '@lib/storage/journal-images-repo';
import { validateImageBlob } from '@lib/images/validateImageBlob';
import { decodeImageDimensions } from '@lib/images/decodeImageDimensions';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { StrategyJournalEntry } from '@entities/journal-entry';
import type { JournalImage, JournalImageMime } from '@entities/journal-image';
import { MAX_IMAGES_PER_ENTRY, type AddImageResult } from './useTradeJournalEntry';

type Options = { db?: HyperJournalDb };

export type UseStrategyEntryResult = {
  entry: StrategyJournalEntry | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  save: (entry: StrategyJournalEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
  addImage: (
    file: File,
    buildEntry: (newImageId: string) => StrategyJournalEntry,
  ) => Promise<AddImageResult>;
  removeImage: (
    imageId: string,
    buildEntry: () => StrategyJournalEntry,
  ) => Promise<void>;
};

/**
 * Read/write the strategy journal entry for a given id (UUID).
 * Mutations invalidate this query + the strategies listing query so
 * the /strategies list updates immediately.
 *
 * Session 7f adds addImage / removeImage. Mirrors useTradeJournalEntry's
 * shape — see that file for race-safety and transaction-scope notes.
 */
export function useStrategyEntry(
  id: string,
  options: Options = {},
): UseStrategyEntryResult {
  const db = options.db ?? defaultDb;
  const entriesRepo = useMemo(() => createJournalEntriesRepo(db), [db]);
  const imagesRepo = useMemo(() => createJournalImagesRepo(db), [db]);
  const queryClient = useQueryClient();

  const query = useQuery<StrategyJournalEntry | null>({
    queryKey: ['journal', 'strategy', id],
    queryFn: () => entriesRepo.findStrategyById(id),
  });

  const invalidateAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['journal', 'strategy', id] });
    await queryClient.invalidateQueries({ queryKey: ['journal', 'strategies'] });
    await queryClient.invalidateQueries({ queryKey: ['journal', 'all-tags'] });
  }, [queryClient, id]);

  const saveMutation = useMutation({
    mutationFn: (entry: StrategyJournalEntry) => entriesRepo.upsert(entry),
    onSuccess: invalidateAll,
  });

  const removeMutation = useMutation({
    mutationFn: (rid: string) => entriesRepo.remove(rid),
    onSuccess: invalidateAll,
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

  const pendingRef = useRef<Promise<unknown>>(Promise.resolve());

  const addImage = useCallback(
    (file: File, buildEntry: (newImageId: string) => StrategyJournalEntry) => {
      const next = pendingRef.current.then(async (): Promise<AddImageResult> => {
        const validation = validateImageBlob(file);
        if (!validation.ok) return { ok: false, reason: validation.reason };

        const existing = query.data;
        if ((existing?.imageIds.length ?? 0) >= MAX_IMAGES_PER_ENTRY) {
          return { ok: false, reason: 'cap' };
        }

        let dims: { width: number; height: number };
        try {
          dims = await decodeImageDimensions(file);
        } catch {
          return { ok: false, reason: 'decode' };
        }

        const imageId = crypto.randomUUID();
        const image: JournalImage = {
          id: imageId,
          blob: file,
          mime: file.type as JournalImageMime,
          width: dims.width,
          height: dims.height,
          bytes: file.size,
          createdAt: Date.now(),
          provenance: 'observed',
        };

        const nextEntry = buildEntry(imageId);

        try {
          await db.transaction('rw', [db.journalEntries, db.images], async () => {
            await imagesRepo.create(image);
            await entriesRepo.upsert(nextEntry);
          });
        } catch {
          return { ok: false, reason: 'storage' };
        }

        await invalidateAll();
        await queryClient.invalidateQueries({
          queryKey: ['journal', 'image', imageId],
        });
        return { ok: true, imageId };
      });
      pendingRef.current = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
    [db, entriesRepo, imagesRepo, invalidateAll, queryClient, query.data],
  );

  const removeImage = useCallback(
    async (imageId: string, buildEntry: () => StrategyJournalEntry) => {
      const nextEntry = buildEntry();
      await db.transaction('rw', [db.journalEntries, db.images], async () => {
        await entriesRepo.upsert(nextEntry);
        await imagesRepo.remove(imageId);
      });
      await invalidateAll();
      await queryClient.invalidateQueries({
        queryKey: ['journal', 'image', imageId],
      });
    },
    [db, entriesRepo, imagesRepo, invalidateAll, queryClient],
  );

  return {
    entry: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    save,
    remove,
    addImage,
    removeImage,
  };
}
