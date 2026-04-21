import { describe, expect, it } from 'vitest';
import { reconstructCoinTrades } from './reconstructCoinTrades';
import type { RawFill } from '@entities/fill';

const makeFill = (overrides: Partial<RawFill>): RawFill => ({
  coin: 'BTC',
  px: 100,
  sz: 1,
  side: 'B',
  time: 0,
  startPosition: 0,
  dir: 'Open Long',
  closedPnl: 0,
  hash: '',
  oid: 0,
  crossed: true,
  fee: 0,
  tid: 0,
  feeToken: 'USDC',
  twapId: null,
  ...overrides,
});

describe('reconstructCoinTrades', () => {
  it('returns no trades for an empty fill list', () => {
    expect(reconstructCoinTrades('BTC', [])).toEqual([]);
  });

  it('reconstructs a simple open→close long trade', () => {
    const fills = [
      makeFill({ dir: 'Open Long', px: 100, sz: 1, time: 1, tid: 1, fee: 0.1 }),
      makeFill({ dir: 'Close Long', px: 110, sz: 1, time: 2, tid: 2, fee: 0.1, closedPnl: 10 }),
    ];
    const [trade] = reconstructCoinTrades('BTC', fills);
    expect(trade).toBeDefined();
    expect(trade!.side).toBe('long');
    expect(trade!.status).toBe('closed');
    expect(trade!.legs).toHaveLength(2);
    expect(trade!.avgEntryPx).toBeCloseTo(100, 9);
    expect(trade!.avgExitPx).toBeCloseTo(110, 9);
    expect(trade!.realizedPnl).toBeCloseTo(10, 9);
    expect(trade!.totalFees).toBeCloseTo(0.2, 9);
    expect(trade!.openedSize).toBeCloseTo(1, 9);
    expect(trade!.closedSize).toBeCloseTo(1, 9);
    expect(trade!.openedAt).toBe(1);
    expect(trade!.closedAt).toBe(2);
    expect(trade!.holdTimeMs).toBe(1);
  });

  it('computes size-weighted averages across multiple opens and a single close', () => {
    const fills = [
      makeFill({ dir: 'Open Long', px: 100, sz: 1, time: 1, tid: 1 }),
      makeFill({ dir: 'Open Long', px: 110, sz: 3, time: 2, tid: 2 }),
      makeFill({ dir: 'Close Long', px: 120, sz: 4, time: 3, tid: 3, closedPnl: 50 }),
    ];
    const [trade] = reconstructCoinTrades('BTC', fills);
    // Entry avg = (100*1 + 110*3) / 4 = 107.5
    expect(trade!.avgEntryPx).toBeCloseTo(107.5, 9);
    expect(trade!.avgExitPx).toBeCloseTo(120, 9);
    expect(trade!.openedSize).toBeCloseTo(4, 9);
    expect(trade!.closedSize).toBeCloseTo(4, 9);
    expect(trade!.realizedPnl).toBeCloseTo(50, 9);
  });

  it('handles a short trade', () => {
    const fills = [
      makeFill({ dir: 'Open Short', px: 100, sz: 2, side: 'A', time: 1, tid: 1 }),
      makeFill({ dir: 'Close Short', px: 90, sz: 2, side: 'B', time: 2, tid: 2, closedPnl: 20 }),
    ];
    const [trade] = reconstructCoinTrades('BTC', fills);
    expect(trade!.side).toBe('short');
    expect(trade!.realizedPnl).toBeCloseTo(20, 9);
  });

  it('emits an open-status trade for an unclosed position at the end', () => {
    const fills = [makeFill({ dir: 'Open Long', px: 100, sz: 1, time: 1, tid: 1 })];
    const trades = reconstructCoinTrades('BTC', fills);
    expect(trades).toHaveLength(1);
    expect(trades[0]!.status).toBe('open');
    expect(trades[0]!.avgExitPx).toBeNull();
    expect(trades[0]!.closedSize).toBe(0);
    expect(trades[0]!.realizedPnl).toBe(0);
  });

  it('emits two trades for a close → open sequence (after a full close)', () => {
    const fills = [
      makeFill({ dir: 'Open Long', px: 100, sz: 1, time: 1, tid: 1 }),
      makeFill({ dir: 'Close Long', px: 110, sz: 1, time: 2, tid: 2, closedPnl: 10 }),
      makeFill({ dir: 'Open Short', px: 110, sz: 1, side: 'A', time: 3, tid: 3 }),
      makeFill({ dir: 'Close Short', px: 100, sz: 1, side: 'B', time: 4, tid: 4, closedPnl: 10 }),
    ];
    const trades = reconstructCoinTrades('BTC', fills);
    expect(trades).toHaveLength(2);
    expect(trades[0]!.side).toBe('long');
    expect(trades[0]!.status).toBe('closed');
    expect(trades[1]!.side).toBe('short');
    expect(trades[1]!.status).toBe('closed');
  });

  it('deterministically IDs trades by coin + first leg tid', () => {
    const fills = [
      makeFill({ dir: 'Open Long', sz: 1, time: 1, tid: 42 }),
      makeFill({ dir: 'Close Long', sz: 1, time: 2, tid: 43 }),
    ];
    const [trade] = reconstructCoinTrades('BTC', fills);
    expect(trade!.id).toBe('BTC-42');
  });

  it('primes from startPosition when the first fill enters mid-position (truncated history on opens)', () => {
    // Simulates a coin like xyz:NVDA where opens were truncated away: first
    // fill is a Close Long but the user was already long 10 units entering
    // the window.
    const fills = [
      makeFill({ dir: 'Close Long', px: 120, sz: 4, time: 1, tid: 1, startPosition: 10, closedPnl: 80 }),
      makeFill({ dir: 'Close Long', px: 130, sz: 6, time: 2, tid: 2, startPosition: 6, closedPnl: 180 }),
    ];
    const trades = reconstructCoinTrades('BTC', fills);
    expect(trades).toHaveLength(1);
    expect(trades[0]!.status).toBe('closed');
    expect(trades[0]!.side).toBe('long');
    expect(trades[0]!.openedSize).toBeCloseTo(0, 9); // all opens are pre-window
    expect(trades[0]!.closedSize).toBeCloseTo(10, 9);
    expect(trades[0]!.avgEntryPx).toBeNull();
    expect(trades[0]!.avgExitPx).toBeCloseTo((120 * 4 + 130 * 6) / 10, 9);
    expect(trades[0]!.realizedPnl).toBeCloseTo(260, 9);
  });

  it('drops a pure leading close (startPosition=0 but close arrives anyway — malformed/edge)', () => {
    // Edge case: startPosition=0 and first fill is a close. HL shouldn't
    // produce this but be defensive; drop silently.
    const fills = [
      makeFill({ dir: 'Close Long', sz: 1, time: 1, tid: 1, startPosition: 0, closedPnl: 10 }),
      makeFill({ dir: 'Open Long', px: 100, sz: 1, time: 2, tid: 2, startPosition: 0 }),
      makeFill({ dir: 'Close Long', px: 110, sz: 1, time: 3, tid: 3, startPosition: 1, closedPnl: 10 }),
    ];
    const trades = reconstructCoinTrades('BTC', fills);
    expect(trades).toHaveLength(1);
    expect(trades[0]!.legs).toHaveLength(2);
    expect(trades[0]!.legs[0]!.fill.tid).toBe(2);
    expect(trades[0]!.realizedPnl).toBeCloseTo(10, 9);
  });

  it('primes from negative startPosition (pre-existing short position)', () => {
    const fills = [
      makeFill({ dir: 'Close Short', px: 90, sz: 5, time: 1, tid: 1, startPosition: -5, closedPnl: 50 }),
    ];
    const trades = reconstructCoinTrades('BTC', fills);
    expect(trades).toHaveLength(1);
    expect(trades[0]!.side).toBe('short');
    expect(trades[0]!.status).toBe('closed');
    expect(trades[0]!.closedSize).toBeCloseTo(5, 9);
    expect(trades[0]!.openedSize).toBe(0);
    expect(trades[0]!.avgEntryPx).toBeNull();
  });

  it('throws a typed error on a mid-stream dangling close (corruption, not truncation)', () => {
    const fills = [
      // Normal open → close cycle (hasSeenOpen = true afterwards)
      makeFill({ dir: 'Open Long', sz: 1, time: 1, tid: 1 }),
      makeFill({ dir: 'Close Long', sz: 1, time: 2, tid: 2, closedPnl: 10 }),
      // Now a dangling close AFTER the reset — this is real corruption
      makeFill({ dir: 'Close Long', sz: 1, time: 3, tid: 3, closedPnl: 5 }),
    ];
    expect(() => reconstructCoinTrades('BTC', fills)).toThrow(/dangling close/i);
  });

  it('throws on an unknown dir value', () => {
    const fills = [
      makeFill({ dir: 'Liquidation' }), // runtime guard test — dir is string so no TS error, but dirToRole must throw
    ];
    expect(() => reconstructCoinTrades('BTC', fills)).toThrow(/unknown dir/i);
  });

  it('throws on a close that would flip position sign (unsupported in v1)', () => {
    const fills = [
      makeFill({ dir: 'Open Long', sz: 1, time: 1, tid: 1 }),
      makeFill({ dir: 'Close Long', sz: 2, time: 2, tid: 2 }), // tries to close 2 with only 1 open
    ];
    expect(() => reconstructCoinTrades('BTC', fills)).toThrow(/oversized close|flip/i);
  });

  it('throws when an Open arrives with the opposite side of an in-progress trade', () => {
    const fills = [
      makeFill({ dir: 'Open Long', sz: 1, time: 1, tid: 1 }),
      makeFill({ dir: 'Open Short', sz: 1, time: 2, tid: 2 }),
    ];
    expect(() => reconstructCoinTrades('BTC', fills)).toThrow(/open short while long/i);
  });

  it('throws when a Close arrives with the opposite side of an in-progress trade', () => {
    const fills = [
      makeFill({ dir: 'Open Long', sz: 1, time: 1, tid: 1 }),
      makeFill({ dir: 'Close Short', sz: 1, time: 2, tid: 2 }),
    ];
    expect(() => reconstructCoinTrades('BTC', fills)).toThrow(/close short while long/i);
  });
});
