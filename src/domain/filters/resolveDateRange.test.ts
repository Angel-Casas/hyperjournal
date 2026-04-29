import { describe, it, expect } from 'vitest';
import { resolveDateRange } from './resolveDateRange';
import type { YYYYMMDD } from '@domain/dates/isValidDateString';

const asDate = (s: string) => s as YYYYMMDD;
const NOW = Date.UTC(2026, 3, 28, 12, 0, 0); // 2026-04-28T12:00:00Z
const DAY_MS = 24 * 60 * 60 * 1000;

describe('resolveDateRange', () => {
  it('resolves preset "all" to (-Infinity, +Infinity)', () => {
    const r = resolveDateRange({ kind: 'preset', preset: 'all' }, NOW);
    expect(r.fromMs).toBe(-Infinity);
    expect(r.toMs).toBe(Infinity);
  });

  it('resolves preset "7d" to (now - 7 days, now)', () => {
    const r = resolveDateRange({ kind: 'preset', preset: '7d' }, NOW);
    expect(r.fromMs).toBe(NOW - 7 * DAY_MS);
    expect(r.toMs).toBe(NOW);
  });

  it('resolves preset "30d" to (now - 30 days, now)', () => {
    const r = resolveDateRange({ kind: 'preset', preset: '30d' }, NOW);
    expect(r.fromMs).toBe(NOW - 30 * DAY_MS);
    expect(r.toMs).toBe(NOW);
  });

  it('resolves preset "90d" to (now - 90 days, now)', () => {
    const r = resolveDateRange({ kind: 'preset', preset: '90d' }, NOW);
    expect(r.fromMs).toBe(NOW - 90 * DAY_MS);
    expect(r.toMs).toBe(NOW);
  });

  it('resolves preset "1y" to (now - 365 days, now)', () => {
    const r = resolveDateRange({ kind: 'preset', preset: '1y' }, NOW);
    expect(r.fromMs).toBe(NOW - 365 * DAY_MS);
    expect(r.toMs).toBe(NOW);
  });

  it('resolves custom range to UTC midnight from / end-of-day-exclusive to', () => {
    const r = resolveDateRange(
      { kind: 'custom', from: asDate('2026-01-01'), to: asDate('2026-04-28') },
      NOW,
    );
    expect(r.fromMs).toBe(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
    // to is exclusive end-of-day → next day's midnight
    expect(r.toMs).toBe(Date.UTC(2026, 3, 29, 0, 0, 0, 0));
  });

  it('handles same-day custom range (one full UTC day)', () => {
    const r = resolveDateRange(
      { kind: 'custom', from: asDate('2026-04-28'), to: asDate('2026-04-28') },
      NOW,
    );
    expect(r.toMs - r.fromMs).toBe(DAY_MS);
  });
});
