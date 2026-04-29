import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { WalletHeader } from './WalletHeader';
import type { WalletAddress } from '@entities/wallet';

afterEach(() => cleanup());

const TEST_ADDR = '0x0000000000000000000000000000000000000001' as WalletAddress;

const NOOP = {
  onRefresh: () => {},
  onOpenFilters: () => {},
  filterCount: 0,
};

describe('WalletHeader', () => {
  it('renders the wallet address in a monospace chip', () => {
    render(
      <MemoryRouter>
        <WalletHeader address={TEST_ADDR} isFetching={false} {...NOOP} />
      </MemoryRouter>,
    );
    expect(screen.getByText(TEST_ADDR)).toBeInTheDocument();
  });

  it('renders a Back link to /', () => {
    render(
      <MemoryRouter>
        <WalletHeader address={TEST_ADDR} isFetching={false} {...NOOP} />
      </MemoryRouter>,
    );
    const back = screen.getByRole('link', { name: /back/i });
    expect(back).toHaveAttribute('href', '/');
  });

  it('fires onRefresh when the refresh button is clicked', () => {
    const onRefresh = vi.fn();
    render(
      <MemoryRouter>
        <WalletHeader
          address={TEST_ADDR}
          isFetching={false}
          onRefresh={onRefresh}
          onOpenFilters={() => {}}
          filterCount={0}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('disables the refresh button while isFetching=true', () => {
    render(
      <MemoryRouter>
        <WalletHeader address={TEST_ADDR} isFetching {...NOOP} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled();
  });
});

describe('WalletHeader filter button', () => {
  it('renders Filters button without badge when filterCount is 0', () => {
    render(
      <MemoryRouter>
        <WalletHeader address={TEST_ADDR} isFetching={false} {...NOOP} />
      </MemoryRouter>,
    );
    const btn = screen.getByRole('button', { name: /^filters$/i });
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).not.toMatch(/\d/);
  });

  it('shows the count badge when filterCount > 0', () => {
    render(
      <MemoryRouter>
        <WalletHeader
          address={TEST_ADDR}
          isFetching={false}
          onRefresh={() => {}}
          onOpenFilters={() => {}}
          filterCount={3}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('button', { name: /filters \(3 active\)/i }),
    ).toHaveTextContent('3');
  });

  it('clicking Filters calls onOpenFilters', async () => {
    const user = userEvent.setup();
    const onOpenFilters = vi.fn();
    render(
      <MemoryRouter>
        <WalletHeader
          address={TEST_ADDR}
          isFetching={false}
          onRefresh={() => {}}
          onOpenFilters={onOpenFilters}
          filterCount={0}
        />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /^filters$/i }));
    expect(onOpenFilters).toHaveBeenCalled();
  });
});
