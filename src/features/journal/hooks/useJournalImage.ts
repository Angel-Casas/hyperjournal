import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import { createJournalImagesRepo } from '@lib/storage/journal-images-repo';
import type { JournalImage, JournalImageMime } from '@entities/journal-image';

type Options = { db?: HyperJournalDb };

export type UseJournalImageResult = {
  url: string | null;
  mime: JournalImageMime | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  isLoading: boolean;
};

/**
 * Resolves a JournalImage id to a blob URL with full lifecycle management.
 * Subsequent consumers of the same id share via TanStack Query's cache.
 * The blob URL is revoked on unmount or when the underlying image changes.
 */
export function useJournalImage(
  imageId: string,
  options: Options = {},
): UseJournalImageResult {
  const db = options.db ?? defaultDb;
  const repo = useMemo(() => createJournalImagesRepo(db), [db]);

  const query = useQuery<JournalImage | null>({
    queryKey: ['journal', 'image', imageId],
    queryFn: () => repo.getById(imageId),
  });

  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!query.data) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(query.data.blob);
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
    };
  }, [query.data]);

  return {
    url,
    mime: query.data?.mime ?? null,
    width: query.data?.width ?? null,
    height: query.data?.height ?? null,
    bytes: query.data?.bytes ?? null,
    isLoading: query.isLoading,
  };
}
