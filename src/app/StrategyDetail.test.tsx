import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrategyDetail } from './StrategyDetail';
import { HyperJournalDb } from '@lib/storage/db';
import type { StrategyJournalEntry } from '@entities/journal-entry';

afterEach(() => cleanup());

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`hj-strat-detail-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

async function seed(entry: Partial<StrategyJournalEntry> & { id: string }) {
  const full: StrategyJournalEntry = {
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
    provenance: 'observed',
    ...entry,
  };
  await db.journalEntries.put(full);
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/strategies" element={<div data-testid="strategies-list">list</div>} />
          <Route path="/s/:id" element={<StrategyDetail db={db} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StrategyDetail', () => {
  it('redirects to /strategies when the id does not exist', async () => {
    renderAt('/s/does-not-exist');
    await waitFor(() => expect(screen.getByTestId('strategies-list')).toBeInTheDocument());
  });

  it('renders the strategy name as the heading and a form', async () => {
    await seed({ id: 'abc', name: 'Breakout' });
    renderAt('/s/abc');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/breakout/i);
    expect(screen.getByRole('heading', { level: 2, name: /^strategy$/i })).toBeInTheDocument();
  });

  it('shows "Untitled" when the name is blank', async () => {
    await seed({ id: 'abc', name: '' });
    renderAt('/s/abc');
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/untitled/i),
    );
  });
});
