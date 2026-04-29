import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FILTER_STATE,
  isDefault,
  countActive,
  setCoin,
  setSide,
  setStatus,
  setOutcome,
  setDateRangePreset,
  setCustomDateRange,
  type FilterState,
} from './filterState';
import type { YYYYMMDD } from '@domain/dates/isValidDateString';

const asDate = (s: string) => s as YYYYMMDD;

describe('isDefault', () => {
  it('returns true for DEFAULT_FILTER_STATE', () => {
    expect(isDefault(DEFAULT_FILTER_STATE)).toBe(true);
  });

  it('returns false when any dimension differs', () => {
    expect(isDefault(setCoin(DEFAULT_FILTER_STATE, 'BTC'))).toBe(false);
    expect(isDefault(setSide(DEFAULT_FILTER_STATE, 'long'))).toBe(false);
    expect(isDefault(setStatus(DEFAULT_FILTER_STATE, 'closed'))).toBe(false);
    expect(isDefault(setOutcome(DEFAULT_FILTER_STATE, 'winner'))).toBe(false);
    expect(isDefault(setDateRangePreset(DEFAULT_FILTER_STATE, '30d'))).toBe(false);
  });
});

describe('countActive', () => {
  it('returns 0 for default', () => {
    expect(countActive(DEFAULT_FILTER_STATE)).toBe(0);
  });

  it('counts each non-default dimension', () => {
    let s = setCoin(DEFAULT_FILTER_STATE, 'BTC');
    expect(countActive(s)).toBe(1);
    s = setSide(s, 'long');
    expect(countActive(s)).toBe(2);
    s = setDateRangePreset(s, '30d');
    expect(countActive(s)).toBe(3);
    s = setStatus(s, 'closed');
    s = setOutcome(s, 'winner');
    expect(countActive(s)).toBe(5);
  });
});

describe('setters are immutable', () => {
  it('setCoin returns a new object and only changes coin', () => {
    const next = setCoin(DEFAULT_FILTER_STATE, 'BTC');
    expect(next).not.toBe(DEFAULT_FILTER_STATE);
    expect(next.coin).toBe('BTC');
    expect(next.side).toBe(DEFAULT_FILTER_STATE.side);
  });

  it('setCustomDateRange switches kind to custom', () => {
    const next = setCustomDateRange(
      DEFAULT_FILTER_STATE,
      asDate('2026-01-01'),
      asDate('2026-04-28'),
    );
    expect(next.dateRange).toEqual({
      kind: 'custom',
      from: '2026-01-01',
      to: '2026-04-28',
    });
  });

  it('setDateRangePreset switches kind to preset', () => {
    const custom = setCustomDateRange(
      DEFAULT_FILTER_STATE,
      asDate('2026-01-01'),
      asDate('2026-04-28'),
    );
    const preset = setDateRangePreset(custom, '30d');
    expect(preset.dateRange).toEqual({ kind: 'preset', preset: '30d' });
  });
});

describe('FilterState type narrowing', () => {
  it('discriminates dateRange.kind', () => {
    const s: FilterState = setCustomDateRange(
      DEFAULT_FILTER_STATE,
      asDate('2026-01-01'),
      asDate('2026-04-28'),
    );
    if (s.dateRange.kind === 'custom') {
      expect(s.dateRange.from).toBe('2026-01-01');
      expect(s.dateRange.to).toBe('2026-04-28');
    }
  });
});
