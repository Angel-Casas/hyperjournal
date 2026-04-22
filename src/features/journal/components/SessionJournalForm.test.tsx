import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionJournalForm } from './SessionJournalForm';
import { HyperJournalDb } from '@lib/storage/db';
import type { SessionJournalEntry } from '@entities/journal-entry';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`hj-session-form-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

function renderForm(date = '2026-04-22') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SessionJournalForm date={date} db={db} />
    </QueryClientProvider>,
  );
}

describe('SessionJournalForm', () => {
  it('renders the six fields', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/market conditions/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/summary/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/what to repeat/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/what to avoid/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mindset/i)).toBeInTheDocument();
    expect(screen.getByText(/discipline score/i)).toBeInTheDocument();
  });

  it('pre-populates from an existing entry', async () => {
    const entry: SessionJournalEntry = {
      id: 's1',
      scope: 'session',
      date: '2026-04-22',
      createdAt: 100,
      updatedAt: 100,
      marketConditions: 'choppy',
      summary: '',
      whatToRepeat: '',
      whatToAvoid: '',
      mindset: 'focused',
      disciplineScore: 4,
      provenance: 'observed',
    };
    await db.journalEntries.put(entry);
    renderForm();
    await waitFor(() => {
      expect(screen.getByLabelText(/market conditions/i)).toHaveValue('choppy');
    });
    expect(screen.getByLabelText(/mindset/i)).toHaveValue('focused');
    expect(screen.getByRole('radio', { name: /^4$/ })).toBeChecked();
  });

  it('saves on blur and shows the saved indicator', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/market conditions/i)).toBeInTheDocument());
    const field = screen.getByLabelText(/market conditions/i);
    fireEvent.change(field, { target: { value: 'trending' } });
    fireEvent.blur(field);
    await waitFor(() => expect(screen.getByText(/saved at/i)).toBeInTheDocument());
    const rows = await db.journalEntries.toArray();
    expect(rows).toHaveLength(1);
    const first = rows[0]!;
    if (first.scope !== 'session') throw new Error('expected session entry');
    expect(first.marketConditions).toBe('trending');
    expect(first.date).toBe('2026-04-22');
  });

  it('empty-form blur does NOT create a row', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/market conditions/i)).toBeInTheDocument());
    fireEvent.blur(screen.getByLabelText(/market conditions/i));
    await new Promise((r) => setTimeout(r, 50));
    expect(await db.journalEntries.count()).toBe(0);
  });

  it('changing mindset + blurring saves', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/mindset/i)).toBeInTheDocument());
    const mindset = screen.getByLabelText(/mindset/i) as HTMLSelectElement;
    fireEvent.change(mindset, { target: { value: 'tilted' } });
    fireEvent.blur(mindset);
    await waitFor(async () => {
      const rows = await db.journalEntries.toArray();
      expect(rows).toHaveLength(1);
      const first = rows[0]!;
      if (first.scope !== 'session') throw new Error('expected session entry');
      expect(first.mindset).toBe('tilted');
    });
  });

  it('selecting a discipline score + blurring saves', async () => {
    renderForm();
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /^3$/ })).toBeInTheDocument(),
    );
    const three = screen.getByRole('radio', { name: /^3$/ });
    fireEvent.click(three);
    fireEvent.blur(three);
    await waitFor(async () => {
      const rows = await db.journalEntries.toArray();
      expect(rows).toHaveLength(1);
      const first = rows[0]!;
      if (first.scope !== 'session') throw new Error('expected session entry');
      expect(first.disciplineScore).toBe(3);
    });
  });
});
