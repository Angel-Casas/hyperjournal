import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// Mock ECharts so jsdom doesn't try to render a real chart. The same
// pattern used in EChartsBase.test.tsx: vi.hoisted + vi.mock.
const mocks = vi.hoisted(() => {
  const setOption = vi.fn<(option: object, opts?: { notMerge?: boolean }) => void>();
  const resize = vi.fn<() => void>();
  const dispose = vi.fn<() => void>();
  const on = vi.fn<(event: string, handler: (params: unknown) => void) => void>();
  const off = vi.fn<(event: string) => void>();
  const fakeInstance = { setOption, resize, dispose, on, off };
  const init = vi.fn<(el: HTMLElement) => typeof fakeInstance>(() => fakeInstance);
  return { setOption, init };
});

vi.mock('@lib/charts/echarts-setup', () => ({
  echarts: { init: mocks.init },
}));

import { PnlCalendarChart } from './PnlCalendarChart';
import type { ReconstructedTrade } from '@entities/trade';

afterEach(() => cleanup());

const makeTrade = (o: Partial<ReconstructedTrade>): ReconstructedTrade => ({
  id: 'x',
  wallet: null,
  coin: 'BTC',
  side: 'long',
  status: 'closed',
  legs: [],
  openedAt: 0,
  closedAt: 0,
  holdTimeMs: 0,
  openedSize: 0,
  closedSize: 0,
  avgEntryPx: 0,
  avgExitPx: null,
  realizedPnl: 0,
  totalFees: 0,
  provenance: 'observed',
  ...o,
});

describe('PnlCalendarChart', () => {
  it('renders an empty state when there are no closed trades', () => {
    render(<PnlCalendarChart trades={[]} />);
    expect(screen.getByText(/no closed trades/i)).toBeInTheDocument();
  });

  it('renders the chart and passes a calendar+heatmap option', () => {
    // 2024-03-15 12:00 UTC = 1710504000000
    // 2024-03-16 12:00 UTC = 1710590400000
    const trades = [
      makeTrade({ id: 'a', status: 'closed', closedAt: 1710504000000, realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'closed', closedAt: 1710590400000, realizedPnl: -3 }),
    ];
    render(<PnlCalendarChart trades={trades} />);
    expect(screen.getByRole('heading', { name: /p\/l calendar/i })).toBeInTheDocument();
    expect(screen.getByTestId('echarts-base')).toBeInTheDocument();
    expect(mocks.setOption).toHaveBeenCalled();
    const option = mocks.setOption.mock.calls[0]![0] as {
      calendar: { range: [string, string] };
      series: Array<{ type: string; coordinateSystem: string; data: Array<[string, number, number]> }>;
    };
    expect(option.calendar.range).toEqual(['2024-03-15', '2024-03-16']);
    expect(option.series[0]!.type).toBe('heatmap');
    expect(option.series[0]!.coordinateSystem).toBe('calendar');
    // Entries sorted by date ascending
    expect(option.series[0]!.data).toEqual([
      ['2024-03-15', 10, 1],
      ['2024-03-16', -3, 1],
    ]);
  });
});
