import { describe, it, expect } from 'vitest';
import {
  parseFilterStateFromSearchParams,
  serializeFilterStateToSearchParams,
} from './filterState';
import {
  DEFAULT_FILTER_STATE,
  setCoin,
  setSide,
  setStatus,
  setOutcome,
  setDateRangePreset,
  setCustomDateRange,
  type FilterState,
} from '@domain/filters/filterState';
import type { YYYYMMDD } from '@domain/dates/isValidDateString';

const asDate = (s: string) => s as YYYYMMDD;
const sp = (init: string) => new URLSearchParams(init);

describe('parseFilterStateFromSearchParams', () => {
  it('returns DEFAULT_FILTER_STATE for empty params', () => {
    expect(parseFilterStateFromSearchParams(sp(''))).toEqual(DEFAULT_FILTER_STATE);
  });

  it('parses coin', () => {
    expect(parseFilterStateFromSearchParams(sp('coin=BTC'))).toEqual(
      setCoin(DEFAULT_FILTER_STATE, 'BTC'),
    );
  });

  it('parses side', () => {
    expect(parseFilterStateFromSearchParams(sp('side=long'))).toEqual(
      setSide(DEFAULT_FILTER_STATE, 'long'),
    );
  });

  it('parses status', () => {
    expect(parseFilterStateFromSearchParams(sp('status=closed'))).toEqual(
      setStatus(DEFAULT_FILTER_STATE, 'closed'),
    );
  });

  it('parses outcome', () => {
    expect(parseFilterStateFromSearchParams(sp('outcome=winner'))).toEqual(
      setOutcome(DEFAULT_FILTER_STATE, 'winner'),
    );
  });

  it('parses preset', () => {
    expect(parseFilterStateFromSearchParams(sp('range=30d'))).toEqual(
      setDateRangePreset(DEFAULT_FILTER_STATE, '30d'),
    );
  });

  it('parses custom range', () => {
    expect(
      parseFilterStateFromSearchParams(sp('from=2026-01-01&to=2026-04-28')),
    ).toEqual(
      setCustomDateRange(DEFAULT_FILTER_STATE, asDate('2026-01-01'), asDate('2026-04-28')),
    );
  });

  it('custom wins over preset when both present', () => {
    const result = parseFilterStateFromSearchParams(
      sp('range=30d&from=2026-01-01&to=2026-04-28'),
    );
    expect(result.dateRange).toEqual({
      kind: 'custom',
      from: '2026-01-01',
      to: '2026-04-28',
    });
  });

  it('falls back to preset when custom is incomplete', () => {
    const result = parseFilterStateFromSearchParams(sp('range=30d&from=2026-01-01'));
    expect(result.dateRange).toEqual({ kind: 'preset', preset: '30d' });
  });

  it('garbage params silently default per-dimension', () => {
    const result = parseFilterStateFromSearchParams(
      sp('coin=&side=garbage&status=closed&outcome=&range=zzz'),
    );
    expect(result.coin).toBeNull();
    expect(result.side).toBe('all');
    expect(result.status).toBe('closed');
    expect(result.outcome).toBe('all');
    expect(result.dateRange).toEqual({ kind: 'preset', preset: 'all' });
  });

  it('combines multiple valid params', () => {
    const result = parseFilterStateFromSearchParams(
      sp('coin=BTC&side=long&status=closed'),
    );
    expect(result.coin).toBe('BTC');
    expect(result.side).toBe('long');
    expect(result.status).toBe('closed');
  });
});

describe('serializeFilterStateToSearchParams', () => {
  it('default state produces empty params', () => {
    const params = serializeFilterStateToSearchParams(DEFAULT_FILTER_STATE);
    expect(params.toString()).toBe('');
  });

  it('non-default values appear', () => {
    let s: FilterState = setCoin(DEFAULT_FILTER_STATE, 'BTC');
    s = setSide(s, 'long');
    const params = serializeFilterStateToSearchParams(s);
    expect(params.get('coin')).toBe('BTC');
    expect(params.get('side')).toBe('long');
    expect(params.get('status')).toBeNull();
    expect(params.get('outcome')).toBeNull();
    expect(params.get('range')).toBeNull();
  });

  it('preset "all" is omitted', () => {
    const params = serializeFilterStateToSearchParams(
      setDateRangePreset(DEFAULT_FILTER_STATE, 'all'),
    );
    expect(params.get('range')).toBeNull();
  });

  it('custom range emits from + to (no range)', () => {
    const s = setCustomDateRange(
      DEFAULT_FILTER_STATE,
      asDate('2026-01-01'),
      asDate('2026-04-28'),
    );
    const params = serializeFilterStateToSearchParams(s);
    expect(params.get('from')).toBe('2026-01-01');
    expect(params.get('to')).toBe('2026-04-28');
    expect(params.get('range')).toBeNull();
  });
});

describe('round-trip identity', () => {
  it.each<FilterState>([
    DEFAULT_FILTER_STATE,
    setCoin(DEFAULT_FILTER_STATE, 'BTC'),
    setSide(DEFAULT_FILTER_STATE, 'long'),
    setStatus(DEFAULT_FILTER_STATE, 'closed'),
    setOutcome(DEFAULT_FILTER_STATE, 'winner'),
    setDateRangePreset(DEFAULT_FILTER_STATE, '30d'),
    setCustomDateRange(
      DEFAULT_FILTER_STATE,
      asDate('2026-01-01'),
      asDate('2026-04-28'),
    ),
  ])('parse(serialize(state)) === state', (state) => {
    const params = serializeFilterStateToSearchParams(state);
    const round = parseFilterStateFromSearchParams(params);
    expect(round).toEqual(state);
  });
});

import {
  toggleHoldDuration,
  toggleTimeOfDay,
  toggleDayOfWeek,
  toggleTradeSize,
} from '@domain/filters/filterState';

describe('parseFilterStateFromSearchParams — 8b array fields', () => {
  it('parses hold-duration list', () => {
    const result = parseFilterStateFromSearchParams(sp('hold=scalp,intraday'));
    expect(result.holdDuration).toEqual(['scalp', 'intraday']);
  });

  it('parses tod (time-of-day) list', () => {
    const result = parseFilterStateFromSearchParams(sp('tod=morning,evening'));
    expect(result.timeOfDay).toEqual(['morning', 'evening']);
  });

  it('parses dow (day-of-week) list', () => {
    const result = parseFilterStateFromSearchParams(sp('dow=mon,tue,wed'));
    expect(result.dayOfWeek).toEqual(['mon', 'tue', 'wed']);
  });

  it('parses size (trade-size) list', () => {
    const result = parseFilterStateFromSearchParams(sp('size=large,whale'));
    expect(result.tradeSize).toEqual(['large', 'whale']);
  });

  it('drops unknown tokens silently', () => {
    expect(
      parseFilterStateFromSearchParams(sp('hold=scalp,bogus,intraday'))
        .holdDuration,
    ).toEqual(['scalp', 'intraday']);
  });

  it('dedups within a list', () => {
    expect(
      parseFilterStateFromSearchParams(sp('hold=scalp,scalp,scalp'))
        .holdDuration,
    ).toEqual(['scalp']);
  });

  it('treats empty value as default empty array', () => {
    expect(parseFilterStateFromSearchParams(sp('hold=')).holdDuration).toEqual(
      [],
    );
  });

  it('parses 8a-only URL with default 8b fields', () => {
    const result = parseFilterStateFromSearchParams(
      sp('coin=BTC&status=closed'),
    );
    expect(result.holdDuration).toEqual([]);
    expect(result.timeOfDay).toEqual([]);
    expect(result.dayOfWeek).toEqual([]);
    expect(result.tradeSize).toEqual([]);
    expect(result.coin).toBe('BTC');
    expect(result.status).toBe('closed');
  });
});

describe('serializeFilterStateToSearchParams — 8b array fields', () => {
  it('omits keys when arrays are empty', () => {
    const params = serializeFilterStateToSearchParams(DEFAULT_FILTER_STATE);
    expect(params.has('hold')).toBe(false);
    expect(params.has('tod')).toBe(false);
    expect(params.has('dow')).toBe(false);
    expect(params.has('size')).toBe(false);
  });

  it('writes hold list comma-joined in canonical order', () => {
    const state = toggleHoldDuration(
      toggleHoldDuration(DEFAULT_FILTER_STATE, 'position'),
      'scalp',
    );
    const params = serializeFilterStateToSearchParams(state);
    expect(params.get('hold')).toBe('scalp,position');
  });

  it('canonicalizes regardless of selection order', () => {
    const a = toggleHoldDuration(
      toggleHoldDuration(DEFAULT_FILTER_STATE, 'scalp'),
      'intraday',
    );
    const b = toggleHoldDuration(
      toggleHoldDuration(DEFAULT_FILTER_STATE, 'intraday'),
      'scalp',
    );
    expect(serializeFilterStateToSearchParams(a).get('hold')).toBe(
      serializeFilterStateToSearchParams(b).get('hold'),
    );
  });

  it('writes dow in Mon→Sun order', () => {
    let s = DEFAULT_FILTER_STATE;
    s = toggleDayOfWeek(s, 'fri');
    s = toggleDayOfWeek(s, 'mon');
    s = toggleDayOfWeek(s, 'wed');
    expect(serializeFilterStateToSearchParams(s).get('dow')).toBe('mon,wed,fri');
  });
});

describe('round-trip identity — 8b states', () => {
  const cases: Array<[string, FilterState]> = [
    [
      'hold + size',
      (() => {
        let s = DEFAULT_FILTER_STATE;
        s = toggleHoldDuration(s, 'scalp');
        s = toggleHoldDuration(s, 'intraday');
        s = toggleTradeSize(s, 'large');
        return s;
      })(),
    ],
    [
      'tod + dow',
      (() => {
        let s = DEFAULT_FILTER_STATE;
        s = toggleTimeOfDay(s, 'morning');
        s = toggleTimeOfDay(s, 'evening');
        s = toggleDayOfWeek(s, 'mon');
        s = toggleDayOfWeek(s, 'fri');
        return s;
      })(),
    ],
    [
      '8a + 8b combined',
      (() => {
        let s = setCoin(DEFAULT_FILTER_STATE, 'BTC');
        s = setSide(s, 'long');
        s = toggleHoldDuration(s, 'intraday');
        s = toggleTimeOfDay(s, 'morning');
        return s;
      })(),
    ],
  ];

  it.each(cases)('%s round-trips', (_label, state) => {
    const params = serializeFilterStateToSearchParams(state);
    const parsed = parseFilterStateFromSearchParams(params);
    expect(serializeFilterStateToSearchParams(parsed).toString()).toBe(
      params.toString(),
    );
  });
});
