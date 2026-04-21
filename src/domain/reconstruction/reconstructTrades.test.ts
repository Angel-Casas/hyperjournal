import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reconstructTrades } from './reconstructTrades';
import { FillSchema } from '@lib/validation/hyperliquid';
import type { RawFill } from '@entities/fill';

const fixture = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../tests/fixtures/hyperliquid/user-fills.json'),
    'utf8',
  ),
);
const realFills: RawFill[] = fixture.map((f: unknown) => FillSchema.parse(f));

describe('reconstructTrades', () => {
  it('returns an empty array for no fills', () => {
    expect(reconstructTrades([])).toEqual([]);
  });

  it('produces trades from the real fixture covering every coin present', () => {
    const trades = reconstructTrades(realFills);
    const coinsInFills = new Set(realFills.map((f) => f.coin));
    const coinsInTrades = new Set(trades.map((t) => t.coin));
    expect(coinsInTrades).toEqual(coinsInFills);
  });

  it('every leg in the output belongs to its trade by coin', () => {
    const trades = reconstructTrades(realFills);
    for (const trade of trades) {
      for (const leg of trade.legs) {
        expect(leg.fill.coin).toBe(trade.coin);
      }
    }
  });

  it('the union of all legs equals the input fill set (one-to-one)', () => {
    const trades = reconstructTrades(realFills);
    const legTids = trades.flatMap((t) => t.legs.map((l) => l.fill.tid));
    expect(legTids.sort()).toEqual(realFills.map((f) => f.tid).sort());
  });

  // HL caps userFills at 2000 entries. Trades can enter the window
  // mid-position, so openedSize (window opens) need not balance closedSize
  // (window closes). The strict size-balance invariant only holds for
  // cold-start trades; the Task 5 PnL oracle is the real correctness gate.
  it('every trade has at least one leg and non-negative sizes', () => {
    const trades = reconstructTrades(realFills);
    for (const t of trades) {
      expect(t.legs.length).toBeGreaterThan(0);
      expect(t.openedSize).toBeGreaterThanOrEqual(0);
      expect(t.closedSize).toBeGreaterThanOrEqual(0);
    }
  });

  it('trades with no opens in the window have avgEntryPx === null (truncation case)', () => {
    const trades = reconstructTrades(realFills);
    for (const t of trades) {
      if (t.openedSize === 0) {
        expect(t.avgEntryPx).toBeNull();
      } else {
        expect(t.avgEntryPx).not.toBeNull();
      }
    }
  });

  it('trades with no closes have avgExitPx === null and realizedPnl === 0', () => {
    const trades = reconstructTrades(realFills);
    for (const t of trades) {
      if (t.closedSize === 0) {
        expect(t.avgExitPx).toBeNull();
        expect(t.realizedPnl).toBe(0);
      } else {
        expect(t.avgExitPx).not.toBeNull();
      }
    }
  });
});
