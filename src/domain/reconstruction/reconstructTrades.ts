import type { RawFill } from '@entities/fill';
import type { ReconstructedTrade } from '@entities/trade';
import { groupFillsByCoin } from './groupFillsByCoin';
import { reconstructCoinTrades } from './reconstructCoinTrades';

/**
 * Top-level reconstruction: group fills by coin, sort per coin, then run
 * the per-coin reconstructor. Output is flat (not grouped by coin) —
 * ordered by coin iteration order (first-seen) with per-coin trades in
 * chronological order.
 */
export function reconstructTrades(
  fills: ReadonlyArray<RawFill>,
): ReadonlyArray<ReconstructedTrade> {
  const grouped = groupFillsByCoin(fills);
  const out: ReconstructedTrade[] = [];
  for (const [coin, coinFills] of grouped) {
    out.push(...reconstructCoinTrades(coin, coinFills));
  }
  return out;
}
