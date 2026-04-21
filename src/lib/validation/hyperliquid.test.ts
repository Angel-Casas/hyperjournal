import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { UserFillsResponseSchema } from './hyperliquid';

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
