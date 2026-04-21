import type { TradeStats } from '@entities/trade-stats';
import { MetricCard } from '@lib/ui/components/metric-card';
import {
  formatCompactCount,
  formatCurrency,
  formatHoldTime,
  formatPercent,
} from '@lib/ui/format';

type Props = { stats: TradeStats };

export function WalletMetricsGrid({ stats }: Props) {
  const pnlTone =
    stats.totalPnl > 0 ? 'gain' : stats.totalPnl < 0 ? 'loss' : 'neutral';
  const expectancyTone =
    stats.expectancy !== null && stats.expectancy >= 0 ? 'gain' : 'loss';

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      <MetricCard
        label="Total PnL"
        value={formatCurrency(stats.totalPnl)}
        tone={pnlTone}
        provenance={stats.provenance}
      />
      <MetricCard
        label="Closed trades"
        value={formatCompactCount(stats.closedCount)}
        provenance={stats.provenance}
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
        tone={expectancyTone}
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
        tone="gain"
        provenance={stats.provenance}
      />
      <MetricCard
        label="Worst trade"
        value={formatCurrency(stats.worstTrade)}
        tone="loss"
        provenance={stats.provenance}
      />
      <MetricCard
        label="Total fees"
        value={formatCurrency(-stats.totalFees)}
        tone="loss"
        provenance={stats.provenance}
        subtext="across all trades"
      />
    </div>
  );
}
