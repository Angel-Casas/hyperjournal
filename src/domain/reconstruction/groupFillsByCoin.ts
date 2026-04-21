import type { RawFill } from '@entities/fill';

/**
 * Partition fills into one array per coin, each sorted by `time` ascending
 * with `tid` as a stable tiebreaker. Pure; does not mutate input.
 *
 * Map iteration order follows first-seen insertion order for deterministic
 * downstream ordering.
 */
export function groupFillsByCoin(
  fills: ReadonlyArray<RawFill>,
): ReadonlyMap<string, ReadonlyArray<RawFill>> {
  const buckets = new Map<string, RawFill[]>();
  for (const fill of fills) {
    const existing = buckets.get(fill.coin);
    if (existing) {
      existing.push(fill);
    } else {
      buckets.set(fill.coin, [fill]);
    }
  }
  for (const [, arr] of buckets) {
    arr.sort((a, b) => a.time - b.time || a.tid - b.tid);
  }
  return buckets;
}
