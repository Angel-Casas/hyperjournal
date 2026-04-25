import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useStrategyEntry } from './useStrategyEntry';
import { HyperJournalDb } from '@lib/storage/db';
import type { StrategyJournalEntry } from '@entities/journal-entry';

let db: HyperJournalDb;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  db = new HyperJournalDb(`hj-strategy-hook-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

function makeEntry(overrides: Partial<StrategyJournalEntry> = {}): StrategyJournalEntry {
  return {
    id: 's1',
    scope: 'strategy',
    createdAt: 100,
    updatedAt: 100,
    name: '',
    conditions: '',
    invalidation: '',
    idealRR: '',
    examples: '',
    recurringMistakes: '',
    notes: '',
    tags: [],
    imageIds: [],
    provenance: 'observed',
    ...overrides,
  };
}

describe('useStrategyEntry', () => {
  it('returns null when no entry exists for the id', async () => {
    const { result } = renderHook(() => useStrategyEntry('s1', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entry).toBeNull();
  });

  it('returns the entry when one exists', async () => {
    await db.journalEntries.put(makeEntry({ name: 'Breakout' }));
    const { result } = renderHook(() => useStrategyEntry('s1', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entry?.name).toBe('Breakout');
  });

  it('save() upserts and refreshes the query', async () => {
    const { result } = renderHook(() => useStrategyEntry('s1', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.save(makeEntry({ name: 'new' }));
    });
    await waitFor(() => expect(result.current.entry?.name).toBe('new'));
  });
});

vi.mock('@lib/images/decodeImageDimensions', () => ({
  decodeImageDimensions: vi.fn(async () => ({ width: 100, height: 50 })),
}));

describe('addImage / removeImage (Session 7f)', () => {
  it('addImage validates, writes image + entry atomically, and returns ok', async () => {
    const { result } = renderHook(() => useStrategyEntry('s1', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', {
      type: 'image/png',
    });
    const buildEntry = (newImageId: string): StrategyJournalEntry =>
      makeEntry({ name: 'Breakout', imageIds: [newImageId] });

    let res!: Awaited<ReturnType<typeof result.current.addImage>>;
    await act(async () => {
      res = await result.current.addImage(file, buildEntry);
    });

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');

    const stored = await db.journalEntries.get('s1');
    expect(stored && 'imageIds' in stored ? stored.imageIds : null).toEqual([
      res.imageId,
    ]);
    const img = await db.images.get(res.imageId);
    expect(img?.mime).toBe('image/png');
    expect(img?.bytes).toBe(3);
  });

  it('addImage returns wrong-mime for HEIC', async () => {
    const { result } = renderHook(() => useStrategyEntry('s1', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const heic = new File([new Uint8Array([1])], 's.heic', { type: 'image/heic' });
    let res!: Awaited<ReturnType<typeof result.current.addImage>>;
    await act(async () => {
      res = await result.current.addImage(heic, () => makeEntry());
    });
    expect(res).toEqual({ ok: false, reason: 'wrong-mime' });
    expect(await db.images.count()).toBe(0);
  });

  it('removeImage deletes the row and rewrites the entry', async () => {
    await db.images.put({
      id: 'img-1',
      blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
      mime: 'image/png',
      width: 1,
      height: 1,
      bytes: 1,
      createdAt: 0,
      provenance: 'observed',
    });
    await db.journalEntries.put(makeEntry({ imageIds: ['img-1'] }));

    const { result } = renderHook(() => useStrategyEntry('s1', { db }), { wrapper });
    await waitFor(() => expect(result.current.entry).not.toBeNull());

    const buildEntry = (): StrategyJournalEntry => makeEntry({ imageIds: [] });

    await act(async () => {
      await result.current.removeImage('img-1', buildEntry);
    });

    expect(await db.images.get('img-1')).toBeUndefined();
    const stored = await db.journalEntries.get('s1');
    expect(stored && 'imageIds' in stored ? stored.imageIds : null).toEqual([]);
  });
});
