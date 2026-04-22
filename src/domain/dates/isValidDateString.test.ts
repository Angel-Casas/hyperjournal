import { describe, expect, it } from 'vitest';
import { isValidDateString } from './isValidDateString';

describe('isValidDateString', () => {
  it('accepts a valid YYYY-MM-DD', () => {
    expect(isValidDateString('2026-04-22')).toBe(true);
    expect(isValidDateString('2024-02-29')).toBe(true); // leap year
    expect(isValidDateString('1970-01-01')).toBe(true);
  });

  it('rejects malformed strings', () => {
    expect(isValidDateString('2026-4-22')).toBe(false);
    expect(isValidDateString('2026-04-22T00:00:00Z')).toBe(false);
    expect(isValidDateString('22/04/2026')).toBe(false);
    expect(isValidDateString('')).toBe(false);
    expect(isValidDateString('not-a-date')).toBe(false);
  });

  it('rejects impossible calendar dates', () => {
    expect(isValidDateString('2025-02-30')).toBe(false);
    expect(isValidDateString('2025-13-01')).toBe(false);
    expect(isValidDateString('2025-04-31')).toBe(false);
    expect(isValidDateString('2023-02-29')).toBe(false); // non-leap
  });

  it('narrows to YYYYMMDD branded type', () => {
    const s = '2026-04-22';
    if (isValidDateString(s)) {
      // This must typecheck: branded type is assignable to string.
      const _brandedNarrowsToString: string = s;
      void _brandedNarrowsToString;
    }
  });
});
