import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { UserFillsResponseSchema, ClearinghouseStateSchema } from './hyperliquid';

const fixturesDir = resolve(__dirname, '../../../tests/fixtures/hyperliquid');

describe('UserFillsResponseSchema', () => {
  it('parses the committed user-fills fixture without errors', () => {
    const raw = JSON.parse(readFileSync(resolve(fixturesDir, 'user-fills.json'), 'utf8'));
    const parsed = UserFillsResponseSchema.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it('coerces string-encoded numeric fields to numbers', () => {
    const raw = JSON.parse(readFileSync(resolve(fixturesDir, 'user-fills.json'), 'utf8'));
    const parsed = UserFillsResponseSchema.parse(raw);
    const first = parsed[0];
    expect(first).toBeDefined();
    expect(typeof first!.px).toBe('number');
    expect(typeof first!.sz).toBe('number');
    expect(typeof first!.fee).toBe('number');
    expect(typeof first!.startPosition).toBe('number');
    expect(typeof first!.closedPnl).toBe('number');
    expect(first!.time).toBeGreaterThan(0);
  });

  it('accepts both "B" and "A" for side and rejects others', () => {
    const raw = JSON.parse(readFileSync(resolve(fixturesDir, 'user-fills.json'), 'utf8'));
    const parsed = UserFillsResponseSchema.parse(raw);
    for (const f of parsed) {
      expect(['B', 'A']).toContain(f.side);
    }
    const mangled = [{ ...raw[0], side: 'X' }];
    expect(() => UserFillsResponseSchema.parse(mangled)).toThrow();
  });

  it('accepts namespaced coin symbols (e.g. "xyz:NVDA")', () => {
    const raw = JSON.parse(readFileSync(resolve(fixturesDir, 'user-fills.json'), 'utf8'));
    const namespaced = [{ ...raw[0], coin: 'xyz:NVDA' }];
    expect(() => UserFillsResponseSchema.parse(namespaced)).not.toThrow();
  });

  it('accepts null twapId', () => {
    const raw = JSON.parse(readFileSync(resolve(fixturesDir, 'user-fills.json'), 'utf8'));
    const nullTwap = [{ ...raw[0], twapId: null }];
    expect(() => UserFillsResponseSchema.parse(nullTwap)).not.toThrow();
  });

  it('rejects a response missing required fields', () => {
    expect(() => UserFillsResponseSchema.parse([{ coin: 'BTC' }])).toThrow();
  });

  it('rejects a non-numeric-string in a numeric field', () => {
    const raw = JSON.parse(readFileSync(resolve(fixturesDir, 'user-fills.json'), 'utf8'));
    const mangled = [{ ...raw[0], px: 'not-a-number' }];
    expect(() => UserFillsResponseSchema.parse(mangled)).toThrow();
  });
});

describe('ClearinghouseStateSchema', () => {
  it('parses the committed clearinghouse-state fixture without errors', () => {
    const raw = JSON.parse(readFileSync(resolve(fixturesDir, 'clearinghouse-state.json'), 'utf8'));
    const parsed = ClearinghouseStateSchema.parse(raw);
    expect(typeof parsed.time).toBe('number');
    expect(parsed.assetPositions).toBeInstanceOf(Array);
    expect(typeof parsed.marginSummary.accountValue).toBe('number');
    expect(typeof parsed.crossMarginSummary.accountValue).toBe('number');
    expect(typeof parsed.withdrawable).toBe('number');
    expect(typeof parsed.crossMaintenanceMarginUsed).toBe('number');
  });

  it('coerces the signed-size (szi) on each asset position to a number', () => {
    const raw = JSON.parse(readFileSync(resolve(fixturesDir, 'clearinghouse-state.json'), 'utf8'));
    const parsed = ClearinghouseStateSchema.parse(raw);
    for (const ap of parsed.assetPositions) {
      expect(typeof ap.position.szi).toBe('number');
      expect(typeof ap.position.unrealizedPnl).toBe('number');
    }
  });

  it('rejects a response missing the required time field', () => {
    expect(() =>
      ClearinghouseStateSchema.parse({
        assetPositions: [],
        marginSummary: { accountValue: '0', totalMarginUsed: '0', totalNtlPos: '0', totalRawUsd: '0' },
        crossMarginSummary: { accountValue: '0', totalMarginUsed: '0', totalNtlPos: '0', totalRawUsd: '0' },
        crossMaintenanceMarginUsed: '0',
        withdrawable: '0',
      }),
    ).toThrow();
  });

  it('accepts isolated-leverage positions', () => {
    const raw = JSON.parse(readFileSync(resolve(fixturesDir, 'clearinghouse-state.json'), 'utf8'));
    if (raw.assetPositions.length === 0) {
      return; // no positions to mutate; test is a no-op for this fixture
    }
    const mutated = {
      ...raw,
      assetPositions: [
        {
          ...raw.assetPositions[0],
          position: {
            ...raw.assetPositions[0].position,
            leverage: { type: 'isolated', value: 10 },
          },
        },
      ],
    };
    expect(() => ClearinghouseStateSchema.parse(mutated)).not.toThrow();
  });
});
