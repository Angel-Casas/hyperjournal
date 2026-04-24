import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TradeDetail } from './TradeDetail';
import { HyperJournalDb } from '@lib/storage/db';
import { useWalletMetrics } from '@features/wallets';
import type { ReconstructedTrade } from '@entities/trade';
import type {
  StrategyJournalEntry,
  TradeJournalEntry,
} from '@entities/journal-entry';

vi.mock('@features/wallets', async () => {
  const actual = await vi.importActual<typeof import('@features/wallets')>(
    '@features/wallets',
  );
  return {
    ...actual,
    useWalletMetrics: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`hj-trade-detail-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

const TEST_ADDR = '0x0000000000000000000000000000000000000001';

function makeTrade(overrides: Partial<ReconstructedTrade> = {}): ReconstructedTrade {
  return {
    id: 'BTC-1',
    wallet: null,
    coin: 'BTC',
    side: 'long',
    status: 'closed',
    legs: [],
    openedAt: 1_700_000_000_000,
    closedAt: 1_700_000_500_000,
    holdTimeMs: 500_000,
    openedSize: 1,
    closedSize: 1,
    avgEntryPx: 50_000,
    avgExitPx: 51_000,
    realizedPnl: 1000,
    totalFees: 10,
    provenance: 'observed',
    ...overrides,
  };
}

function mockMetrics(trades: ReadonlyArray<ReconstructedTrade>) {
  (useWalletMetrics as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    stats: null,
    trades,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refresh: vi.fn().mockResolvedValue(undefined),
  });
}

async function seedTradeJournal(
  overrides: Partial<TradeJournalEntry> & { tradeId: string },
) {
  const full: TradeJournalEntry = {
    id: 'te-1',
    scope: 'trade',
    createdAt: 100,
    updatedAt: 100,
    preTradeThesis: '',
    postTradeReview: '',
    lessonLearned: '',
    mood: null,
    planFollowed: null,
    stopLossUsed: null,
    strategyId: null,
    tags: [],
    provenance: 'observed',
    ...overrides,
  };
  await db.journalEntries.put(full);
}

async function seedStrategy(
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
    provenance: 'observed',
    ...overrides,
  };
  await db.journalEntries.put(full);
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<div data-testid="home">home</div>} />
          <Route path="/w/:address" element={<div data-testid="wallet-view">wallet view</div>} />
          <Route path="/s/:id" element={<div data-testid="strategy-detail">strategy detail</div>} />
          <Route path="/w/:address/t/:tradeId" element={<TradeDetail db={db} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TradeDetail routing', () => {
  it('redirects when the address is invalid', () => {
    mockMetrics([]);
    renderAt('/w/not-a-hex/t/BTC-1');
    expect(screen.getByTestId('home')).toBeInTheDocument();
  });

  it('redirects to /w/:address when the tradeId does not match any trade', () => {
    mockMetrics([]);
    renderAt(`/w/${TEST_ADDR}/t/NONEXISTENT`);
    expect(screen.getByTestId('wallet-view')).toBeInTheDocument();
  });
});

describe('TradeDetail strategy chip', () => {
  it('chip is not rendered when the trade has no linked strategy', async () => {
    mockMetrics([makeTrade({ id: 'BTC-1' })]);
    await seedTradeJournal({ tradeId: 'BTC-1', strategyId: null });
    renderAt(`/w/${TEST_ADDR}/t/BTC-1`);
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/^Strategy:/i)).toBeNull();
  });

  it('chip renders with strategy name and links to /s/:id', async () => {
    mockMetrics([makeTrade({ id: 'BTC-1' })]);
    await seedStrategy({ id: 's-a', name: 'Breakout' });
    await seedTradeJournal({ tradeId: 'BTC-1', strategyId: 's-a' });
    renderAt(`/w/${TEST_ADDR}/t/BTC-1`);
    await waitFor(() => expect(screen.getByText(/Strategy:\s*Breakout/i)).toBeInTheDocument());
    const chip = screen.getByText(/Strategy:\s*Breakout/i).closest('a');
    expect(chip).toHaveAttribute('href', '/s/s-a');
  });

  it('chip shows "Strategy: Untitled" when the linked strategy has a blank name', async () => {
    mockMetrics([makeTrade({ id: 'BTC-1' })]);
    await seedStrategy({ id: 's-a', name: '' });
    await seedTradeJournal({ tradeId: 'BTC-1', strategyId: 's-a' });
    renderAt(`/w/${TEST_ADDR}/t/BTC-1`);
    await waitFor(() => expect(screen.getByText(/Strategy:\s*Untitled/i)).toBeInTheDocument());
  });

  it('chip is not rendered when the strategyId points at a nonexistent strategy', async () => {
    mockMetrics([makeTrade({ id: 'BTC-1' })]);
    await seedTradeJournal({ tradeId: 'BTC-1', strategyId: 'gone' });
    renderAt(`/w/${TEST_ADDR}/t/BTC-1`);
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/^Strategy:/i)).toBeNull();
  });
});
