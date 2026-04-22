import type { YYYYMMDD } from './isValidDateString';

/**
 * Returns today's date in UTC as YYYY-MM-DD. The `now` parameter is
 * injectable so tests don't depend on wall-clock time and so a calling
 * component can re-compute across midnight if desired.
 */
export function todayUtcDateString(now: number): YYYYMMDD {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}` as YYYYMMDD;
}
