import { useMemo } from 'react';
import { EChartsBase } from '@lib/charts/EChartsBase';
import { CHART_TOKENS as T } from '@lib/charts/tokens';
import { buildEquityCurve } from '@domain/metrics/buildEquityCurve';
import type { ReconstructedTrade } from '@entities/trade';
import type { EChartsOption } from 'echarts';

type Props = { trades: ReadonlyArray<ReconstructedTrade> };

export function EquityCurveChart({ trades }: Props) {
  const curve = useMemo(() => buildEquityCurve(trades), [trades]);

  const option = useMemo<EChartsOption>(() => {
    if (curve.length === 0) return {};
    return {
      // ECharts' own animation runs on canvas and ignores the global CSS
      // prefers-reduced-motion override. Disable unconditionally until a
      // proper matchMedia-aware toggle lands in Session 5 polish.
      animation: false,
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: T.bgRaised,
        borderColor: T.borderStrong,
        textStyle: { color: T.fgBase },
        formatter: (p: unknown) => {
          const param = (Array.isArray(p) ? p[0] : p) as {
            data: { value: [number, number]; coin: string; pnl: number };
          };
          const [timestamp, equity] = param.data.value;
          const date = new Date(timestamp).toISOString().slice(0, 10);
          const pnlStr =
            param.data.pnl >= 0
              ? `+$${param.data.pnl.toFixed(2)}`
              : `-$${Math.abs(param.data.pnl).toFixed(2)}`;
          return `${date}<br/>Trade: ${param.data.coin} ${pnlStr}<br/>Equity: $${equity.toFixed(2)}`;
        },
      },
      grid: { left: 50, right: 20, top: 20, bottom: 40 },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: T.borderStrong } },
        axisLabel: { color: T.fgMuted },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: T.borderStrong } },
        axisLabel: {
          color: T.fgMuted,
          formatter: (v: number) =>
            v >= 0 ? `$${v.toFixed(0)}` : `-$${Math.abs(v).toFixed(0)}`,
        },
        splitLine: { lineStyle: { color: T.border } },
      },
      series: [
        {
          type: 'line',
          smooth: false,
          showSymbol: false,
          lineStyle: { color: T.gain, width: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: T.gainFade0 },
                { offset: 1, color: T.gainFade1 },
              ],
            },
          },
          data: curve.map((p) => ({
            value: [p.time, p.equity] as [number, number],
            coin: p.coin,
            pnl: p.pnl,
          })),
        },
      ],
    };
  }, [curve]);

  if (curve.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-bg-raised text-sm text-fg-subtle">
        No closed trades to chart yet.
      </div>
    );
  }

  return (
    <section
      aria-labelledby="equity-heading"
      className="rounded-lg border border-border bg-bg-raised p-4"
    >
      <h2 id="equity-heading" className="mb-4 text-lg font-semibold text-fg-base">
        Equity curve
      </h2>
      <EChartsBase option={option} style={{ height: 260 }} />
    </section>
  );
}
