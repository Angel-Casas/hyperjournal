import { formatCurrency } from '@lib/ui/format';
import type { PnlCalendarDay } from '@domain/metrics/buildPnlCalendar';

type Props = { days: ReadonlyArray<PnlCalendarDay> };

/**
 * Screen-reader-only fallback for the PnL calendar heatmap. The ECharts
 * canvas is aria-hidden (see EChartsBase), so without this table,
 * assistive tech sees no calendar data at all. Rendered as a sibling of
 * the canvas inside the same <section>; visual users see only the chart.
 */
export function PnlCalendarFallbackTable({ days }: Props) {
  return (
    <div className="sr-only">
      <table aria-label="Daily profit and loss">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">PnL</th>
            <th scope="col">Trades</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{formatCurrency(d.pnl)}</td>
              <td>{d.tradeCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
