import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
