import type { RawFill } from '@entities/fill';

const ZERO_TOLERANCE = 1e-9;

/**
 * Signed size-change produced by a fill on the coin's running position.
 * Mirrors Hyperliquid's own accounting:
 *   Open Long, Close Short  →  +sz (position moves upward)
 *   Open Short, Close Long  →  -sz (position moves downward)
 *   Auto-Deleveraging, Liquidation  →  reduces |position| toward 0; sign
 *     is inferred from startPosition (long → negative delta; short → positive).
 * Any other `dir` is treated as zero delta (unknown directions are caught
 * downstream by reconstructCoinTrades).
 */
function signedDelta(fill: RawFill): number {
  switch (fill.dir) {
    case 'Open Long':
    case 'Close Short':
      return fill.sz;
    case 'Open Short':
    case 'Close Long':
      return -fill.sz;
    case 'Auto-Deleveraging':
    case 'Liquidation':
      return fill.startPosition > 0 ? -fill.sz : fill.sz;
    default:
      return 0;
  }
}

/**
 * Chain same-timestamp fills into execution order by walking the
 * `startPosition` graph. For a group of fills sharing a millisecond, the
 * next fill is the one whose `startPosition` matches the current fill's
 * `startPosition + signedDelta`. The entry fill is the one whose
 * `startPosition` is NOT any other fill's positionAfter — topologically,
 * it has no predecessor in the group.
 *
 * This is more reliable than sorting by `tid`, which is unique but NOT
 * monotonic with execution order within the same millisecond — HL assigns
 * tids in an unspecified order.
 *
 * Falls back to the original group order if either step cannot resolve
 * (e.g., ambiguous chain due to non-distinct startPositions). Downstream
 * reconstructCoinTrades will still raise a useful error if the resulting
 * sequence violates an invariant.
 */
function chainSameTime(group: ReadonlyArray<RawFill>): RawFill[] {
  if (group.length <= 1) return [...group];

  const positionsAfter = group.map((f) => f.startPosition + signedDelta(f));

  // Entry = fill whose startPosition is not the positionAfter of any OTHER fill.
  const entryIdx = group.findIndex((f, i) => {
    return !positionsAfter.some(
      (p, j) => j !== i && Math.abs(p - f.startPosition) <= ZERO_TOLERANCE,
    );
  });
  if (entryIdx === -1) {
    // No clear entry — fallback to original group order.
    return [...group];
  }

  const remaining = [...group];
  const ordered: RawFill[] = [];
  let picked = remaining.splice(entryIdx, 1)[0]!;
  ordered.push(picked);
  let expected = picked.startPosition + signedDelta(picked);

  while (remaining.length > 0) {
    const idx = remaining.findIndex(
      (f) => Math.abs(f.startPosition - expected) <= ZERO_TOLERANCE,
    );
    if (idx === -1) {
      // Chain broke — append the rest in their remaining order.
      ordered.push(...remaining);
      break;
    }
    picked = remaining[idx]!;
    remaining.splice(idx, 1);
    ordered.push(picked);
    expected = picked.startPosition + signedDelta(picked);
  }
  return ordered;
}

/**
 * Partition fills into one array per coin, each in execution order.
 * Sort by `time` first; within a single millisecond, chain via
 * `startPosition` (HL's authoritative pre-position field) rather than
 * `tid`, which is unreliable as an intra-ms execution tiebreaker.
 *
 * Pure; does not mutate input. Map iteration order follows first-seen
 * insertion order for deterministic downstream ordering.
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

  const out = new Map<string, RawFill[]>();
  for (const [coin, arr] of buckets) {
    const byTime = [...arr].sort((a, b) => a.time - b.time);
    const chained: RawFill[] = [];
    let i = 0;
    while (i < byTime.length) {
      const t = byTime[i]!.time;
      let j = i;
      while (j < byTime.length && byTime[j]!.time === t) j++;
      const group = byTime.slice(i, j);
      chained.push(...chainSameTime(group));
      i = j;
    }
    out.set(coin, chained);
  }
  return out;
}
