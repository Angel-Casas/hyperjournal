import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useSessionJournalEntry } from './useSessionJournalEntry';
import { HyperJournalDb } from '@lib/storage/db';
import type { SessionJournalEntry } from '@entities/journal-entry';

let db: HyperJournalDb;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  db = new HyperJournalDb(`hj-session-hook-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

function makeEntry(overrides: Partial<SessionJournalEntry> = {}): SessionJournalEntry {
  return {
    id: 's1',
    scope: 'session',
    date: '2026-04-22',
    createdAt: 100,
    updatedAt: 100,
    marketConditions: '',
    summary: '',
    whatToRepeat: '',
    whatToAvoid: '',
    mindset: null,
    disciplineScore: null,
    tags: [],
    imageIds: [],
    provenance: 'observed',
    ...overrides,
  };
}

describe('useSessionJournalEntry', () => {
  it('returns null when no entry exists for the date', async () => {
    const { result } = renderHook(() => useSessionJournalEntry('2026-04-22', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entry).toBeNull();
  });

  it('returns the entry when one exists', async () => {
    await db.journalEntries.put(makeEntry({ summary: 's' }));
    const { result } = renderHook(() => useSessionJournalEntry('2026-04-22', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entry?.summary).toBe('s');
  });

  it('save() upserts and refreshes the query', async () => {
    const { result } = renderHook(() => useSessionJournalEntry('2026-04-22', { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.save(makeEntry({ summary: 'new' }));
    });
    await waitFor(() => expect(result.current.entry?.summary).toBe('new'));
  });
});

vi.mock('@lib/images/decodeImageDimensions', () => ({
  decodeImageDimensions: vi.fn(async () => ({ width: 100, height: 50 })),
}));

describe('addImage / removeImage (Session 7f)', () => {
  it('addImage validates, writes image + entry atomically, and returns ok', async () => {
    const { result } = renderHook(
      () => useSessionJournalEntry('2026-04-25', { db }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', {
      type: 'image/png',
    });
    const buildEntry = (newImageId: string): SessionJournalEntry =>
      makeEntry({ date: '2026-04-25', summary: 'reflection', imageIds: [newImageId] });

    let res!: Awaited<ReturnType<typeof result.current.addImage>>;
    await act(async () => {
      res = await result.current.addImage(file, buildEntry);
    });

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');

    const stored = await db.journalEntries
      .where('date')
      .equals('2026-04-25')
      .first();
    expect(stored?.imageIds).toEqual([res.imageId]);
    const img = await db.images.get(res.imageId);
    expect(img?.mime).toBe('image/png');
    expect(img?.bytes).toBe(3);
  });

  it('addImage returns wrong-mime for HEIC', async () => {
    const { result } = renderHook(
      () => useSessionJournalEntry('2026-04-25', { db }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const heic = new File([new Uint8Array([1])], 's.heic', { type: 'image/heic' });
    let res!: Awaited<ReturnType<typeof result.current.addImage>>;
    await act(async () => {
      res = await result.current.addImage(heic, () =>
        makeEntry({ date: '2026-04-25' }),
      );
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
    await db.journalEntries.put(
      makeEntry({ date: '2026-04-25', imageIds: ['img-1'] }),
    );

    const { result } = renderHook(
      () => useSessionJournalEntry('2026-04-25', { db }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.entry).not.toBeNull());

    const buildEntry = (): SessionJournalEntry =>
      makeEntry({ date: '2026-04-25', imageIds: [] });

    await act(async () => {
      await result.current.removeImage('img-1', buildEntry);
    });

    expect(await db.images.get('img-1')).toBeUndefined();
    const stored = await db.journalEntries
      .where('date')
      .equals('2026-04-25')
      .first();
    expect(stored?.imageIds).toEqual([]);
  });
});
