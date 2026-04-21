import type { WalletAddress } from './wallet';
import type { Provenance } from './provenance';
import type { RawFill } from './fill';

/**
 * A TradeLeg wraps a single fill that contributed to a reconstructed trade,
 * with its role in the trade's lifecycle. Every RawFill in a trade becomes
 * exactly one TradeLeg; no aggregation at this level.
 */
export type TradeLeg = {
  readonly fill: RawFill;
  /**
   * 'open' fills start or extend the position; 'close' fills reduce or
   * terminate it. Derived directly from the fill's `dir` field (Open * →
   * 'open', Close * → 'close').
   */
  readonly role: 'open' | 'close';
};

/**
 * Classification of a trade's current state.
 * - 'closed': position returned to zero at the last close leg; realizedPnl
 *   is final.
 * - 'open': trade is still running; no realized PnL yet (unrealizedPnl
 *   lives in clearinghouseState, not here).
 */
export type TradeStatus = 'closed' | 'open';

/**
 * Side of the overall trade. A trade that opens long and closes back to zero
 * is 'long'; an opens-short-closes-back trade is 'short'. Flips are emitted
 * as two separate trades, one per direction.
 */
export type TradeSide = 'long' | 'short';

/**
 * A reconstructed trade: a logical unit spanning one or more fills on the
 * same coin that together represent opening, possibly scaling, and closing
 * a position. The product's primary analytical unit.
 *
 * Provenance: observed fields flow from the underlying fills; derived fields
 * (avgEntryPx, avgExitPx, realizedPnl, holdTimeMs, openedAt, closedAt) are
 * deterministic functions of those. No inferred fields at this layer — any
 * inference (e.g., "was there a stop loss?") lives in Session 4+ pattern
 * detection, not here.
 */
export type ReconstructedTrade = {
  readonly id: string;
  readonly wallet: WalletAddress | null;
  readonly coin: string;
  readonly side: TradeSide;
  readonly status: TradeStatus;
  readonly legs: ReadonlyArray<TradeLeg>;

  /** Unix ms of the first fill. */
  readonly openedAt: number;
  /** Unix ms of the last fill; equals openedAt for single-fill trades. */
  readonly closedAt: number;
  /** closedAt - openedAt. Zero for single-fill trades. */
  readonly holdTimeMs: number;

  /** Total size opened, summed across all 'open' legs (always positive). */
  readonly openedSize: number;
  /** Total size closed, summed across all 'close' legs (always positive). */
  readonly closedSize: number;

  /**
   * Size-weighted average entry price across all 'open' legs, or null when
   * the trade has no opens in our fill window (truncated history: the user
   * entered the position before the earliest fill we can see, so we observe
   * only the close side). openedSize will be 0 in that case.
   */
  readonly avgEntryPx: number | null;
  /**
   * Size-weighted average exit price across all 'close' legs, or null if
   * the trade is still open.
   */
  readonly avgExitPx: number | null;

  /**
   * Sum of closedPnl from every 'close' leg — matches Hyperliquid's own
   * realized PnL accounting. Zero for open trades.
   */
  readonly realizedPnl: number;
  /** Sum of `fee` across every leg (always non-negative). */
  readonly totalFees: number;

  readonly provenance: Provenance;
};
