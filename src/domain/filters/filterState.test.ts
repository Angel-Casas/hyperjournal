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

import {
  toggleHoldDuration,
  toggleTimeOfDay,
  toggleDayOfWeek,
  toggleTradeSize,
  clearHoldDuration,
  clearTimeOfDay,
  clearDayOfWeek,
  clearTradeSize,
} from './filterState';

describe('toggle setters (multi-select)', () => {
  it('toggleHoldDuration adds when absent', () => {
    const next = toggleHoldDuration(DEFAULT_FILTER_STATE, 'scalp');
    expect(next.holdDuration).toEqual(['scalp']);
  });

  it('toggleHoldDuration removes when present', () => {
    const after1 = toggleHoldDuration(DEFAULT_FILTER_STATE, 'scalp');
    const after2 = toggleHoldDuration(after1, 'scalp');
    expect(after2.holdDuration).toEqual([]);
  });

  it('toggleHoldDuration preserves other dimensions', () => {
    const seeded = setCoin(DEFAULT_FILTER_STATE, 'BTC');
    const next = toggleHoldDuration(seeded, 'intraday');
    expect(next.coin).toBe('BTC');
    expect(next.holdDuration).toEqual(['intraday']);
  });

  it('toggleDayOfWeek can hold multiple days', () => {
    let s: FilterState = DEFAULT_FILTER_STATE;
    s = toggleDayOfWeek(s, 'mon');
    s = toggleDayOfWeek(s, 'wed');
    s = toggleDayOfWeek(s, 'fri');
    expect(new Set(s.dayOfWeek)).toEqual(new Set(['mon', 'wed', 'fri']));
  });

  it('toggleTimeOfDay returns a new object (immutability)', () => {
    const next = toggleTimeOfDay(DEFAULT_FILTER_STATE, 'morning');
    expect(next).not.toBe(DEFAULT_FILTER_STATE);
  });

  it('toggleTradeSize matches the same shape', () => {
    const next = toggleTradeSize(DEFAULT_FILTER_STATE, 'large');
    expect(next.tradeSize).toEqual(['large']);
  });
});

describe('clear setters', () => {
  it('clearHoldDuration empties only that dimension', () => {
    const seeded = toggleHoldDuration(
      toggleHoldDuration(setCoin(DEFAULT_FILTER_STATE, 'BTC'), 'scalp'),
      'intraday',
    );
    const cleared = clearHoldDuration(seeded);
    expect(cleared.holdDuration).toEqual([]);
    expect(cleared.coin).toBe('BTC');
  });

  it('clearTimeOfDay / clearDayOfWeek / clearTradeSize empty their own dimensions', () => {
    let s: FilterState = DEFAULT_FILTER_STATE;
    s = toggleTimeOfDay(s, 'morning');
    s = toggleDayOfWeek(s, 'mon');
    s = toggleTradeSize(s, 'large');
    expect(clearTimeOfDay(s).timeOfDay).toEqual([]);
    expect(clearDayOfWeek(s).dayOfWeek).toEqual([]);
    expect(clearTradeSize(s).tradeSize).toEqual([]);
  });
});

describe('isDefault with 8b fields', () => {
  it('returns false when holdDuration is non-empty', () => {
    expect(isDefault(toggleHoldDuration(DEFAULT_FILTER_STATE, 'scalp'))).toBe(
      false,
    );
  });

  it('returns false when timeOfDay is non-empty', () => {
    expect(isDefault(toggleTimeOfDay(DEFAULT_FILTER_STATE, 'morning'))).toBe(
      false,
    );
  });

  it('returns false when dayOfWeek is non-empty', () => {
    expect(isDefault(toggleDayOfWeek(DEFAULT_FILTER_STATE, 'mon'))).toBe(false);
  });

  it('returns false when tradeSize is non-empty', () => {
    expect(isDefault(toggleTradeSize(DEFAULT_FILTER_STATE, 'micro'))).toBe(
      false,
    );
  });
});

describe('countActive with 8b fields', () => {
  it('counts each non-empty 8b array as 1', () => {
    let s: FilterState = DEFAULT_FILTER_STATE;
    s = toggleHoldDuration(s, 'scalp');
    s = toggleTimeOfDay(s, 'morning');
    expect(countActive(s)).toBe(2);
  });
});
