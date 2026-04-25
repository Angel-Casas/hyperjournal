import { useCallback, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createJournalEntriesRepo } from '@lib/storage/journal-entries-repo';
import { createJournalImagesRepo } from '@lib/storage/journal-images-repo';
import { validateImageBlob } from '@lib/images/validateImageBlob';
import { decodeImageDimensions } from '@lib/images/decodeImageDimensions';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { TradeJournalEntry } from '@entities/journal-entry';
import type { JournalImage, JournalImageMime } from '@entities/journal-image';

type Options = { db?: HyperJournalDb };

export const MAX_IMAGES_PER_ENTRY = 10;

export type AddImageResult =
  | { ok: true; imageId: string }
  | { ok: false; reason: 'too-big' | 'wrong-mime' | 'decode' | 'cap' | 'storage' };

export type UseTradeJournalEntryResult = {
  entry: TradeJournalEntry | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  save: (entry: TradeJournalEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
  addImage: (
    file: File,
    buildEntry: (newImageId: string) => TradeJournalEntry,
  ) => Promise<AddImageResult>;
  removeImage: (
    imageId: string,
    buildEntry: () => TradeJournalEntry,
  ) => Promise<void>;
};

/**
 * Read/write the trade journal entry for a single tradeId. Write
 * invalidates both this query and the cross-wallet tradeIds query
 * (so the pencil icon on trade-history rows updates immediately).
 *
 * Session 7f adds addImage / removeImage actions. Both run in a single
 * Dexie transaction across journalEntries + images so an image is
 * never persisted without its referencing entry update (and vice versa).
 * addImage calls are serialized via a promise chain to eliminate
 * concurrent-paste races.
 */
export function useTradeJournalEntry(
  tradeId: string,
  options: Options = {},
): UseTradeJournalEntryResult {
  const db = options.db ?? defaultDb;
  const entriesRepo = useMemo(() => createJournalEntriesRepo(db), [db]);
  const imagesRepo = useMemo(() => createJournalImagesRepo(db), [db]);
  const queryClient = useQueryClient();

  const query = useQuery<TradeJournalEntry | null>({
    queryKey: ['journal', 'trade', tradeId],
    queryFn: () => entriesRepo.findByTradeId(tradeId),
  });

  const invalidateAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['journal', 'trade', tradeId] });
    await queryClient.invalidateQueries({ queryKey: ['journal', 'trade-ids'] });
    await queryClient.invalidateQueries({ queryKey: ['journal', 'all-tags'] });
    await queryClient.invalidateQueries({ queryKey: ['journal', 'trade-tags-by-id'] });
  }, [queryClient, tradeId]);

  const saveMutation = useMutation({
    mutationFn: (entry: TradeJournalEntry) => entriesRepo.upsert(entry),
    onSuccess: invalidateAll,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => entriesRepo.remove(id),
    onSuccess: invalidateAll,
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

  // Promise-chain serializer so concurrent addImage calls (e.g. multi-image
  // paste) don't race on the entry's imageIds array.
  const pendingRef = useRef<Promise<unknown>>(Promise.resolve());

  const addImage = useCallback(
    (file: File, buildEntry: (newImageId: string) => TradeJournalEntry) => {
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
    async (imageId: string, buildEntry: () => TradeJournalEntry) => {
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
