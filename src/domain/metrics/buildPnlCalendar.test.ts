import { describe, expect, it } from 'vitest';
import { buildPnlCalendar } from './buildPnlCalendar';
import type { ReconstructedTrade } from '@entities/trade';

const makeTrade = (o: Partial<ReconstructedTrade>): ReconstructedTrade => ({
  id: 'x',
  wallet: null,
  coin: 'BTC',
  side: 'long',
  status: 'closed',
  legs: [],
  openedAt: 0,
  closedAt: 0,
  holdTimeMs: 0,
  openedSize: 0,
  closedSize: 0,
  avgEntryPx: 0,
  avgExitPx: null,
  realizedPnl: 0,
  totalFees: 0,
  provenance: 'observed',
  ...o,
});

describe('buildPnlCalendar', () => {
  it('returns an empty map for no trades', () => {
    expect(buildPnlCalendar([]).size).toBe(0);
  });

  it('buckets closed trades by UTC date, summing PnL and counting trades', () => {
    // 2024-03-15 12:00 UTC  = 1710504000000
    // 2024-03-15 23:59 UTC  = 1710547199000
    // 2024-03-16 01:00 UTC  = 1710550800000
    const trades = [
      makeTrade({ id: 'a', status: 'closed', closedAt: 1710504000000, realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'closed', closedAt: 1710547199000, realizedPnl: 5 }),
      makeTrade({ id: 'c', status: 'closed', closedAt: 1710550800000, realizedPnl: -3 }),
    ];
    const cal = buildPnlCalendar(trades);
    expect(cal.size).toBe(2);
    expect(cal.get('2024-03-15')).toEqual({ date: '2024-03-15', pnl: 15, tradeCount: 2 });
    expect(cal.get('2024-03-16')).toEqual({ date: '2024-03-16', pnl: -3, tradeCount: 1 });
  });

  it('excludes open trades from buckets', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', closedAt: 1710504000000, realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'open', closedAt: 1710504000000, realizedPnl: 999 }),
    ];
    const cal = buildPnlCalendar(trades);
    expect(cal.get('2024-03-15')!.tradeCount).toBe(1);
    expect(cal.get('2024-03-15')!.pnl).toBe(10);
  });

  it('pads single-digit months and days to YYYY-MM-DD', () => {
    // 2024-01-05 00:00 UTC = 1704412800000
    const trades = [
      makeTrade({ id: 'a', status: 'closed', closedAt: 1704412800000, realizedPnl: 1 }),
    ];
    const cal = buildPnlCalendar(trades);
    expect(cal.has('2024-01-05')).toBe(true);
  });

  it('aggregates many trades on the same day into one bucket', () => {
    const base = 1710504000000; // 2024-03-15 12:00 UTC
    const trades = [
      makeTrade({ id: 'a', status: 'closed', closedAt: base, realizedPnl: 1 }),
      makeTrade({ id: 'b', status: 'closed', closedAt: base + 1, realizedPnl: 2 }),
      makeTrade({ id: 'c', status: 'closed', closedAt: base + 2, realizedPnl: 3 }),
      makeTrade({ id: 'd', status: 'closed', closedAt: base + 3, realizedPnl: 4 }),
    ];
    const cal = buildPnlCalendar(trades);
    expect(cal.get('2024-03-15')!.tradeCount).toBe(4);
    expect(cal.get('2024-03-15')!.pnl).toBeCloseTo(10, 9);
  });
});
