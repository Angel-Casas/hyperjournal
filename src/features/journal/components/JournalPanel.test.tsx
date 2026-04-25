import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JournalPanel } from './JournalPanel';
import { HyperJournalDb } from '@lib/storage/db';
import type { SessionJournalEntry } from '@entities/journal-entry';

afterEach(() => cleanup());

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`hj-panel-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

function renderPanel(now = Date.UTC(2026, 3, 22, 12)) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <JournalPanel db={db} now={now} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('JournalPanel', () => {
  it('renders the Journal heading', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: /journal/i })).toBeInTheDocument();
  });

  it("renders the Today's journal CTA linking to /d/<today>", () => {
    renderPanel(Date.UTC(2026, 3, 22, 12));
    const cta = screen.getByRole('link', { name: /today'?s journal/i });
    expect(cta).toHaveAttribute('href', '/d/2026-04-22');
  });

  it('shows an empty state when there are no session entries', async () => {
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText(/no session journal yet/i)).toBeInTheDocument(),
    );
  });

  it('lists recent session entries with dates and teasers', async () => {
    const entry: SessionJournalEntry = {
      id: 's1',
      scope: 'session',
      date: '2026-04-20',
      createdAt: 100,
      updatedAt: 100,
      marketConditions: 'choppy',
      summary: 'short teaser',
      whatToRepeat: '',
      whatToAvoid: '',
      mindset: null,
      disciplineScore: null,
      tags: ['fomc'],
      imageIds: [],
      provenance: 'observed',
    };
    await db.journalEntries.put(entry);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/short teaser/i)).toBeInTheDocument();
    });
    const link = screen.getByRole('link', { name: /short teaser/i });
    expect(link).toHaveAttribute('href', '/d/2026-04-20');
    expect(screen.getByText('fomc')).toBeInTheDocument();
  });

  it('renders a "Strategies →" link to /strategies', () => {
    renderPanel();
    const link = screen.getByRole('link', { name: /strategies/i });
    expect(link).toHaveAttribute('href', '/strategies');
  });
});
