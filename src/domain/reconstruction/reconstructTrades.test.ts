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

  it('closed trades have closedSize approximately equal to openedSize', () => {
    const trades = reconstructTrades(realFills);
    for (const t of trades.filter((t) => t.status === 'closed')) {
      expect(Math.abs(t.closedSize - t.openedSize)).toBeLessThan(1e-6);
    }
  });

  it('open trades have closedSize === 0 and avgExitPx === null', () => {
    const trades = reconstructTrades(realFills);
    for (const t of trades.filter((t) => t.status === 'open')) {
      expect(t.closedSize).toBe(0);
      expect(t.avgExitPx).toBeNull();
      expect(t.realizedPnl).toBe(0);
    }
  });
});
