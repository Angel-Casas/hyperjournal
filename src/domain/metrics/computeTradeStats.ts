import type { ReconstructedTrade } from '@entities/trade';
import type { TradeStats } from '@entities/trade-stats';

/**
 * Compute the Tier-1 analytics snapshot from a list of reconstructed trades.
 * Pure; no clocks, no random. Null-vs-zero semantics distinguish "no data"
 * (null) from "zero result" (0) — consumers decide how to render each case.
 */
export function computeTradeStats(
  trades: ReadonlyArray<ReconstructedTrade>,
): TradeStats {
  const closed = trades.filter((t) => t.status === 'closed');
  const open = trades.filter((t) => t.status === 'open');

  const totalPnl = closed.reduce((acc, t) => acc + t.realizedPnl, 0);

  const winners = closed.filter((t) => t.realizedPnl > 0);
  const losers = closed.filter((t) => t.realizedPnl < 0);
  const breakEvens = closed.filter((t) => t.realizedPnl === 0);

  const grossWins = winners.reduce((acc, t) => acc + t.realizedPnl, 0);
  const grossLosses = losers.reduce((acc, t) => acc + t.realizedPnl, 0);

  const winRate = closed.length > 0 ? winners.length / closed.length : null;
  const expectancy = closed.length > 0 ? totalPnl / closed.length : null;
  const profitFactor =
    losers.length > 0 ? grossWins / Math.abs(grossLosses) : null;
  const avgWin = winners.length > 0 ? grossWins / winners.length : null;
  const avgLoss =
    losers.length > 0 ? Math.abs(grossLosses) / losers.length : null;

  const avgHoldTimeMs =
    closed.length > 0
      ? closed.reduce((acc, t) => acc + t.holdTimeMs, 0) / closed.length
      : null;

  // Drawdown walk
  const timeSorted = [...closed].sort((a, b) => a.closedAt - b.closedAt);
  let runningEquity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let drawdownPeak = 0;
  for (const t of timeSorted) {
    runningEquity += t.realizedPnl;
    if (runningEquity > peak) peak = runningEquity;
    const dd = peak - runningEquity;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      drawdownPeak = peak;
    }
  }
  const maxDrawdownPct =
    maxDrawdown > 0 && drawdownPeak > 0 ? maxDrawdown / drawdownPeak : null;

  const longs = closed.filter((t) => t.side === 'long');
  const shorts = closed.filter((t) => t.side === 'short');
  const longWinRate =
    longs.length > 0
      ? longs.filter((t) => t.realizedPnl > 0).length / longs.length
      : null;
  const shortWinRate =
    shorts.length > 0
      ? shorts.filter((t) => t.realizedPnl > 0).length / shorts.length
      : null;

  const bestTrade =
    closed.length > 0 ? Math.max(...closed.map((t) => t.realizedPnl)) : null;
  const worstTrade =
    closed.length > 0 ? Math.min(...closed.map((t) => t.realizedPnl)) : null;

  const totalFees = trades.reduce((acc, t) => acc + t.totalFees, 0);

  return {
    totalPnl,
    closedCount: closed.length,
    openCount: open.length,
    breakEvenCount: breakEvens.length,
    winRate,
    expectancy,
    profitFactor,
    avgWin,
    avgLoss,
    maxDrawdown,
    maxDrawdownPct,
    avgHoldTimeMs,
    longCount: longs.length,
    shortCount: shorts.length,
    longWinRate,
    shortWinRate,
    bestTrade,
    worstTrade,
    totalFees,
    provenance: 'derived',
  };
}
