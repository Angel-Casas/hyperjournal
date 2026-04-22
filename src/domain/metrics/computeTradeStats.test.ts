import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FillSchema } from '@lib/validation/hyperliquid';
import { reconstructTrades } from '@domain/reconstruction/reconstructTrades';
import { computeTradeStats } from './computeTradeStats';
import type { RawFill } from '@entities/fill';
import type { ReconstructedTrade } from '@entities/trade';

const fixture = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../tests/fixtures/hyperliquid/user-fills.json'),
    'utf8',
  ),
);
const realFills: RawFill[] = fixture.map((f: unknown) => FillSchema.parse(f));
const realTrades = reconstructTrades(realFills);

const makeTrade = (overrides: Partial<ReconstructedTrade>): ReconstructedTrade => ({
  id: 'BTC-1',
  wallet: null,
  coin: 'BTC',
  side: 'long',
  status: 'closed',
  legs: [],
  openedAt: 0,
  closedAt: 1000,
  holdTimeMs: 1000,
  openedSize: 1,
  closedSize: 1,
  avgEntryPx: 100,
  avgExitPx: 110,
  realizedPnl: 10,
  totalFees: 0.1,
  provenance: 'observed',
  ...overrides,
});

describe('computeTradeStats', () => {
  it('returns the empty-stats shape for no trades', () => {
    const s = computeTradeStats([]);
    expect(s.totalPnl).toBe(0);
    expect(s.closedCount).toBe(0);
    expect(s.openCount).toBe(0);
    expect(s.winRate).toBeNull();
    expect(s.expectancy).toBeNull();
    expect(s.profitFactor).toBeNull();
    expect(s.avgWin).toBeNull();
    expect(s.avgLoss).toBeNull();
    expect(s.maxDrawdown).toBe(0);
    expect(s.maxDrawdownPct).toBeNull();
    expect(s.avgHoldTimeMs).toBeNull();
    expect(s.bestTrade).toBeNull();
    expect(s.worstTrade).toBeNull();
    expect(s.totalFees).toBe(0);
    expect(s.breakEvenCount).toBe(0);
    expect(s.provenance).toBe('derived');
  });

  it('counts open and closed trades separately', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: -5 }),
      makeTrade({ id: 'c', status: 'open', realizedPnl: 0 }),
    ];
    const s = computeTradeStats(trades);
    expect(s.closedCount).toBe(2);
    expect(s.openCount).toBe(1);
  });

  it('totalPnl sums realizedPnl across closed trades only', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 100 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: -30 }),
      makeTrade({ id: 'c', status: 'open', realizedPnl: 999 }),
    ];
    expect(computeTradeStats(trades).totalPnl).toBeCloseTo(70, 9);
  });

  it('win rate is fraction of closed trades with realizedPnl > 0', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: 20 }),
      makeTrade({ id: 'c', status: 'closed', realizedPnl: -5 }),
      makeTrade({ id: 'd', status: 'closed', realizedPnl: 0 }),
    ];
    expect(computeTradeStats(trades).winRate).toBeCloseTo(0.5, 9);
  });

  it('expectancy is average realized PnL per closed trade', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 30 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: -10 }),
    ];
    expect(computeTradeStats(trades).expectancy).toBeCloseTo(10, 9);
  });

  it('profit factor is gross-wins over gross-losses', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 30 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: 70 }),
      makeTrade({ id: 'c', status: 'closed', realizedPnl: -25 }),
    ];
    expect(computeTradeStats(trades).profitFactor).toBeCloseTo(4, 9);
  });

  it('profit factor is null when there are no losses', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: 20 }),
    ];
    expect(computeTradeStats(trades).profitFactor).toBeNull();
  });

  it('avgWin and avgLoss compute only over their respective subsets', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: 30 }),
      makeTrade({ id: 'c', status: 'closed', realizedPnl: -20 }),
    ];
    const s = computeTradeStats(trades);
    expect(s.avgWin).toBeCloseTo(20, 9);
    expect(s.avgLoss).toBeCloseTo(20, 9);
  });

  it('maxDrawdown is the worst peak-to-trough on the equity curve', () => {
    // Running equity: 50, 80 (peak), 30 (drawdown 50), 40, 60, 45 (drawdown 15 from 60)
    // Max drawdown = 50 at peak 80
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 50, closedAt: 1 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: 30, closedAt: 2 }),
      makeTrade({ id: 'c', status: 'closed', realizedPnl: -50, closedAt: 3 }),
      makeTrade({ id: 'd', status: 'closed', realizedPnl: 10, closedAt: 4 }),
      makeTrade({ id: 'e', status: 'closed', realizedPnl: 20, closedAt: 5 }),
      makeTrade({ id: 'f', status: 'closed', realizedPnl: -15, closedAt: 6 }),
    ];
    const s = computeTradeStats(trades);
    expect(s.maxDrawdown).toBeCloseTo(50, 9);
    expect(s.maxDrawdownPct).toBeCloseTo(50 / 80, 9);
  });

  it('maxDrawdown is 0 when the equity curve is monotonically non-decreasing', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 10, closedAt: 1 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: 20, closedAt: 2 }),
    ];
    expect(computeTradeStats(trades).maxDrawdown).toBe(0);
  });

  it('avgHoldTimeMs averages closed trade durations', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', holdTimeMs: 1000 }),
      makeTrade({ id: 'b', status: 'closed', holdTimeMs: 3000 }),
      makeTrade({ id: 'c', status: 'open', holdTimeMs: 9999 }),
    ];
    expect(computeTradeStats(trades).avgHoldTimeMs).toBeCloseTo(2000, 9);
  });

  it('long/short split counts and win rates are per-side', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', side: 'long', realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'closed', side: 'long', realizedPnl: -5 }),
      makeTrade({ id: 'c', status: 'closed', side: 'short', realizedPnl: 20 }),
      makeTrade({ id: 'd', status: 'closed', side: 'short', realizedPnl: 30 }),
    ];
    const s = computeTradeStats(trades);
    expect(s.longCount).toBe(2);
    expect(s.shortCount).toBe(2);
    expect(s.longWinRate).toBeCloseTo(0.5, 9);
    expect(s.shortWinRate).toBeCloseTo(1, 9);
  });

  it('best and worst reflect max/min realizedPnl', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: 200 }),
      makeTrade({ id: 'c', status: 'closed', realizedPnl: -50 }),
    ];
    const s = computeTradeStats(trades);
    expect(s.bestTrade).toBe(200);
    expect(s.worstTrade).toBe(-50);
  });

  it('total fees sums across ALL trades (opens included)', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', totalFees: 1.5 }),
      makeTrade({ id: 'b', status: 'open', totalFees: 2.5 }),
    ];
    expect(computeTradeStats(trades).totalFees).toBeCloseTo(4, 9);
  });

  it('returns null nullable-fields when every trade is still open (no closed trades)', () => {
    // Common first-load state for a wallet with only unrealized positions.
    const trades = [
      makeTrade({ id: 'a', status: 'open', realizedPnl: 0, totalFees: 1 }),
      makeTrade({ id: 'b', status: 'open', realizedPnl: 0, totalFees: 2 }),
    ];
    const s = computeTradeStats(trades);
    expect(s.openCount).toBe(2);
    expect(s.closedCount).toBe(0);
    expect(s.totalPnl).toBe(0);
    expect(s.winRate).toBeNull();
    expect(s.expectancy).toBeNull();
    expect(s.profitFactor).toBeNull();
    expect(s.avgWin).toBeNull();
    expect(s.avgLoss).toBeNull();
    expect(s.maxDrawdown).toBe(0);
    expect(s.maxDrawdownPct).toBeNull();
    expect(s.avgHoldTimeMs).toBeNull();
    expect(s.bestTrade).toBeNull();
    expect(s.worstTrade).toBeNull();
    expect(s.totalFees).toBeCloseTo(3, 9);
  });

  it('handles a single-trade array without off-by-one errors', () => {
    const trades = [
      makeTrade({
        id: 'a',
        status: 'closed',
        side: 'long',
        realizedPnl: 42,
        holdTimeMs: 5000,
        totalFees: 0.5,
      }),
    ];
    const s = computeTradeStats(trades);
    expect(s.closedCount).toBe(1);
    expect(s.totalPnl).toBe(42);
    expect(s.winRate).toBeCloseTo(1, 9);
    expect(s.expectancy).toBeCloseTo(42, 9);
    expect(s.profitFactor).toBeNull(); // no losers
    expect(s.avgWin).toBeCloseTo(42, 9);
    expect(s.avgLoss).toBeNull();
    expect(s.maxDrawdown).toBe(0); // monotone increasing
    expect(s.bestTrade).toBe(42);
    expect(s.worstTrade).toBe(42);
    expect(s.longCount).toBe(1);
    expect(s.longWinRate).toBeCloseTo(1, 9);
    expect(s.avgHoldTimeMs).toBeCloseTo(5000, 9);
    expect(s.totalFees).toBeCloseTo(0.5, 9);
  });

  it('counts break-even closed trades (realizedPnl === 0) separately from winners and losers', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: -5 }),
      makeTrade({ id: 'c', status: 'closed', realizedPnl: 0 }),
      makeTrade({ id: 'd', status: 'closed', realizedPnl: 0 }),
      makeTrade({ id: 'e', status: 'open', realizedPnl: 0 }),
    ];
    const s = computeTradeStats(trades);
    expect(s.breakEvenCount).toBe(2); // closed-and-exactly-zero only
    // Existing definitions must still exclude break-evens:
    expect(s.winRate).toBeCloseTo(1 / 4, 9); // 1 winner of 4 closed
  });

  it('breakEvenCount is zero when no closed trade has realizedPnl === 0', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'closed', realizedPnl: -5 }),
    ];
    expect(computeTradeStats(trades).breakEvenCount).toBe(0);
  });

  it('on the real fixture, totalPnl matches the sum of reconstructed realizedPnl', () => {
    const s = computeTradeStats(realTrades);
    const reconSum = realTrades
      .filter((t) => t.status === 'closed')
      .reduce((acc, t) => acc + t.realizedPnl, 0);
    expect(s.totalPnl).toBeCloseTo(reconSum, 6);
  });
});
