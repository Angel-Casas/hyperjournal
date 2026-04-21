import type { RawFill } from '@entities/fill';

/**
 * Hyperliquid returns both perp and spot fills from the `userFills`
 * endpoint. Perps use `coin` like `BTC`, `xyz:NVDA` and `dir` values like
 * `Open Long` / `Close Short`. Spot markets are named `@N` (HL's internal
 * market index) and use `dir: 'Buy' | 'Sell'` — an entirely different
 * accounting model (positions accumulate rather than open/close).
 *
 * HyperJournal's v1 scope per CLAUDE.md §1 is perpetual/futures trading
 * only. Spot fills are filtered out here so reconstruction does not have
 * to know about the spot data model. If spot support is ever added, it
 * will be a separate domain module with its own entity types.
 */
export function isPerpFill(fill: RawFill): boolean {
  if (fill.coin.startsWith('@')) return false;
  switch (fill.dir) {
    case 'Open Long':
    case 'Open Short':
    case 'Close Long':
    case 'Close Short':
    case 'Auto-Deleveraging':
    case 'Liquidation':
      return true;
    default:
      return false;
  }
}
