import type { DateRange } from './filterState';

const DAY_MS = 24 * 60 * 60 * 1000;

const PRESET_DAYS: Record<'7d' | '30d' | '90d' | '1y', number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
};

export function resolveDateRange(
  dateRange: DateRange,
  now: number,
): { fromMs: number; toMs: number } {
  if (dateRange.kind === 'preset') {
    if (dateRange.preset === 'all') {
      return { fromMs: -Infinity, toMs: Infinity };
    }
    const days = PRESET_DAYS[dateRange.preset];
    return { fromMs: now - days * DAY_MS, toMs: now };
  }
  // custom — parse YYYY-MM-DD as UTC midnight, end is exclusive next-day-midnight
  const fromMs = parseUtcMidnight(dateRange.from);
  const toMs = parseUtcMidnight(dateRange.to) + DAY_MS;
  return { fromMs, toMs };
}

function parseUtcMidnight(yyyymmdd: string): number {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!, 0, 0, 0, 0);
}
