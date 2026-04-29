import {
  isDefault,
  type FilterState,
  type Side,
  type Status,
  type Outcome,
} from './filterState';
import { resolveDateRange } from './resolveDateRange';
import type { ReconstructedTrade } from '@entities/trade';

type Options = { now?: number };

export function applyFilters(
  trades: ReadonlyArray<ReconstructedTrade>,
  state: FilterState,
  options: Options = {},
): ReadonlyArray<ReconstructedTrade> {
  if (isDefault(state)) return trades;
  const { fromMs, toMs } = resolveDateRange(state.dateRange, options.now ?? Date.now());
  return trades.filter(
    (t) =>
      matchesDate(t, fromMs, toMs) &&
      matchesCoin(t, state.coin) &&
      matchesSide(t, state.side) &&
      matchesStatus(t, state.status) &&
      matchesOutcome(t, state.outcome),
  );
}

export function matchesDate(
  trade: ReconstructedTrade,
  fromMs: number,
  toMs: number,
): boolean {
  return trade.openedAt >= fromMs && trade.openedAt < toMs;
}

export function matchesCoin(
  trade: ReconstructedTrade,
  coin: string | null,
): boolean {
  return coin === null || trade.coin === coin;
}

export function matchesSide(trade: ReconstructedTrade, side: Side): boolean {
  return side === 'all' || trade.side === side;
}

export function matchesStatus(
  trade: ReconstructedTrade,
  status: Status,
): boolean {
  return status === 'all' || trade.status === status;
}

export function matchesOutcome(
  trade: ReconstructedTrade,
  outcome: Outcome,
): boolean {
  if (outcome === 'all') return true;
  if (trade.status !== 'closed') return false;
  if (outcome === 'winner') return trade.realizedPnl > 0;
  return trade.realizedPnl < 0;
}
