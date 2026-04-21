import type { RawFill } from '@entities/fill';
import type { ReconstructedTrade } from '@entities/trade';
import { groupFillsByCoin } from './groupFillsByCoin';
import { isPerpFill } from './isPerpFill';
import { reconstructCoinTrades } from './reconstructCoinTrades';

/**
 * Top-level reconstruction: filter to perp fills, group by coin, then
 * run the per-coin reconstructor. Output is flat (not grouped by coin)
 * — ordered by coin iteration order (first-seen) with per-coin trades
 * in chronological order.
 *
 * Spot fills (HL's `@N` markets, `Buy`/`Sell` dirs) are dropped up front
 * — HyperJournal v1 is perps-only per CLAUDE.md §1.
 */
export function reconstructTrades(
  fills: ReadonlyArray<RawFill>,
): ReadonlyArray<ReconstructedTrade> {
  const perps = fills.filter(isPerpFill);
  const grouped = groupFillsByCoin(perps);
  const out: ReconstructedTrade[] = [];
  for (const [coin, coinFills] of grouped) {
    out.push(...reconstructCoinTrades(coin, coinFills));
  }
  return out;
}
