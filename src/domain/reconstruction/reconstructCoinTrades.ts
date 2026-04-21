import type { RawFill } from '@entities/fill';
import type { ReconstructedTrade, TradeLeg, TradeSide } from '@entities/trade';

const ZERO_TOLERANCE = 1e-9;

/**
 * Walk a time-sorted list of fills for a single coin and emit the logical
 * trades they represent. Pure; `coin` is a parameter (not derived from the
 * fills) so the caller can pass an empty list without ambiguity.
 *
 * Throws on unexpected input (unknown `dir`, dangling close, oversized
 * close). Loud-by-design — Session 3 does not tolerate silent data
 * corruption in the reconstruction layer.
 */
export function reconstructCoinTrades(
  coin: string,
  fills: ReadonlyArray<RawFill>,
): ReadonlyArray<ReconstructedTrade> {
  const out: ReconstructedTrade[] = [];
  let legs: TradeLeg[] = [];
  let side: TradeSide | null = null;
  let openSize = 0;

  const finalize = (status: 'closed' | 'open') => {
    if (legs.length === 0) return;
    out.push(buildTrade(coin, legs, side!, status));
    legs = [];
    side = null;
    openSize = 0;
  };

  for (const fill of fills) {
    const role = dirToRole(fill.dir);

    if (role === 'open') {
      const fillSide: TradeSide = fill.dir === 'Open Long' ? 'long' : 'short';
      if (side === null) {
        side = fillSide;
      } else if (side !== fillSide) {
        throw new Error(
          `reconstructCoinTrades: ${coin}: open ${fillSide} while ${side} trade is still open (tid=${fill.tid})`,
        );
      }
      legs.push({ fill, role: 'open' });
      openSize += fill.sz;
    } else {
      if (side === null) {
        throw new Error(
          `reconstructCoinTrades: ${coin}: dangling close fill at tid=${fill.tid}`,
        );
      }
      const closeSide: TradeSide = fill.dir === 'Close Long' ? 'long' : 'short';
      if (closeSide !== side) {
        throw new Error(
          `reconstructCoinTrades: ${coin}: close ${closeSide} while ${side} trade is open (tid=${fill.tid})`,
        );
      }
      if (fill.sz > openSize + ZERO_TOLERANCE) {
        throw new Error(
          `reconstructCoinTrades: ${coin}: oversized close / flip not supported in v1 (tid=${fill.tid})`,
        );
      }
      legs.push({ fill, role: 'close' });
      openSize -= fill.sz;
      if (Math.abs(openSize) <= ZERO_TOLERANCE) {
        finalize('closed');
      }
    }
  }

  finalize('open');
  return out;
}

function dirToRole(dir: string): 'open' | 'close' {
  switch (dir) {
    case 'Open Long':
    case 'Open Short':
      return 'open';
    case 'Close Long':
    case 'Close Short':
      return 'close';
    default:
      throw new Error(`reconstructCoinTrades: unknown dir "${dir}"`);
  }
}

function buildTrade(
  coin: string,
  legs: ReadonlyArray<TradeLeg>,
  side: TradeSide,
  status: 'closed' | 'open',
): ReconstructedTrade {
  const opens = legs.filter((l) => l.role === 'open');
  const closes = legs.filter((l) => l.role === 'close');

  const openedSize = opens.reduce((s, l) => s + l.fill.sz, 0);
  const closedSize = closes.reduce((s, l) => s + l.fill.sz, 0);

  const sumOpenNotional = opens.reduce((s, l) => s + l.fill.sz * l.fill.px, 0);
  const sumCloseNotional = closes.reduce((s, l) => s + l.fill.sz * l.fill.px, 0);

  const avgEntryPx = openedSize > 0 ? sumOpenNotional / openedSize : 0;
  const avgExitPx = closedSize > 0 ? sumCloseNotional / closedSize : null;

  const realizedPnl = closes.reduce((s, l) => s + l.fill.closedPnl, 0);
  const totalFees = legs.reduce((s, l) => s + l.fill.fee, 0);

  const openedAt = legs[0]!.fill.time;
  const closedAt = legs[legs.length - 1]!.fill.time;

  return {
    id: `${coin}-${legs[0]!.fill.tid}`,
    wallet: null,
    coin,
    side,
    status,
    legs,
    openedAt,
    closedAt,
    holdTimeMs: closedAt - openedAt,
    openedSize,
    closedSize,
    avgEntryPx,
    avgExitPx,
    realizedPnl,
    totalFees,
    provenance: 'observed',
  };
}
