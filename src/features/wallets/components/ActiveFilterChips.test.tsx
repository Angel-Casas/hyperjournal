import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActiveFilterChips } from './ActiveFilterChips';
import {
  DEFAULT_FILTER_STATE,
  setCoin,
  setSide,
  setDateRangePreset,
  type FilterState,
} from '@domain/filters/filterState';
import type { YYYYMMDD } from '@domain/dates/isValidDateString';

describe('ActiveFilterChips', () => {
  it('renders nothing when state is default', () => {
    const { container } = render(
      <ActiveFilterChips state={DEFAULT_FILTER_STATE} onChange={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders one chip per active dimension', () => {
    let s = setCoin(DEFAULT_FILTER_STATE, 'BTC');
    s = setSide(s, 'long');
    s = setDateRangePreset(s, '30d');
    render(<ActiveFilterChips state={s} onChange={() => {}} />);
    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.getByText('Long')).toBeInTheDocument();
    expect(screen.getByText('Last 30 days')).toBeInTheDocument();
  });

  it('chip X removes only that dimension', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    let s = setCoin(DEFAULT_FILTER_STATE, 'BTC');
    s = setSide(s, 'long');
    render(<ActiveFilterChips state={s} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Remove coin filter' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ coin: null, side: 'long' }),
    );
  });

  it('Clear all resets to default', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const s = setCoin(DEFAULT_FILTER_STATE, 'BTC');
    render(<ActiveFilterChips state={s} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_FILTER_STATE);
  });

  it('custom date range chip shows from – to label', () => {
    const s: FilterState = {
      ...DEFAULT_FILTER_STATE,
      dateRange: {
        kind: 'custom',
        from: '2026-01-01' as YYYYMMDD,
        to: '2026-04-28' as YYYYMMDD,
      },
    };
    render(<ActiveFilterChips state={s} onChange={() => {}} />);
    expect(screen.getByText('2026-01-01 – 2026-04-28')).toBeInTheDocument();
  });
});
