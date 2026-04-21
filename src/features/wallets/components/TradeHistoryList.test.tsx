import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TradeHistoryList } from './TradeHistoryList';
import type { ReconstructedTrade } from '@entities/trade';

afterEach(() => cleanup());

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
    render(<TradeHistoryList trades={[]} />);
    expect(screen.getByText(/no trades yet/i)).toBeInTheDocument();
  });

  it('renders column headers when there are trades', () => {
    render(<TradeHistoryList trades={[makeTrade({ id: 'a' })]} />);
    expect(screen.getByRole('columnheader', { name: /coin/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /side/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /opened/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /status/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /pnl/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /held/i })).toBeInTheDocument();
  });

  it('renders section with trade-history heading', () => {
    render(<TradeHistoryList trades={[makeTrade({ id: 'a' })]} />);
    expect(screen.getByRole('heading', { name: /trade history/i })).toBeInTheDocument();
  });

  it('renders rowgroup container with correct count indicator', () => {
    const trades = [
      makeTrade({ id: 'old', coin: 'ETH' }),
      makeTrade({ id: 'new', coin: 'BTC' }),
      makeTrade({ id: 'open', status: 'open', coin: 'SOL' }),
    ];
    render(<TradeHistoryList trades={trades} />);
    const rowgroup = screen.getByRole('rowgroup');
    // Rowgroup style height should match: count * ROW_HEIGHT (40px)
    expect(rowgroup).toHaveStyle({ height: '120px' });
  });
});
