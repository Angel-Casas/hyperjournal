import type { Provenance } from './provenance';

/**
 * Aggregate analytics snapshot for a collection of reconstructed trades.
 * Every field is either a number, a null (when the metric is undefined
 * for the input — e.g., winRate on zero closed trades), or a count.
 *
 * `null` is used deliberately over `0` to distinguish "no data" from
 * "zero result" — a winRate of 0 means the trader lost every closed
 * trade; a winRate of null means no trades are closed yet.
 *
 * All PnL values are USDC (the product currently only supports that
 * quote asset). Hold times are in milliseconds.
 *
 * Provenance is 'derived' because every field is a deterministic
 * aggregation of observed / derived trade data.
 */
export type TradeStats = {
  readonly totalPnl: number;
  readonly closedCount: number;
  readonly openCount: number;
  readonly breakEvenCount: number;

  readonly winRate: number | null;
  readonly expectancy: number | null;
  readonly profitFactor: number | null;

  readonly avgWin: number | null;
  readonly avgLoss: number | null;

  readonly maxDrawdown: number;
  readonly maxDrawdownPct: number | null;

  readonly avgHoldTimeMs: number | null;

  readonly longCount: number;
  readonly shortCount: number;
  readonly longWinRate: number | null;
  readonly shortWinRate: number | null;

  readonly bestTrade: number | null;
  readonly worstTrade: number | null;
  readonly totalFees: number;

  readonly provenance: Provenance;
};
