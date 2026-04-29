import { describe, it, expect } from 'vitest';
import { applyFilters } from './applyFilters';
import {
  DEFAULT_FILTER_STATE,
  setCoin,
  setSide,
  setStatus,
  setOutcome,
  setDateRangePreset,
  setCustomDateRange,
} from './filterState';
import type { ReconstructedTrade } from '@entities/trade';
import type { YYYYMMDD } from '@domain/dates/isValidDateString';

const asDate = (s: string) => s as YYYYMMDD;
const NOW = Date.UTC(2026, 3, 28, 12, 0, 0); // 2026-04-28T12:00:00Z
const DAY_MS = 24 * 60 * 60 * 1000;

function mkTrade(overrides: Partial<ReconstructedTrade> = {}): ReconstructedTrade {
  const base: ReconstructedTrade = {
    id: 'trade-1',
    wallet: null,
    coin: 'BTC',
    side: 'long',
    status: 'closed',
    legs: [],
    openedAt: NOW - 5 * DAY_MS,
    closedAt: NOW - 5 * DAY_MS,
    holdTimeMs: 0,
    openedSize: 1,
    closedSize: 1,
    avgEntryPx: 100,
    avgExitPx: 110,
    realizedPnl: 10,
    totalFees: 0,
    provenance: 'observed',
  };
  return { ...base, ...overrides };
}

describe('applyFilters short-circuit', () => {
  it('returns the original array when state is default', () => {
    const trades = [mkTrade(), mkTrade({ id: 'trade-2' })];
    const result = applyFilters(trades, DEFAULT_FILTER_STATE);
    expect(result).toBe(trades); // identity equality
  });
});

describe('coin filter', () => {
  it('keeps trades matching the selected coin', () => {
    const trades = [
      mkTrade({ id: 'btc', coin: 'BTC' }),
      mkTrade({ id: 'eth', coin: 'ETH' }),
    ];
    const state = setCoin(DEFAULT_FILTER_STATE, 'BTC');
    const result = applyFilters(trades, state);
    expect(result.map((t) => t.id)).toEqual(['btc']);
  });
});

describe('side filter', () => {
  it('keeps only long trades when side=long', () => {
    const trades = [
      mkTrade({ id: 'l', side: 'long' }),
      mkTrade({ id: 's', side: 'short' }),
    ];
    expect(
      applyFilters(trades, setSide(DEFAULT_FILTER_STATE, 'long')).map((t) => t.id),
    ).toEqual(['l']);
    expect(
      applyFilters(trades, setSide(DEFAULT_FILTER_STATE, 'short')).map((t) => t.id),
    ).toEqual(['s']);
  });
});

describe('status filter', () => {
  it('keeps only closed/open as configured', () => {
    const trades = [
      mkTrade({ id: 'c', status: 'closed' }),
      mkTrade({ id: 'o', status: 'open', realizedPnl: 0 }),
    ];
    expect(
      applyFilters(trades, setStatus(DEFAULT_FILTER_STATE, 'closed')).map((t) => t.id),
    ).toEqual(['c']);
    expect(
      applyFilters(trades, setStatus(DEFAULT_FILTER_STATE, 'open')).map((t) => t.id),
    ).toEqual(['o']);
  });
});

describe('outcome filter', () => {
  it('winner: closed + realizedPnl > 0; loser: closed + realizedPnl < 0', () => {
    const trades = [
      mkTrade({ id: 'win', status: 'closed', realizedPnl: 50 }),
      mkTrade({ id: 'loss', status: 'closed', realizedPnl: -50 }),
      mkTrade({ id: 'be', status: 'closed', realizedPnl: 0 }),
      mkTrade({ id: 'open', status: 'open', realizedPnl: 0 }),
    ];
    expect(
      applyFilters(trades, setOutcome(DEFAULT_FILTER_STATE, 'winner')).map((t) => t.id),
    ).toEqual(['win']);
    expect(
      applyFilters(trades, setOutcome(DEFAULT_FILTER_STATE, 'loser')).map((t) => t.id),
    ).toEqual(['loss']);
  });
});

describe('date range filter', () => {
  it('preset "7d" excludes trades older than 7 days', () => {
    const trades = [
      mkTrade({ id: 'recent', openedAt: NOW - 3 * DAY_MS }),
      mkTrade({ id: 'old', openedAt: NOW - 10 * DAY_MS }),
    ];
    const state = setDateRangePreset(DEFAULT_FILTER_STATE, '7d');
    const result = applyFilters(trades, state, { now: NOW });
    expect(result.map((t) => t.id)).toEqual(['recent']);
  });

  it('custom range is end-of-day inclusive', () => {
    const trades = [
      mkTrade({ id: 'in', openedAt: Date.UTC(2026, 3, 28, 23, 59, 0, 0) }),
      mkTrade({ id: 'out', openedAt: Date.UTC(2026, 3, 29, 0, 0, 1, 0) }),
    ];
    const state = setCustomDateRange(
      DEFAULT_FILTER_STATE,
      asDate('2026-04-28'),
      asDate('2026-04-28'),
    );
    const result = applyFilters(trades, state, { now: NOW });
    expect(result.map((t) => t.id)).toEqual(['in']);
  });
});

describe('composition (AND)', () => {
  it('combines multiple filters as logical AND', () => {
    const trades = [
      mkTrade({ id: 'btc-long-win', coin: 'BTC', side: 'long', realizedPnl: 50 }),
      mkTrade({ id: 'btc-short-win', coin: 'BTC', side: 'short', realizedPnl: 50 }),
      mkTrade({ id: 'eth-long-win', coin: 'ETH', side: 'long', realizedPnl: 50 }),
      mkTrade({ id: 'btc-long-loss', coin: 'BTC', side: 'long', realizedPnl: -50 }),
    ];
    let state = setCoin(DEFAULT_FILTER_STATE, 'BTC');
    state = setSide(state, 'long');
    state = setOutcome(state, 'winner');
    expect(applyFilters(trades, state, { now: NOW }).map((t) => t.id)).toEqual([
      'btc-long-win',
    ]);
  });
});

describe('edge cases', () => {
  it('returns empty array on empty input', () => {
    expect(applyFilters([], setCoin(DEFAULT_FILTER_STATE, 'BTC'))).toEqual([]);
  });

  it('returns empty array when no trades match', () => {
    const trades = [mkTrade({ coin: 'BTC' })];
    const state = setCoin(DEFAULT_FILTER_STATE, 'ETH');
    expect(applyFilters(trades, state)).toEqual([]);
  });
});
