import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useStrategies } from './useStrategies';
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
  db = new HyperJournalDb(`hj-strategies-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

function makeStrategy(overrides: Partial<StrategyJournalEntry>): StrategyJournalEntry {
  return {
    id: 's',
    scope: 'strategy',
    createdAt: 0,
    updatedAt: 0,
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

describe('useStrategies', () => {
  it('returns an empty array when no strategies exist', async () => {
    const { result } = renderHook(() => useStrategies({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries).toEqual([]);
  });

  it('returns strategies sorted by updatedAt desc', async () => {
    await db.journalEntries.put(
      makeStrategy({ id: 'old', name: 'Old', updatedAt: 100 }),
    );
    await db.journalEntries.put(
      makeStrategy({ id: 'new', name: 'New', updatedAt: 300 }),
    );
    const { result } = renderHook(() => useStrategies({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries[0]!.id).toBe('new');
  });
});
