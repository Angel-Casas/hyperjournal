import type { TradeStats } from '@entities/trade-stats';
import { MetricCard } from '@lib/ui/components/metric-card';
import {
  formatCompactCount,
  formatCurrency,
  formatHoldTime,
  formatPercent,
} from '@lib/ui/format';

type Props = { stats: TradeStats };

type Tone = 'neutral' | 'gain' | 'loss' | 'risk';

/**
 * Resolve a tone from a signed number that may be null. Null → neutral
 * (no data should not be coloured green or red); positive → gain; negative
 * → loss; exactly zero → neutral.
 */
function signedTone(value: number | null): Tone {
  if (value === null) return 'neutral';
  if (value > 0) return 'gain';
  if (value < 0) return 'loss';
  return 'neutral';
}

export function WalletMetricsGrid({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      <MetricCard
        label="Total PnL"
        value={formatCurrency(stats.totalPnl)}
        tone={signedTone(stats.totalPnl)}
        provenance={stats.provenance}
      />
      <MetricCard
        label="Closed trades"
        value={formatCompactCount(stats.closedCount)}
        provenance={stats.provenance}
        subtext={
          stats.breakEvenCount > 0
            ? `${stats.breakEvenCount} break-even`
            : undefined
        }
      />
      <MetricCard
        label="Open trades"
        value={formatCompactCount(stats.openCount)}
        provenance={stats.provenance}
        subtext={stats.openCount > 0 ? 'Still running' : undefined}
      />
      <MetricCard
        label="Win rate"
        value={formatPercent(stats.winRate)}
        provenance={stats.provenance}
      />
      <MetricCard
        label="Expectancy"
        value={formatCurrency(stats.expectancy)}
        tone={signedTone(stats.expectancy)}
        provenance={stats.provenance}
        subtext="per trade"
      />
      <MetricCard
        label="Profit factor"
        value={stats.profitFactor !== null ? stats.profitFactor.toFixed(2) : '—'}
        provenance={stats.provenance}
      />
      <MetricCard
        label="Max drawdown"
        value={formatCurrency(stats.maxDrawdown > 0 ? -stats.maxDrawdown : 0)}
        tone={stats.maxDrawdown > 0 ? 'loss' : 'neutral'}
        provenance={stats.provenance}
        subtext={
          stats.maxDrawdownPct !== null
            ? `${formatPercent(stats.maxDrawdownPct)} peak-to-trough`
            : undefined
        }
      />
      <MetricCard
        label="Avg hold time"
        value={formatHoldTime(stats.avgHoldTimeMs)}
        provenance={stats.provenance}
      />
      <MetricCard
        label="Best trade"
        value={formatCurrency(stats.bestTrade)}
        tone={signedTone(stats.bestTrade)}
        provenance={stats.provenance}
      />
      <MetricCard
        label="Worst trade"
        value={formatCurrency(stats.worstTrade)}
        tone={signedTone(stats.worstTrade)}
        provenance={stats.provenance}
      />
      <MetricCard
        label="Total fees"
        value={formatCurrency(stats.totalFees > 0 ? -stats.totalFees : 0)}
        tone={stats.totalFees > 0 ? 'loss' : 'neutral'}
        provenance={stats.provenance}
        subtext="across all trades"
      />
    </div>
  );
}
