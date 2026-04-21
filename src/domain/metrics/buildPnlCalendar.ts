import type { ReconstructedTrade } from '@entities/trade';

export type PnlCalendarDay = {
  readonly date: string; // YYYY-MM-DD (UTC)
  readonly pnl: number;
  readonly tradeCount: number;
};

/**
 * Bucket closed trades by their `closedAt` UTC date. Returns a Map keyed
 * by `YYYY-MM-DD` (UTC) with the day's total realized PnL and trade
 * count. UTC chosen so the same wallet shows the same buckets across
 * every viewer's timezone — local-time mode is a BACKLOG item.
 */
export function buildPnlCalendar(
  trades: ReadonlyArray<ReconstructedTrade>,
): ReadonlyMap<string, PnlCalendarDay> {
  const out = new Map<string, { date: string; pnl: number; tradeCount: number }>();
  for (const t of trades) {
    if (t.status !== 'closed') continue;
    const d = new Date(t.closedAt);
    const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const existing = out.get(date);
    if (existing) {
      existing.pnl += t.realizedPnl;
      existing.tradeCount += 1;
    } else {
      out.set(date, { date, pnl: t.realizedPnl, tradeCount: 1 });
    }
  }
  return out;
}
