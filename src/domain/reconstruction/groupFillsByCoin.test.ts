import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { groupFillsByCoin } from './groupFillsByCoin';
import { FillSchema } from '@lib/validation/hyperliquid';
import type { RawFill } from '@entities/fill';

const fixture = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../tests/fixtures/hyperliquid/user-fills.json'),
    'utf8',
  ),
);
const realFills: RawFill[] = fixture.map((f: unknown) => FillSchema.parse(f));

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

describe('groupFillsByCoin', () => {
  it('returns an empty map for empty input', () => {
    expect(groupFillsByCoin([])).toEqual(new Map());
  });

  it('partitions fills into one array per coin', () => {
    const input = [
      makeFill({ coin: 'BTC', time: 1, tid: 1 }),
      makeFill({ coin: 'ETH', time: 2, tid: 2 }),
      makeFill({ coin: 'BTC', time: 3, tid: 3 }),
    ];
    const out = groupFillsByCoin(input);
    expect(out.get('BTC')).toHaveLength(2);
    expect(out.get('ETH')).toHaveLength(1);
  });

  it('sorts by time ascending across different timestamps', () => {
    const input = [
      makeFill({ coin: 'BTC', time: 10, tid: 2, startPosition: 0 }),
      makeFill({ coin: 'BTC', time: 5, tid: 3, startPosition: 0 }),
    ];
    const out = groupFillsByCoin(input).get('BTC')!;
    expect(out.map((f) => f.time)).toEqual([5, 10]);
  });

  it('chains same-timestamp fills by startPosition (execution order), not by tid', () => {
    // Two Open Long fills share a millisecond. Execution order is
    // startPosition 0 → 5 → 15 (each fill adds to the position). The
    // tids here are deliberately out of that order to prove we do NOT
    // rely on tid for intra-ms ordering.
    const input = [
      // Appears first in input but is actually the SECOND execution:
      makeFill({ coin: 'BTC', time: 10, tid: 999, dir: 'Open Long', sz: 10, startPosition: 5 }),
      // Appears second in input but is the FIRST execution:
      makeFill({ coin: 'BTC', time: 10, tid: 1, dir: 'Open Long', sz: 5, startPosition: 0 }),
    ];
    const out = groupFillsByCoin(input).get('BTC')!;
    expect(out.map((f) => f.startPosition)).toEqual([0, 5]);
    expect(out.map((f) => f.tid)).toEqual([1, 999]);
  });

  it('chains same-timestamp close fills correctly', () => {
    // Two Close Long fills at the same ms. Execution: startPosition
    // 1225.7 → 458.9 → 0 (scaling down). The fill with startPosition
    // 458.9 must come SECOND even though its tid is smaller.
    const input = [
      makeFill({ coin: 'SNX', time: 10, tid: 915, dir: 'Close Long', sz: 458.9, startPosition: 458.9 }),
      makeFill({ coin: 'SNX', time: 10, tid: 815, dir: 'Close Long', sz: 766.8, startPosition: 1225.7 }),
    ];
    const out = groupFillsByCoin(input).get('SNX')!;
    expect(out.map((f) => f.startPosition)).toEqual([1225.7, 458.9]);
  });

  it('returns a Map whose iteration order matches first-seen insertion order', () => {
    const input = [
      makeFill({ coin: 'ETH', time: 1, tid: 1 }),
      makeFill({ coin: 'BTC', time: 2, tid: 2 }),
    ];
    const keys = Array.from(groupFillsByCoin(input).keys());
    expect(keys).toEqual(['ETH', 'BTC']);
  });

  it('handles the real fixture without losing fills', () => {
    const grouped = groupFillsByCoin(realFills);
    const total = Array.from(grouped.values()).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );
    expect(total).toBe(realFills.length);
  });

  it('produces per-coin arrays in execution order on the real fixture', () => {
    // Execution-order invariant: adjacent fills must either be on
    // distinct timestamps (time ascending) OR same timestamp with the
    // next fill's startPosition matching the previous fill's positionAfter.
    const ZERO_TOL = 1e-9;
    const signedDelta = (f: RawFill): number => {
      switch (f.dir) {
        case 'Open Long':
        case 'Close Short':
          return f.sz;
        case 'Open Short':
        case 'Close Long':
          return -f.sz;
        default:
          return 0;
      }
    };
    const grouped = groupFillsByCoin(realFills);
    for (const arr of grouped.values()) {
      for (let i = 1; i < arr.length; i++) {
        const prev = arr[i - 1]!;
        const curr = arr[i]!;
        expect(curr.time).toBeGreaterThanOrEqual(prev.time);
        if (curr.time === prev.time) {
          const expected = prev.startPosition + signedDelta(prev);
          expect(Math.abs(curr.startPosition - expected)).toBeLessThanOrEqual(ZERO_TOL);
        }
      }
    }
  });
});
