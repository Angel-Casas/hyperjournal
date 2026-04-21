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

  it('sorts each coin bucket by time ascending, with tid as a stable tiebreaker', () => {
    const input = [
      makeFill({ coin: 'BTC', time: 10, tid: 2 }),
      makeFill({ coin: 'BTC', time: 10, tid: 1 }),
      makeFill({ coin: 'BTC', time: 5, tid: 3 }),
    ];
    const out = groupFillsByCoin(input).get('BTC')!;
    expect(out.map((f) => f.tid)).toEqual([3, 1, 2]);
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

  it('produces per-coin arrays sorted by time in the real fixture', () => {
    const grouped = groupFillsByCoin(realFills);
    for (const arr of grouped.values()) {
      for (let i = 1; i < arr.length; i++) {
        const prev = arr[i - 1]!;
        const curr = arr[i]!;
        expect(curr.time).toBeGreaterThanOrEqual(prev.time);
        if (curr.time === prev.time) {
          expect(curr.tid).toBeGreaterThanOrEqual(prev.tid);
        }
      }
    }
  });
});
