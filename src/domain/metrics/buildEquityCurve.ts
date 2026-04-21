import type { ReconstructedTrade } from '@entities/trade';

export type EquityPoint = {
  readonly time: number;
  readonly equity: number;
  readonly coin: string;
  readonly pnl: number;
};

/**
 * Cumulative realized-PnL curve. One point per closed trade, sorted by
 * closedAt ascending (stable sort preserves input order on ties).
 * `equity` is the running sum; `coin` and `pnl` let tooltips show which
 * trade caused each step.
 */
export function buildEquityCurve(
  trades: ReadonlyArray<ReconstructedTrade>,
): ReadonlyArray<EquityPoint> {
  const closed = trades
    .filter((t) => t.status === 'closed')
    .slice()
    .sort((a, b) => a.closedAt - b.closedAt);
  let running = 0;
  return closed.map((t) => {
    running += t.realizedPnl;
    return { time: t.closedAt, equity: running, coin: t.coin, pnl: t.realizedPnl };
  });
}
