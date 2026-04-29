import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FiltersDrawer } from './FiltersDrawer';
import {
  DEFAULT_FILTER_STATE,
  setCoin,
  setSide,
} from '@domain/filters/filterState';

const COINS = ['BTC', 'ETH', 'SOL'];

describe('FiltersDrawer', () => {
  it('renders the title and the 5 control sections when open', () => {
    render(
      <FiltersDrawer
        open={true}
        onOpenChange={() => {}}
        state={DEFAULT_FILTER_STATE}
        onChange={() => {}}
        availableCoins={COINS}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Date range' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Coin' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Side' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Outcome' })).toBeInTheDocument();
  });

  it('selecting a date preset updates state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FiltersDrawer
        open={true}
        onOpenChange={() => {}}
        state={DEFAULT_FILTER_STATE}
        onChange={onChange}
        availableCoins={COINS}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Last 30 days' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ dateRange: { kind: 'preset', preset: '30d' } }),
    );
  });

  it('selecting a coin updates state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FiltersDrawer
        open={true}
        onOpenChange={() => {}}
        state={DEFAULT_FILTER_STATE}
        onChange={onChange}
        availableCoins={COINS}
      />,
    );
    await user.selectOptions(screen.getByLabelText(/^coin$/i), 'BTC');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ coin: 'BTC' }),
    );
  });

  it('toggling Side: Long updates state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FiltersDrawer
        open={true}
        onOpenChange={() => {}}
        state={DEFAULT_FILTER_STATE}
        onChange={onChange}
        availableCoins={COINS}
      />,
    );
    await user.click(screen.getByRole('radio', { name: 'Long' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ side: 'long' }),
    );
  });

  it('Clear all is disabled when state is default', () => {
    render(
      <FiltersDrawer
        open={true}
        onOpenChange={() => {}}
        state={DEFAULT_FILTER_STATE}
        onChange={() => {}}
        availableCoins={COINS}
      />,
    );
    expect(screen.getByRole('button', { name: /clear all/i })).toBeDisabled();
  });

  it('Clear all is enabled and resets to default when active', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const active = setSide(setCoin(DEFAULT_FILTER_STATE, 'BTC'), 'long');
    render(
      <FiltersDrawer
        open={true}
        onOpenChange={() => {}}
        state={active}
        onChange={onChange}
        availableCoins={COINS}
      />,
    );
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_FILTER_STATE);
  });
});
