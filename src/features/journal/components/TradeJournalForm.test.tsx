import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TradeJournalForm } from './TradeJournalForm';
import { HyperJournalDb } from '@lib/storage/db';
import type { TradeJournalEntry } from '@entities/journal-entry';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`hj-form-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

function renderForm(tradeId = 'BTC-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TradeJournalForm tradeId={tradeId} db={db} />
    </QueryClientProvider>,
  );
}

describe('TradeJournalForm', () => {
  it('renders the six fields', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/pre-trade thesis/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/post-trade review/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/lesson learned/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mood/i)).toBeInTheDocument();
    expect(screen.getByText(/plan followed/i)).toBeInTheDocument();
    expect(screen.getByText(/stop-loss used/i)).toBeInTheDocument();
  });

  it('pre-populates from an existing entry', async () => {
    const entry: TradeJournalEntry = {
      id: 'e1',
      scope: 'trade',
      tradeId: 'BTC-1',
      createdAt: 100,
      updatedAt: 100,
      preTradeThesis: 'my thesis',
      postTradeReview: '',
      lessonLearned: '',
      mood: 'calm',
      planFollowed: null,
      stopLossUsed: null,
      provenance: 'observed',
    };
    await db.journalEntries.put(entry);
    renderForm();
    await waitFor(() => {
      expect(screen.getByLabelText(/pre-trade thesis/i)).toHaveValue('my thesis');
    });
    expect(screen.getByLabelText(/mood/i)).toHaveValue('calm');
  });

  it('saves on blur and shows the saved indicator', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/pre-trade thesis/i)).toBeInTheDocument());
    const field = screen.getByLabelText(/pre-trade thesis/i);
    fireEvent.change(field, { target: { value: 'typed' } });
    fireEvent.blur(field);
    await waitFor(() => expect(screen.getByText(/saved at/i)).toBeInTheDocument());
    const rows = await db.journalEntries.toArray();
    expect(rows).toHaveLength(1);
    const first = rows[0]!;
    if (first.scope !== 'trade') throw new Error('expected trade entry');
    expect(first.preTradeThesis).toBe('typed');
  });

  it('empty-form blur does NOT create a row', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/pre-trade thesis/i)).toBeInTheDocument());
    fireEvent.blur(screen.getByLabelText(/pre-trade thesis/i));
    // Give TanStack Query / Dexie a moment; no save should happen.
    await new Promise((r) => setTimeout(r, 50));
    expect(await db.journalEntries.count()).toBe(0);
  });

  it('changing mood + blurring saves', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/mood/i)).toBeInTheDocument());
    const mood = screen.getByLabelText(/mood/i) as HTMLSelectElement;
    fireEvent.change(mood, { target: { value: 'regretful' } });
    fireEvent.blur(mood);
    await waitFor(async () => {
      const rows = await db.journalEntries.toArray();
      expect(rows).toHaveLength(1);
      const first = rows[0]!;
      if (first.scope !== 'trade') throw new Error('expected trade entry');
      expect(first.mood).toBe('regretful');
    });
  });

  it('changing a tri-state + blurring saves', async () => {
    renderForm();
    await waitFor(() =>
      expect(screen.getAllByRole('radio', { name: /^yes$/i })[0]).toBeInTheDocument(),
    );
    const planYes = screen.getAllByRole('radio', { name: /^yes$/i })[0]!;
    fireEvent.click(planYes);
    fireEvent.blur(planYes);
    await waitFor(async () => {
      const rows = await db.journalEntries.toArray();
      expect(rows).toHaveLength(1);
      const first = rows[0]!;
      if (first.scope !== 'trade') throw new Error('expected trade entry');
      expect(first.planFollowed).toBe(true);
    });
  });
});
