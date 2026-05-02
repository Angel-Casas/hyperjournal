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

import {
  toggleHoldDuration,
  toggleDayOfWeek,
  toggleTradeSize,
} from '@domain/filters/filterState';

describe('ActiveFilterChips — 8b multi-select rendering', () => {
  it('renders no chip for empty arrays', () => {
    render(
      <ActiveFilterChips state={DEFAULT_FILTER_STATE} onChange={() => {}} />,
    );
    expect(screen.queryByText(/hold/i)).toBeNull();
  });

  it('renders inline list for 1–3 buckets', () => {
    let state = toggleHoldDuration(DEFAULT_FILTER_STATE, 'scalp');
    state = toggleHoldDuration(state, 'intraday');
    render(<ActiveFilterChips state={state} onChange={() => {}} />);
    expect(
      screen.getByText(/hold:\s*scalp,\s*intraday/i),
    ).toBeInTheDocument();
  });

  it('renders count summary for 4+ buckets', () => {
    let state = DEFAULT_FILTER_STATE;
    state = toggleDayOfWeek(state, 'mon');
    state = toggleDayOfWeek(state, 'tue');
    state = toggleDayOfWeek(state, 'wed');
    state = toggleDayOfWeek(state, 'thu');
    state = toggleDayOfWeek(state, 'fri');
    render(<ActiveFilterChips state={state} onChange={() => {}} />);
    expect(screen.getByText(/day:\s*5 selected/i)).toBeInTheDocument();
  });

  it('chip X clears the entire dimension', async () => {
    const user = userEvent.setup();
    let state = toggleHoldDuration(DEFAULT_FILTER_STATE, 'scalp');
    state = toggleHoldDuration(state, 'intraday');
    const onChange = vi.fn();
    render(<ActiveFilterChips state={state} onChange={onChange} />);
    await user.click(screen.getByLabelText(/remove hold/i));
    expect(onChange).toHaveBeenCalledWith({
      ...state,
      holdDuration: [],
    });
  });

  it('renders inline list in canonical order regardless of selection order', () => {
    let state = toggleTradeSize(DEFAULT_FILTER_STATE, 'whale');
    state = toggleTradeSize(state, 'small');
    state = toggleTradeSize(state, 'medium');
    render(<ActiveFilterChips state={state} onChange={() => {}} />);
    expect(
      screen.getByText(/size:\s*small,\s*medium,\s*whale/i),
    ).toBeInTheDocument();
  });
});
