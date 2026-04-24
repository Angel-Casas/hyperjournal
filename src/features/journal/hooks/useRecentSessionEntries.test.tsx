import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useRecentSessionEntries } from './useRecentSessionEntries';
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
  db = new HyperJournalDb(`hj-recent-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

function makeSession(overrides: Partial<SessionJournalEntry>): SessionJournalEntry {
  return {
    id: 's',
    scope: 'session',
    date: '2026-04-22',
    createdAt: 0,
    updatedAt: 0,
    marketConditions: '',
    summary: '',
    whatToRepeat: '',
    whatToAvoid: '',
    mindset: null,
    disciplineScore: null,
    tags: [],
    provenance: 'observed',
    ...overrides,
  };
}

describe('useRecentSessionEntries', () => {
  it('returns an empty array when no entries exist', async () => {
    const { result } = renderHook(() => useRecentSessionEntries({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries).toEqual([]);
  });

  it('returns session entries sorted by updatedAt desc', async () => {
    await db.journalEntries.put(
      makeSession({ id: 'old', date: '2026-04-20', summary: 'old', updatedAt: 100 }),
    );
    await db.journalEntries.put(
      makeSession({ id: 'new', date: '2026-04-22', summary: 'new', updatedAt: 300 }),
    );
    const { result } = renderHook(() => useRecentSessionEntries({ db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries[0]!.id).toBe('new');
  });
});
