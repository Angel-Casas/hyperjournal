import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useTradeJournalEntry } from './useTradeJournalEntry';
import { HyperJournalDb } from '@lib/storage/db';
import type { TradeJournalEntry } from '@entities/journal-entry';

let db: HyperJournalDb;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  db = new HyperJournalDb(`hj-journal-hook-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

function makeEntry(overrides: Partial<TradeJournalEntry> = {}): TradeJournalEntry {
  return {
    id: 'e1',
    scope: 'trade',
    tradeId: 'BTC-1',
    createdAt: 100,
    updatedAt: 100,
    preTradeThesis: '',
    postTradeReview: '',
    lessonLearned: '',
    mood: null,
    planFollowed: null,
    stopLossUsed: null,
    strategyId: null,
    tags: [],
    imageIds: [],
    provenance: 'observed',
    ...overrides,
  };
}

describe('useTradeJournalEntry', () => {
  it('returns null when no entry exists', async () => {
    const { result } = renderHook(() => useTradeJournalEntry('BTC-1', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entry).toBeNull();
  });

  it('returns the entry when one exists', async () => {
    await db.journalEntries.put(makeEntry({ preTradeThesis: 'thesis' }));
    const { result } = renderHook(() => useTradeJournalEntry('BTC-1', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entry?.preTradeThesis).toBe('thesis');
  });

  it('save() upserts the entry and refreshes the query', async () => {
    const { result } = renderHook(() => useTradeJournalEntry('BTC-1', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.save(makeEntry({ preTradeThesis: 'new' }));
    });
    await waitFor(() => expect(result.current.entry?.preTradeThesis).toBe('new'));
  });

  it('remove() deletes the entry', async () => {
    await db.journalEntries.put(makeEntry());
    const { result } = renderHook(() => useTradeJournalEntry('BTC-1', { db }), { wrapper });
    await waitFor(() => expect(result.current.entry).not.toBeNull());
    await act(async () => {
      await result.current.remove('e1');
    });
    await waitFor(() => expect(result.current.entry).toBeNull());
  });
});

// Mock decodeImageDimensions so tests don't go through Image()/URL.
vi.mock('@lib/images/decodeImageDimensions', () => ({
  decodeImageDimensions: vi.fn(async () => ({ width: 100, height: 50 })),
}));

describe('addImage / removeImage (Session 7f)', () => {
  it('addImage validates, writes image + entry atomically, and returns ok', async () => {
    const { result } = renderHook(() => useTradeJournalEntry('TRD-1', { db }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', {
      type: 'image/png',
    });
    const buildEntry = (newImageId: string): TradeJournalEntry =>
      makeEntry({
        tradeId: 'TRD-1',
        preTradeThesis: 'thesis',
        imageIds: [newImageId],
      });

    let res!: Awaited<ReturnType<typeof result.current.addImage>>;
    await act(async () => {
      res = await result.current.addImage(file, buildEntry);
    });

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');

    const stored = await db.journalEntries.get('e1');
    expect(stored?.imageIds).toEqual([res.imageId]);
    const img = await db.images.get(res.imageId);
    expect(img?.mime).toBe('image/png');
    expect(img?.bytes).toBe(3);
  });

  it('addImage returns wrong-mime for HEIC', async () => {
    const { result } = renderHook(() => useTradeJournalEntry('TRD-1', { db }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const heic = new File([new Uint8Array([1])], 'shot.heic', {
      type: 'image/heic',
    });
    let res!: Awaited<ReturnType<typeof result.current.addImage>>;
    await act(async () => {
      res = await result.current.addImage(heic, () => makeEntry({ tradeId: 'TRD-1' }));
    });
    expect(res).toEqual({ ok: false, reason: 'wrong-mime' });
    // No entry or image should have been written.
    expect(await db.journalEntries.where('tradeId').equals('TRD-1').count()).toBe(0);
    expect(await db.images.count()).toBe(0);
  });

  it('removeImage deletes the row and rewrites the entry', async () => {
    // Seed: entry with one image (image goes through fake-indexeddb but
    // we never need to read its blob in this test).
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
    await db.journalEntries.put(
      makeEntry({ tradeId: 'TRD-1', imageIds: ['img-1'] }),
    );

    const { result } = renderHook(() => useTradeJournalEntry('TRD-1', { db }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.entry).not.toBeNull());

    const buildEntry = (): TradeJournalEntry =>
      makeEntry({ tradeId: 'TRD-1', imageIds: [] });

    await act(async () => {
      await result.current.removeImage('img-1', buildEntry);
    });

    expect(await db.images.get('img-1')).toBeUndefined();
    expect((await db.journalEntries.get('e1'))?.imageIds).toEqual([]);
  });
});
