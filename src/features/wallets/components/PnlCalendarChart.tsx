import { useMemo } from 'react';
import { EChartsBase } from '@lib/charts/EChartsBase';
import { buildPnlCalendar } from '@domain/metrics/buildPnlCalendar';
import type { ReconstructedTrade } from '@entities/trade';
import type { EChartsOption } from 'echarts';

type Props = { trades: ReadonlyArray<ReconstructedTrade> };

const TOKEN = {
  bgBase: 'hsl(220 13% 6%)',
  bgOverlay: 'hsl(220 12% 9%)',
  borderStrong: 'hsl(220 10% 26%)',
  border: 'hsl(220 10% 18%)',
  fgBase: 'hsl(210 20% 96%)',
  fgMuted: 'hsl(215 16% 72%)',
  gain: 'hsl(152 76% 50%)',
  loss: 'hsl(357 80% 60%)',
};

export function PnlCalendarChart({ trades }: Props) {
  const calendar = useMemo(() => buildPnlCalendar(trades), [trades]);

  const option = useMemo<EChartsOption>(() => {
    if (calendar.size === 0) return {};
    const entries = Array.from(calendar.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const firstDate = entries[0]!.date;
    const lastDate = entries[entries.length - 1]!.date;
    const maxAbs = entries.reduce((m, e) => Math.max(m, Math.abs(e.pnl)), 1);

    return {
      animation: false,
      backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: TOKEN.bgOverlay,
        borderColor: TOKEN.borderStrong,
        textStyle: { color: TOKEN.fgBase },
        formatter: (p: unknown) => {
          const param = p as { data: [string, number, number] };
          const [date, pnl, count] = param.data;
          const pnlStr =
            pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
          return `${date}<br/>${count} trade${count === 1 ? '' : 's'} • ${pnlStr}`;
        },
      },
      visualMap: {
        min: -maxAbs,
        max: maxAbs,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        show: false,
        inRange: {
          color: [TOKEN.loss, TOKEN.border, TOKEN.gain],
        },
      },
      calendar: {
        range: [firstDate, lastDate],
        cellSize: ['auto', 16],
        itemStyle: { borderColor: TOKEN.bgBase, borderWidth: 1 },
        splitLine: { show: false },
        dayLabel: { color: TOKEN.fgMuted },
        monthLabel: { color: TOKEN.fgMuted },
        yearLabel: { show: false },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: entries.map((e) => [e.date, e.pnl, e.tradeCount]),
        },
      ],
    };
  }, [calendar]);

  if (calendar.size === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-border bg-bg-raised text-sm text-fg-subtle">
        No closed trades to display in the calendar.
      </div>
    );
  }

  return (
    <section
      aria-labelledby="calendar-heading"
      className="rounded-lg border border-border bg-bg-raised p-4"
    >
      <h2 id="calendar-heading" className="mb-4 text-lg font-semibold text-fg-base">
        P/L calendar
      </h2>
      <EChartsBase option={option} style={{ height: 180 }} />
    </section>
  );
}
