import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
