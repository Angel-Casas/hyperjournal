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
      tags: [],
      imageIds: [],
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

  it('renders the Tags field with label', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/^tags$/i)).toBeInTheDocument());
  });

  it('typing a tag + Enter + blur persists the tag on the Dexie row', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/^tags$/i)).toBeInTheDocument());
    const input = screen.getByLabelText(/^tags$/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'fomc' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    await waitFor(async () => {
      const rows = await db.journalEntries.toArray();
      const session = rows.find((r) => r.scope === 'session');
      if (!session || session.scope !== 'session') throw new Error('expected session');
      expect(session.tags).toEqual(['fomc']);
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

vi.mock('@lib/images/decodeImageDimensions', () => ({
  decodeImageDimensions: vi.fn(async () => ({ width: 100, height: 50 })),
}));

describe('image attachments (Session 7f)', () => {
  it('uploading an image flushes pending text edits in the same save', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const user = userEvent.setup();
    const { container } = renderForm();

    await waitFor(() =>
      expect(screen.getByLabelText(/what to avoid/i)).toBeInTheDocument(),
    );
    await user.type(screen.getByLabelText(/what to avoid/i), 'unsaved text');

    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', {
      type: 'image/png',
    });
    const input = container.querySelector(
      'input[type=file][aria-label="Add image"]',
    )! as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(async () => {
      const rows = await db.journalEntries.toArray();
      const stored = rows[0];
      if (!stored || stored.scope !== 'session') {
        throw new Error('expected a session entry');
      }
      expect(stored.whatToAvoid).toBe('unsaved text');
      expect(stored.imageIds).toHaveLength(1);
    });
  });

  it('shows the wrong-mime banner when uploading a HEIC', async () => {
    const { container } = renderForm();
    await waitFor(() =>
      expect(
        container.querySelector('input[type=file][aria-label="Add image"]'),
      ).toBeInTheDocument(),
    );
    const input = container.querySelector(
      'input[type=file][aria-label="Add image"]',
    )! as HTMLInputElement;
    const heic = new File([new Uint8Array([1])], 's.heic', { type: 'image/heic' });
    Object.defineProperty(input, 'files', {
      value: [heic],
      configurable: true,
    });
    fireEvent.change(input);

    expect(
      await screen.findByText(/only PNG, JPEG, WebP, and GIF are supported/i),
    ).toBeInTheDocument();
  });
});
