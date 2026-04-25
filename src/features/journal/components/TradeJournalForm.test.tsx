import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TradeJournalForm } from './TradeJournalForm';
import { HyperJournalDb } from '@lib/storage/db';
import type { StrategyJournalEntry, TradeJournalEntry } from '@entities/journal-entry';

async function seedStrategy(
  db: HyperJournalDb,
  overrides: Partial<StrategyJournalEntry> & { id: string; name: string },
) {
  const full: StrategyJournalEntry = {
    scope: 'strategy',
    createdAt: 0,
    updatedAt: 0,
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
  await db.journalEntries.put(full);
}

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
      strategyId: null,
      tags: [],
      imageIds: [],
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

  it('renders the Tags field with label', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/^tags$/i)).toBeInTheDocument());
  });

  it('typing a tag + Enter + blur persists the tag on the Dexie row', async () => {
    renderForm();
    await waitFor(() => expect(screen.getByLabelText(/^tags$/i)).toBeInTheDocument());
    const input = screen.getByLabelText(/^tags$/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'breakout' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    await waitFor(async () => {
      const rows = await db.journalEntries.toArray();
      const trade = rows.find((r) => r.scope === 'trade');
      if (!trade || trade.scope !== 'trade') throw new Error('expected trade');
      expect(trade.tags).toEqual(['breakout']);
    });
  });

  it('renders the strategy picker with "— no strategy" option', async () => {
    renderForm();
    await waitFor(() =>
      expect(screen.getByLabelText(/^strategy$/i)).toBeInTheDocument(),
    );
    const select = screen.getByLabelText(/^strategy$/i) as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(
      Array.from(select.options).some((o) => /no strategy/i.test(o.textContent ?? '')),
    ).toBe(true);
  });

  it('renders strategies by name; blank names render as "Untitled"', async () => {
    await seedStrategy(db, { id: 's-a', name: 'Breakout' });
    await seedStrategy(db, { id: 's-b', name: '' });
    renderForm();
    await waitFor(() =>
      expect(screen.getByLabelText(/^strategy$/i)).toBeInTheDocument(),
    );
    await waitFor(() => {
      const select = screen.getByLabelText(/^strategy$/i) as HTMLSelectElement;
      const labels = Array.from(select.options).map((o) => o.textContent ?? '');
      expect(labels).toEqual(
        expect.arrayContaining([expect.stringMatching(/Breakout/), 'Untitled']),
      );
    });
  });

  it('selecting a strategy + blur saves strategyId', async () => {
    await seedStrategy(db, { id: 's-a', name: 'Breakout' });
    renderForm();
    await waitFor(() =>
      expect(screen.getByLabelText(/^strategy$/i)).toBeInTheDocument(),
    );
    // wait for the picker to populate with the seeded strategy
    await waitFor(() => {
      const select = screen.getByLabelText(/^strategy$/i) as HTMLSelectElement;
      expect(Array.from(select.options).some((o) => o.value === 's-a')).toBe(true);
    });
    const select = screen.getByLabelText(/^strategy$/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 's-a' } });
    fireEvent.blur(select);
    await waitFor(async () => {
      const rows = await db.journalEntries.toArray();
      const trade = rows.find((r) => r.scope === 'trade');
      if (!trade || trade.scope !== 'trade') throw new Error('expected trade');
      expect(trade.strategyId).toBe('s-a');
    });
  });

  it('selecting "— no strategy" after a prior link saves strategyId=null', async () => {
    const existing: TradeJournalEntry = {
      id: 'e1',
      scope: 'trade',
      tradeId: 'BTC-1',
      createdAt: 100,
      updatedAt: 100,
      preTradeThesis: '',
      postTradeReview: '',
      lessonLearned: '',
      mood: null,
      planFollowed: null,
      stopLossUsed: null,
      strategyId: 's-a',
      tags: [],
      imageIds: [],
      provenance: 'observed',
    };
    await db.journalEntries.put(existing);
    await seedStrategy(db, { id: 's-a', name: 'Breakout' });
    renderForm();
    await waitFor(() =>
      expect((screen.getByLabelText(/^strategy$/i) as HTMLSelectElement).value).toBe('s-a'),
    );
    const select = screen.getByLabelText(/^strategy$/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '' } });
    fireEvent.blur(select);
    await waitFor(async () => {
      const row = await db.journalEntries.get('e1');
      if (!row || row.scope !== 'trade') throw new Error('expected trade');
      expect(row.strategyId).toBeNull();
    });
  });

  it('renders "— deleted strategy" when strategyId has no matching row', async () => {
    const existing: TradeJournalEntry = {
      id: 'e1',
      scope: 'trade',
      tradeId: 'BTC-1',
      createdAt: 100,
      updatedAt: 100,
      preTradeThesis: '',
      postTradeReview: '',
      lessonLearned: '',
      mood: null,
      planFollowed: null,
      stopLossUsed: null,
      strategyId: 'gone',
      tags: [],
      imageIds: [],
      provenance: 'observed',
    };
    await db.journalEntries.put(existing);
    renderForm();
    await waitFor(() =>
      expect((screen.getByLabelText(/^strategy$/i) as HTMLSelectElement).value).toBe('gone'),
    );
    const select = screen.getByLabelText(/^strategy$/i) as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent ?? '');
    expect(labels).toEqual(
      expect.arrayContaining([expect.stringMatching(/deleted strategy/i)]),
    );
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

    // Type into postTradeReview but do NOT blur.
    await waitFor(() =>
      expect(screen.getByLabelText(/post-trade review/i)).toBeInTheDocument(),
    );
    await user.type(
      screen.getByLabelText(/post-trade review/i),
      'unsaved text',
    );

    const file = new File(
      [new Uint8Array([137, 80, 78, 71])],
      'shot.png',
      { type: 'image/png' },
    );
    const input = container.querySelector(
      'input[type=file][aria-label="Add image"]',
    )! as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(async () => {
      const stored = await db.journalEntries
        .where('tradeId')
        .equals('BTC-1')
        .first();
      if (!stored || stored.scope !== 'trade') {
        throw new Error('expected a trade entry');
      }
      expect(stored.postTradeReview).toBe('unsaved text');
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
    const heic = new File([new Uint8Array([1])], 's.heic', {
      type: 'image/heic',
    });
    // user-event.upload silently drops files that fail accept-attribute
    // matching even with applyAccept:false (jsdom-specific). fireEvent.change
    // bypasses that path entirely and is the right tool for this assertion.
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
