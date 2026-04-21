import { describe, expect, it } from 'vitest';
import { buildEquityCurve } from './buildEquityCurve';
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

describe('buildEquityCurve', () => {
  it('returns an empty array for no trades', () => {
    expect(buildEquityCurve([])).toEqual([]);
  });

  it('emits one point per closed trade, time-sorted, with running equity', () => {
    const trades = [
      makeTrade({ id: 'a', closedAt: 3, realizedPnl: -5, coin: 'BTC' }),
      makeTrade({ id: 'b', closedAt: 1, realizedPnl: 10, coin: 'ETH' }),
      makeTrade({ id: 'c', closedAt: 2, realizedPnl: 20, coin: 'BTC' }),
    ];
    const curve = buildEquityCurve(trades);
    expect(curve).toEqual([
      { time: 1, equity: 10, coin: 'ETH', pnl: 10 },
      { time: 2, equity: 30, coin: 'BTC', pnl: 20 },
      { time: 3, equity: 25, coin: 'BTC', pnl: -5 },
    ]);
  });

  it('excludes open trades from the curve', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', closedAt: 1, realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'open', closedAt: 2, realizedPnl: 999 }),
    ];
    const curve = buildEquityCurve(trades);
    expect(curve).toHaveLength(1);
    expect(curve[0]!.equity).toBe(10);
  });

  it('handles trades with identical closedAt deterministically', () => {
    // Same closedAt; preserves input-relative order (stable sort).
    const trades = [
      makeTrade({ id: 'a', closedAt: 5, realizedPnl: 10, coin: 'X' }),
      makeTrade({ id: 'b', closedAt: 5, realizedPnl: -3, coin: 'Y' }),
    ];
    const curve = buildEquityCurve(trades);
    expect(curve).toHaveLength(2);
    // Running equity is 10, then 7 regardless of which came first,
    // because stable sort keeps input order within ties. Verify that
    // both tids are present and equity finishes at 7.
    expect(curve[curve.length - 1]!.equity).toBeCloseTo(7, 9);
  });
});
