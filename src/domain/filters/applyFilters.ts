import {
  isDefault,
  type FilterState,
  type Side,
  type Status,
  type Outcome,
  type HoldDurationBucket,
  type TimeOfDayBand,
  type DayOfWeek,
  type TradeSizeBucket,
} from './filterState';
import { resolveDateRange } from './resolveDateRange';
import {
  holdDurationBucketOf,
  timeOfDayBandOf,
  dayOfWeekOf,
  tradeSizeBucketOf,
} from './bucketize';
import type { ReconstructedTrade } from '@entities/trade';

type Options = { now?: number; timeZone?: string };

export function applyFilters(
  trades: ReadonlyArray<ReconstructedTrade>,
  state: FilterState,
  options: Options = {},
): ReadonlyArray<ReconstructedTrade> {
  if (isDefault(state)) return trades;
  const now = options.now ?? Date.now();
  const timeZone =
    options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { fromMs, toMs } = resolveDateRange(state.dateRange, now);
  return trades.filter(
    (t) =>
      matchesDate(t, fromMs, toMs) &&
      matchesCoin(t, state.coin) &&
      matchesSide(t, state.side) &&
      matchesStatus(t, state.status) &&
      matchesOutcome(t, state.outcome) &&
      matchesHoldDuration(t, state.holdDuration, now) &&
      matchesTimeOfDay(t, state.timeOfDay, timeZone) &&
      matchesDayOfWeek(t, state.dayOfWeek, timeZone) &&
      matchesTradeSize(t, state.tradeSize),
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

export function matchesHoldDuration(
  trade: ReconstructedTrade,
  buckets: ReadonlyArray<HoldDurationBucket>,
  now: number,
): boolean {
  if (buckets.length === 0) return true;
  const holdMs =
    trade.status === 'open'
      ? Math.max(0, now - trade.openedAt)
      : trade.holdTimeMs;
  return buckets.includes(holdDurationBucketOf(holdMs));
}

export function matchesTimeOfDay(
  trade: ReconstructedTrade,
  bands: ReadonlyArray<TimeOfDayBand>,
  timeZone: string,
): boolean {
  if (bands.length === 0) return true;
  return bands.includes(timeOfDayBandOf(trade.openedAt, timeZone));
}

export function matchesDayOfWeek(
  trade: ReconstructedTrade,
  days: ReadonlyArray<DayOfWeek>,
  timeZone: string,
): boolean {
  if (days.length === 0) return true;
  return days.includes(dayOfWeekOf(trade.openedAt, timeZone));
}

export function matchesTradeSize(
  trade: ReconstructedTrade,
  buckets: ReadonlyArray<TradeSizeBucket>,
): boolean {
  if (buckets.length === 0) return true;
  if (trade.avgEntryPx === null) return false;
  const notional = trade.openedSize * trade.avgEntryPx;
  return buckets.includes(tradeSizeBucketOf(notional));
}
