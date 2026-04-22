import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// vi.mock is hoisted to the top of the file. Use vi.hoisted() to share
// mock fns between the factory and the tests below.
const mocks = vi.hoisted(() => {
  const setOption = vi.fn<(option: object, opts?: { notMerge?: boolean }) => void>();
  const resize = vi.fn<() => void>();
  const dispose = vi.fn<() => void>();
  const on = vi.fn<(event: string, handler: (params: unknown) => void) => void>();
  const off = vi.fn<(event: string) => void>();
  const fakeInstance = { setOption, resize, dispose, on, off };
  const init = vi.fn<(el: HTMLElement) => typeof fakeInstance>(() => fakeInstance);
  return { setOption, resize, dispose, on, off, init };
});

vi.mock('@lib/charts/echarts-setup', () => ({
  echarts: {
    init: mocks.init,
  },
}));

import { EChartsBase } from './EChartsBase';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mocks.setOption.mockClear();
  mocks.resize.mockClear();
  mocks.dispose.mockClear();
  mocks.on.mockClear();
  mocks.off.mockClear();
  mocks.init.mockClear();
});

describe('EChartsBase', () => {
  it('initializes an ECharts instance on a div element', () => {
    render(<EChartsBase option={{ title: { text: 'a' } }} />);
    expect(mocks.init).toHaveBeenCalledOnce();
    expect(mocks.init.mock.calls[0]![0]).toBeInstanceOf(HTMLDivElement);
  });

  it('calls setOption with notMerge:true so series data replaces instead of merging', () => {
    render(<EChartsBase option={{ title: { text: 'a' } }} />);
    expect(mocks.setOption).toHaveBeenCalled();
    expect(mocks.setOption.mock.calls[0]![0]).toEqual({ title: { text: 'a' } });
    expect(mocks.setOption.mock.calls[0]![1]).toEqual({ notMerge: true });
  });

  it('applies className and style to the root div', () => {
    render(<EChartsBase option={{}} className="chart-root" style={{ height: 200 }} />);
    const el = screen.getByTestId('echarts-base');
    expect(el).toHaveClass('chart-root');
    expect(el).toHaveStyle({ height: '200px' });
  });

  it('calls setOption again when the option prop changes', () => {
    const { rerender } = render(<EChartsBase option={{ title: { text: 'a' } }} />);
    mocks.setOption.mockClear();
    rerender(<EChartsBase option={{ title: { text: 'b' } }} />);
    expect(mocks.setOption).toHaveBeenCalledOnce();
    expect(mocks.setOption.mock.calls[0]![0]).toEqual({ title: { text: 'b' } });
  });

  it('disposes the instance on unmount', () => {
    const { unmount } = render(<EChartsBase option={{}} />);
    expect(mocks.dispose).not.toHaveBeenCalled();
    unmount();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });

  it('attaches provided event handlers to the instance', () => {
    const click = vi.fn();
    render(<EChartsBase option={{}} onEvents={{ click }} />);
    expect(mocks.on).toHaveBeenCalledWith('click', click);
  });
});
