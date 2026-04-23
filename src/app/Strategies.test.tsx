import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Strategies } from './Strategies';
import { HyperJournalDb } from '@lib/storage/db';
import type { StrategyJournalEntry } from '@entities/journal-entry';

afterEach(() => cleanup());

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`hj-strats-page-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

function renderAt(path = '/strategies') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<div data-testid="home">home</div>} />
          <Route path="/strategies" element={<Strategies db={db} />} />
          <Route path="/s/:id" element={<div data-testid="detail">detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Strategies', () => {
  it('renders the page heading and Back link', () => {
    renderAt();
    expect(screen.getByRole('heading', { name: /^strategies$/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '/');
  });

  it('shows the empty state when no strategies exist', async () => {
    renderAt();
    await waitFor(() =>
      expect(screen.getByText(/no strategies yet/i)).toBeInTheDocument(),
    );
  });

  it('lists existing strategies with names and teasers', async () => {
    const entry: StrategyJournalEntry = {
      id: 'abc',
      scope: 'strategy',
      createdAt: 0,
      updatedAt: 100,
      name: 'Breakout',
      conditions: 'clear resistance break',
      invalidation: '',
      idealRR: '',
      examples: '',
      recurringMistakes: '',
      notes: '',
      provenance: 'observed',
    };
    await db.journalEntries.put(entry);
    renderAt();
    await waitFor(() => expect(screen.getByText(/breakout/i)).toBeInTheDocument());
    expect(screen.getByText(/clear resistance break/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /breakout/i })).toHaveAttribute('href', '/s/abc');
  });

  it('shows an inline error when submitting an empty name', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(screen.getByText(/give the strategy a name/i)).toBeInTheDocument();
  });

  it('creates a strategy on valid submit and navigates to /s/:id', async () => {
    renderAt();
    const input = await screen.findByLabelText(/new strategy name/i);
    fireEvent.change(input, { target: { value: 'Breakout' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => expect(screen.getByTestId('detail')).toBeInTheDocument());
    const rows = await db.journalEntries.toArray();
    expect(rows).toHaveLength(1);
    if (rows[0]!.scope !== 'strategy') throw new Error('expected strategy');
    expect(rows[0]!.name).toBe('Breakout');
  });
});
