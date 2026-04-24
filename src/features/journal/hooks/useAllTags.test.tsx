import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useAllTags } from './useAllTags';
import { HyperJournalDb } from '@lib/storage/db';
import type {
  SessionJournalEntry,
  StrategyJournalEntry,
  TradeJournalEntry,
} from '@entities/journal-entry';

let db: HyperJournalDb;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  db = new HyperJournalDb(`hj-all-tags-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

describe('useAllTags', () => {
  it('returns an empty array when there are no entries', async () => {
    const { result } = renderHook(() => useAllTags({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tags).toEqual([]);
  });

  it('pools tags from all three variants, dedupes, sorts alphabetically', async () => {
    const trade: TradeJournalEntry = {
      id: 't1',
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
      tags: ['breakout', 'fomc'],
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
      tags: ['fomc', 'macro'],
      provenance: 'observed',
    };
    const strat: StrategyJournalEntry = {
      id: 'st1',
      scope: 'strategy',
      createdAt: 0,
      updatedAt: 0,
      name: 'Breakout',
      conditions: '',
      invalidation: '',
      idealRR: '',
      examples: '',
      recurringMistakes: '',
      notes: '',
      tags: ['breakout', 'momentum'],
      provenance: 'observed',
    };
    await db.journalEntries.put(trade);
    await db.journalEntries.put(session);
    await db.journalEntries.put(strat);

    const { result } = renderHook(() => useAllTags({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tags).toEqual(['breakout', 'fomc', 'macro', 'momentum']);
  });
});
