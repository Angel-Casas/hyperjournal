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

vi.mock('echarts', () => ({ init: mocks.init }));

import { EquityCurveChart } from './EquityCurveChart';
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

describe('EquityCurveChart', () => {
  it('renders an empty state when there are no closed trades', () => {
    render(<EquityCurveChart trades={[]} />);
    expect(screen.getByText(/no closed trades/i)).toBeInTheDocument();
  });

  it('renders an empty state when all trades are open', () => {
    render(
      <EquityCurveChart
        trades={[makeTrade({ status: 'open', closedAt: 0, realizedPnl: 0 })]}
      />,
    );
    expect(screen.getByText(/no closed trades/i)).toBeInTheDocument();
  });

  it('renders the chart container and passes an option to EChartsBase when there is data', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', closedAt: 1000, realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'closed', closedAt: 2000, realizedPnl: -5 }),
    ];
    render(<EquityCurveChart trades={trades} />);
    expect(screen.getByTestId('echarts-base')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /equity curve/i })).toBeInTheDocument();
    // An option was passed (at least one setOption call with a populated series).
    expect(mocks.setOption).toHaveBeenCalled();
    const option = mocks.setOption.mock.calls[0]![0] as {
      series: Array<{ data: Array<{ value: [number, number] }> }>;
    };
    expect(option.series).toBeDefined();
    expect(option.series[0]!.data).toHaveLength(2);
    expect(option.series[0]!.data[0]!.value).toEqual([1000, 10]);
    expect(option.series[0]!.data[1]!.value).toEqual([2000, 5]); // running equity
  });
});
