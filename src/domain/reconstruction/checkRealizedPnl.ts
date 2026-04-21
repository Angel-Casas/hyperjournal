import type { RawFill } from '@entities/fill';
import type { ReconstructedTrade } from '@entities/trade';

/**
 * Tolerance ($USDC) for per-coin PnL matching. Floating-point summation of
 * many coerced numeric strings drifts by at most a few cents for a 2000-
 * fill account; 0.01 is generous and catches real algorithmic bugs.
 */
const PNL_MATCH_TOLERANCE = 0.01;

export type PnlComparison = {
  readonly coin: string;
  readonly hlSum: number;
  readonly reconstructedSum: number;
  readonly delta: number;
};

export type PnlCheckResult = {
  readonly matched: boolean;
  readonly perCoin: ReadonlyMap<string, PnlComparison>;
};

/**
 * Oracle that validates reconstructTrades against Hyperliquid's own
 * accounting. For each coin:
 *   hlSum       = Σ closedPnl across close-role fills THAT ARE LEGS of a
 *                 reconstructed trade
 *   reconstructedSum = Σ realizedPnl across trades
 *
 * The filter to "fills that became legs" makes the comparison self-
 * consistent under truncation: if the algorithm dropped a leading-
 * truncation fill, both sides exclude it. Without the filter, dropped
 * fills would inflate hlSum and produce a spurious mismatch.
 *
 * matched iff every coin's |delta| is within PNL_MATCH_TOLERANCE.
 */
export function checkRealizedPnl(
  fills: ReadonlyArray<RawFill>,
  trades: ReadonlyArray<ReconstructedTrade>,
): PnlCheckResult {
  // Collect the tids that actually made it into a trade leg
  const includedTids = new Set<number>();
  for (const trade of trades) {
    for (const leg of trade.legs) {
      includedTids.add(leg.fill.tid);
    }
  }

  // HL sum per coin, only over fills that became legs
  const hlPerCoin = new Map<string, number>();
  for (const fill of fills) {
    if (!includedTids.has(fill.tid)) continue;
    const isClose = fill.dir === 'Close Long' || fill.dir === 'Close Short';
    if (!isClose) continue;
    hlPerCoin.set(fill.coin, (hlPerCoin.get(fill.coin) ?? 0) + fill.closedPnl);
  }

  // Reconstructed sum per coin
  const reconPerCoin = new Map<string, number>();
  for (const trade of trades) {
    reconPerCoin.set(
      trade.coin,
      (reconPerCoin.get(trade.coin) ?? 0) + trade.realizedPnl,
    );
  }

  const coins = new Set([...hlPerCoin.keys(), ...reconPerCoin.keys()]);
  const perCoin = new Map<string, PnlComparison>();
  let matched = true;
  for (const coin of coins) {
    const hlSum = hlPerCoin.get(coin) ?? 0;
    const reconstructedSum = reconPerCoin.get(coin) ?? 0;
    const delta = Math.abs(hlSum - reconstructedSum);
    if (delta > PNL_MATCH_TOLERANCE) matched = false;
    perCoin.set(coin, { coin, hlSum, reconstructedSum, delta });
  }
  return { matched, perCoin };
}
