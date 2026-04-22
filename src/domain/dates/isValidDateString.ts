/**
 * Branded YYYY-MM-DD string. Routes and repos accept this narrowed type
 * so date validation only has to happen at the boundary.
 */
export type YYYYMMDD = string & { readonly __brand: 'YYYYMMDD' };

/**
 * Validates a string is a real YYYY-MM-DD calendar date (UTC-agnostic).
 * Rejects impossible dates like 2025-02-30. Narrows the input to the
 * branded YYYYMMDD type for downstream consumers.
 */
export function isValidDateString(s: string): s is YYYYMMDD {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  // Construct a UTC date and compare — JS Date rolls 2025-02-30 to 2025-03-02,
  // so a round-trip mismatch indicates the original wasn't a real calendar day.
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return (
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() === m - 1 &&
    parsed.getUTCDate() === d
  );
}
