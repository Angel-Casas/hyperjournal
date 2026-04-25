import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useJournalTagsByTradeId } from './useJournalTagsByTradeId';
import { HyperJournalDb } from '@lib/storage/db';
import type { SessionJournalEntry, TradeJournalEntry } from '@entities/journal-entry';

let db: HyperJournalDb;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  db = new HyperJournalDb(`hj-trade-tags-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

describe('useJournalTagsByTradeId', () => {
  it('returns an empty map when no trade entries exist', async () => {
    const { result } = renderHook(() => useJournalTagsByTradeId({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tagsByTradeId.size).toBe(0);
  });

  it('returns only trade-scope rows, keyed by tradeId', async () => {
    const trade: TradeJournalEntry = {
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
      tags: ['breakout'],
      imageIds: [],
      provenance: 'observed',
    };
    const session: SessionJournalEntry = {
      id: 's1',
      scope: 'session',
      date: '2026-04-24',
      createdAt: 0,
      updatedAt: 0,
      marketConditions: '',
      summary: '',
      whatToRepeat: '',
      whatToAvoid: '',
      mindset: null,
      disciplineScore: null,
      tags: ['ignored'],
      imageIds: [],
      provenance: 'observed',
    };
    await db.journalEntries.put(trade);
    await db.journalEntries.put(session);

    const { result } = renderHook(() => useJournalTagsByTradeId({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tagsByTradeId.size).toBe(1);
    expect(result.current.tagsByTradeId.get('BTC-1')).toEqual(['breakout']);
  });
});
