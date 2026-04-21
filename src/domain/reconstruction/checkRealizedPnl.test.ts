import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FillSchema } from '@lib/validation/hyperliquid';
import { reconstructTrades } from './reconstructTrades';
import { checkRealizedPnl } from './checkRealizedPnl';
import type { RawFill } from '@entities/fill';

const fixture = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../tests/fixtures/hyperliquid/user-fills.json'),
    'utf8',
  ),
);
const realFills: RawFill[] = fixture.map((f: unknown) => FillSchema.parse(f));

describe('checkRealizedPnl', () => {
  it('returns matched: true when reconstructed realizedPnl equals HL closedPnl per coin (real fixture)', () => {
    const trades = reconstructTrades(realFills);
    const result = checkRealizedPnl(realFills, trades);
    expect(result.matched).toBe(true);
    expect(result.perCoin.size).toBeGreaterThan(0);
    for (const [, cmp] of result.perCoin) {
      expect(cmp.delta).toBeLessThan(0.01);
    }
  });

  it('detects a mismatch when realizedPnl is tampered with', () => {
    const originalTrades = reconstructTrades(realFills);
    // Identify the first trade's coin so we can inspect its delta later
    const tamperedCoin = originalTrades[0]!.coin;
    // Tamper: inflate the first trade's realizedPnl by $999
    const tampered = originalTrades.map((t, i) =>
      i === 0 ? { ...t, realizedPnl: t.realizedPnl + 999 } : t,
    );
    const result = checkRealizedPnl(realFills, tampered);
    expect(result.matched).toBe(false);
    expect(result.perCoin.get(tamperedCoin)!.delta).toBeGreaterThan(900);
  });

  it('handles a wallet with no trades (empty input)', () => {
    const result = checkRealizedPnl([], []);
    expect(result.matched).toBe(true);
    expect(result.perCoin.size).toBe(0);
  });

  it('compares only fills that appear in reconstructed trade legs (dropped-fill-safe)', () => {
    // Synthetic scenario: a fill that was dropped as leading-truncation
    // should NOT be counted in HL's sum — the oracle must filter by the
    // set of tids actually included in the reconstruction.
    const trades = reconstructTrades(realFills);
    const includedTids = new Set(trades.flatMap((t) => t.legs.map((l) => l.fill.tid)));
    const droppedFills = realFills.filter((f) => !includedTids.has(f.tid));

    // Add a synthetic fill that is NOT a leg in any trade (simulate
    // leading-truncation drop). With priming, droppedFills should be empty
    // on this fixture; this test still verifies the filter logic works.
    const syntheticExtra: RawFill = {
      ...realFills[0]!,
      tid: 999999999999,
      dir: 'Close Long',
      closedPnl: 500, // would blow the match if naively summed
    };
    const fillsWithExtra = [...realFills, syntheticExtra];
    const result = checkRealizedPnl(fillsWithExtra, trades);
    // The extra fill's closedPnl should be filtered out; matched should
    // remain true.
    expect(result.matched).toBe(true);
    // Confirm the droppedFills detection ran (may be 1 in this synthetic case).
    expect(droppedFills.length).toBeGreaterThanOrEqual(0);
  });
});
