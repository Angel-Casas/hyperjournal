/**
 * Returns 0..23, the hour-of-day in the given IANA timezone.
 * Pure: takes an absolute timestamp and a tz string, returns a number.
 *
 * Implementation uses Intl.DateTimeFormat with hourCycle: 'h23' to
 * normalize "24" (which some locales emit for midnight) to "00".
 */
export function hourInTimeZone(timestampMs: number, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(timestampMs);
  const hourPart = parts.find((p) => p.type === 'hour');
  if (!hourPart) return 0;
  const hour = Number.parseInt(hourPart.value, 10);
  return Number.isFinite(hour) ? hour % 24 : 0;
}

/**
 * Returns 0..6 — Mon=0, Tue=1, ..., Sun=6 — matching DAY_OF_WEEK_ORDER
 * in entities/filter-state.ts. Pure.
 */
export function weekdayIndexInTimeZone(
  timestampMs: number,
  timeZone: string,
): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(timestampMs);
  const weekdayPart = parts.find((p) => p.type === 'weekday');
  const code = weekdayPart?.value ?? 'Mon';
  // en-US 'short' emits 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  return map[code] ?? 0;
}
