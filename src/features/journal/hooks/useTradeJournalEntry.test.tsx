import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
