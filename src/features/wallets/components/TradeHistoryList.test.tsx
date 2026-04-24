import { afterEach, describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TradeHistoryList } from './TradeHistoryList';
import type { ReconstructedTrade } from '@entities/trade';
import type { WalletAddress } from '@entities/wallet';

afterEach(() => cleanup());

const ADDR = '0x0000000000000000000000000000000000000001' as WalletAddress;

function wrap(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const makeTrade = (o: Partial<ReconstructedTrade>): ReconstructedTrade => ({
  id: 'x',
  wallet: null,
  coin: 'BTC',
  side: 'long',
  status: 'closed',
  legs: [],
  openedAt: 1704067200000, // 2024-01-01
  closedAt: 1704153600000, // 2024-01-02
  holdTimeMs: 86_400_000, // 1d
  openedSize: 1,
  closedSize: 1,
  avgEntryPx: 100,
  avgExitPx: 110,
  realizedPnl: 10,
  totalFees: 0.1,
  provenance: 'observed',
  ...o,
});

describe('TradeHistoryList', () => {
  it('renders an empty-state message when there are no trades', () => {
    render(wrap(<TradeHistoryList trades={[]} address={ADDR} />));
    expect(screen.getByText(/no trades yet/i)).toBeInTheDocument();
  });

  it('renders column headers when there are trades', () => {
    render(wrap(<TradeHistoryList trades={[makeTrade({ id: 'a' })]} address={ADDR} />));
    expect(screen.getByRole('columnheader', { name: /coin/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /side/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /opened/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /status/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /pnl/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /held/i })).toBeInTheDocument();
  });

  it('renders section with trade-history heading', () => {
    render(wrap(<TradeHistoryList trades={[makeTrade({ id: 'a' })]} address={ADDR} />));
    expect(screen.getByRole('heading', { name: /trade history/i })).toBeInTheDocument();
  });

  it('renders rowgroup container with correct count indicator', () => {
    const trades = [
      makeTrade({ id: 'old', coin: 'ETH' }),
      makeTrade({ id: 'new', coin: 'BTC' }),
      makeTrade({ id: 'open', status: 'open', coin: 'SOL' }),
    ];
    render(wrap(<TradeHistoryList trades={trades} address={ADDR} />));
    const rowgroups = screen.getAllByRole('rowgroup');
    expect(rowgroups).toHaveLength(2);
    expect(rowgroups[1]).toHaveStyle({ height: '120px' });
  });

  it('wraps the columnheaders in a role="table" landmark', () => {
    render(wrap(<TradeHistoryList trades={[makeTrade({ id: 'a' })]} address={ADDR} />));
    expect(screen.getByRole('table', { name: /trade history/i })).toBeInTheDocument();
  });

  // Body-row assertions (links, pencil icons) need real DOM layout for
  // @tanstack/react-virtual to produce virtual items. jsdom can't
  // compute scroll geometry, so getVirtualItems() returns [] and
  // body rows aren't rendered. Those assertions live in the Playwright
  // journal round-trip E2E spec where a real browser is available.
  it('accepts the address prop and renders without crashing with journal integration', () => {
    render(wrap(<TradeHistoryList trades={[makeTrade({ id: 'BTC-1', coin: 'BTC' })]} address={ADDR} />));
    // Smoke: the heading + table landmark survive the Link + journal hook
    // wiring without throwing.
    expect(screen.getByRole('heading', { name: /trade history/i })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /trade history/i })).toBeInTheDocument();
  });

  it('accepts the tradeTagsByTradeId prop and renders without crashing', () => {
    const tagsByTradeId = new Map<string, ReadonlyArray<string>>([
      ['BTC-1', ['breakout', 'fomc']],
    ]);
    render(
      wrap(
        <TradeHistoryList
          trades={[makeTrade({ id: 'BTC-1', coin: 'BTC' })]}
          address={ADDR}
          tradeTagsByTradeId={tagsByTradeId}
        />,
      ),
    );
    // Smoke: body rows don't render in jsdom (virtualizer geometry), so
    // we only check the component accepts the prop shape + the table
    // landmark still mounts. E2E covers on-screen chip rendering.
    expect(screen.getByRole('table', { name: /trade history/i })).toBeInTheDocument();
  });
});
