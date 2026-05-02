import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

import {
  toggleHoldDuration,
  toggleDayOfWeek,
} from '@domain/filters/filterState';

describe('FiltersDrawer — 8b sections', () => {
  function renderOpen(state = DEFAULT_FILTER_STATE, onChange = vi.fn()) {
    return render(
      <FiltersDrawer
        open={true}
        onOpenChange={() => {}}
        state={state}
        onChange={onChange}
        availableCoins={COINS}
      />,
    );
  }

  it('renders the three group headers', () => {
    renderOpen();
    expect(screen.getByRole('heading', { name: /^when$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^what$/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /outcome.*shape/i }),
    ).toBeInTheDocument();
  });

  it('renders the four 8b MultiBucketControl groups', () => {
    renderOpen();
    expect(
      screen.getByRole('group', { name: /hold duration/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: /time of day/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: /day of week/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: /trade size/i }),
    ).toBeInTheDocument();
  });

  it('clicking a hold-duration bucket fires onChange with toggleHoldDuration applied', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderOpen(DEFAULT_FILTER_STATE, onChange);
    await user.click(
      screen
        .getByRole('group', { name: /hold duration/i })
        .querySelector('button[aria-pressed]')!,
    );
    // The first button in the group is "Scalp"
    expect(onChange).toHaveBeenCalledWith(
      toggleHoldDuration(DEFAULT_FILTER_STATE, 'scalp'),
    );
  });

  it('clicking a day chip toggles in dayOfWeek', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderOpen(DEFAULT_FILTER_STATE, onChange);
    const dowGroup = screen.getByRole('group', { name: /day of week/i });
    await user.click(dowGroup.querySelector('button[aria-pressed]')!);
    expect(onChange).toHaveBeenCalledWith(
      toggleDayOfWeek(DEFAULT_FILTER_STATE, 'mon'),
    );
  });

  it('shows aria-pressed=true on already-selected buckets', () => {
    const seeded = toggleHoldDuration(DEFAULT_FILTER_STATE, 'intraday');
    renderOpen(seeded);
    const holdGroup = screen.getByRole('group', { name: /hold duration/i });
    const intradayBtn = within(holdGroup).getByRole('button', {
      name: /intraday/i,
    });
    expect(intradayBtn).toHaveAttribute('aria-pressed', 'true');
  });
});
