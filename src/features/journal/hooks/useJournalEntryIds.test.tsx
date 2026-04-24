import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useJournalEntryIds } from './useJournalEntryIds';
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
  db = new HyperJournalDb(`hj-ids-hook-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

describe('useJournalEntryIds', () => {
  it('returns an empty Set when no entries exist', async () => {
    const { result } = renderHook(() => useJournalEntryIds({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.ids.size).toBe(0);
  });

  it('returns a Set of tradeIds for existing entries', async () => {
    const entry: TradeJournalEntry = {
      id: 'e1',
      scope: 'trade',
      tradeId: 'BTC-1',
      createdAt: 0,
      updatedAt: 0,
      preTradeThesis: '',
      postTradeReview: '',
      lessonLearned: '',
      mood: null,
      planFollowed: null,
      stopLossUsed: null,
      strategyId: null,
      tags: [],
      provenance: 'observed',
    };
    await db.journalEntries.put(entry);
    const { result } = renderHook(() => useJournalEntryIds({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.ids.has('BTC-1')).toBe(true);
    expect(result.current.ids.size).toBe(1);
  });
});
