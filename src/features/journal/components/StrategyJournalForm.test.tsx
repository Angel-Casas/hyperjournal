import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrategyJournalForm } from './StrategyJournalForm';
import { HyperJournalDb } from '@lib/storage/db';
import type { StrategyJournalEntry } from '@entities/journal-entry';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`hj-strat-form-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

async function seed(entry: Partial<StrategyJournalEntry>) {
  const full: StrategyJournalEntry = {
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
    ...entry,
  };
  await db.journalEntries.put(full);
}

function renderForm(id = 's1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StrategyJournalForm id={id} db={db} />
    </QueryClientProvider>,
  );
}

describe('StrategyJournalForm', () => {
  it('renders the seven fields', async () => {
    await seed({ id: 's1' });
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/conditions/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/invalidation/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ideal r:r/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/examples/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/recurring mistakes/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^notes$/i)).toBeInTheDocument();
  });

  it('pre-populates from an existing entry', async () => {
    await seed({ id: 's1', name: 'Breakout', idealRR: '2:1' });
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/^name$/i)).toHaveValue('Breakout'));
    expect(screen.getByLabelText(/ideal r:r/i)).toHaveValue('2:1');
  });

  it('saves name changes on blur', async () => {
    await seed({ id: 's1', name: 'Original' });
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/^name$/i)).toHaveValue('Original'));
    const field = screen.getByLabelText(/^name$/i);
    fireEvent.change(field, { target: { value: 'Renamed' } });
    fireEvent.blur(field);
    await waitFor(() => expect(screen.getByText(/saved at/i)).toBeInTheDocument());
    const row = await db.journalEntries.get('s1');
    if (!row || row.scope !== 'strategy') throw new Error('expected strategy');
    expect(row.name).toBe('Renamed');
  });

  it('saves conditions on blur', async () => {
    await seed({ id: 's1', name: 'Breakout' });
    renderForm();
    // Wait for hydration so the seeded entry is loaded into the draft
    // before we type — otherwise the hydration effect can overwrite the
    // typed text between change and blur.
    await waitFor(() => expect(screen.getByLabelText(/^name$/i)).toHaveValue('Breakout'));
    const field = screen.getByLabelText(/conditions/i);
    fireEvent.change(field, { target: { value: 'clear resistance break' } });
    fireEvent.blur(field);
    await waitFor(async () => {
      const row = await db.journalEntries.get('s1');
      if (!row || row.scope !== 'strategy') throw new Error('expected strategy');
      expect(row.conditions).toBe('clear resistance break');
    });
  });

  it('renders the Tags field with label', async () => {
    await seed({ id: 's1' });
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/^tags$/i)).toBeInTheDocument());
  });

  it('typing a tag + Enter + blur persists the tag on the Dexie row', async () => {
    await seed({ id: 's1', name: 'Breakout' });
    renderForm();
    // Wait for hydration so the seeded entry is loaded into the draft
    // before we type — otherwise the hydration effect can overwrite.
    await waitFor(() =>
      expect(screen.getByLabelText(/^name$/i)).toHaveValue('Breakout'),
    );
    const input = screen.getByLabelText(/^tags$/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'momentum' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    await waitFor(async () => {
      const row = await db.journalEntries.get('s1');
      if (!row || row.scope !== 'strategy') throw new Error('expected strategy');
      expect(row.tags).toEqual(['momentum']);
    });
  });

  it('redirects the user gracefully when the entry does not exist', async () => {
    // The form renders with id that doesn't exist in Dexie. Since this is
    // a component-level concern (not routing), the form simply shows no
    // pre-populated data and does nothing on blur (isDraftEmpty + !entry).
    renderForm('does-not-exist');
    await waitFor(() =>
      expect(screen.getByLabelText(/^name$/i)).toHaveValue(''),
    );
    fireEvent.blur(screen.getByLabelText(/^name$/i));
    await new Promise((r) => setTimeout(r, 50));
    // Empty-form blur with no existing entry should NOT create a row.
    expect(await db.journalEntries.count()).toBe(0);
  });
});

vi.mock('@lib/images/decodeImageDimensions', () => ({
  decodeImageDimensions: vi.fn(async () => ({ width: 100, height: 50 })),
}));

describe('image attachments (Session 7f)', () => {
  it('uploading an image preserves the latest text edits', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const user = userEvent.setup();
    const { container } = renderForm();

    await waitFor(() =>
      expect(screen.getByLabelText(/examples/i)).toBeInTheDocument(),
    );
    await user.type(screen.getByLabelText(/examples/i), 'unsaved text');

    // Sequence blur and image-select; see TradeJournalForm.test.tsx.
    await user.tab();
    await waitFor(async () => {
      const stored = await db.journalEntries.get('s1');
      if (!stored || stored.scope !== 'strategy') {
        throw new Error('expected a strategy entry');
      }
      expect(stored.examples).toBe('unsaved text');
    });

    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', {
      type: 'image/png',
    });
    const input = container.querySelector(
      'input[type=file][aria-label="Add image"]',
    )! as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(async () => {
      const stored = await db.journalEntries.get('s1');
      if (!stored || stored.scope !== 'strategy') {
        throw new Error('expected a strategy entry');
      }
      expect(stored.examples).toBe('unsaved text');
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
