import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WalletHeader } from './WalletHeader';
import type { WalletAddress } from '@entities/wallet';

afterEach(() => cleanup());

const TEST_ADDR = '0x0000000000000000000000000000000000000001' as WalletAddress;

describe('WalletHeader', () => {
  it('renders the wallet address in a monospace chip', () => {
    render(
      <MemoryRouter>
        <WalletHeader address={TEST_ADDR} isFetching={false} onRefresh={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText(TEST_ADDR)).toBeInTheDocument();
  });

  it('renders a Back link to /', () => {
    render(
      <MemoryRouter>
        <WalletHeader address={TEST_ADDR} isFetching={false} onRefresh={() => {}} />
      </MemoryRouter>,
    );
    const back = screen.getByRole('link', { name: /back/i });
    expect(back).toHaveAttribute('href', '/');
  });

  it('fires onRefresh when the refresh button is clicked', () => {
    const onRefresh = vi.fn();
    render(
      <MemoryRouter>
        <WalletHeader address={TEST_ADDR} isFetching={false} onRefresh={onRefresh} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('disables the refresh button while isFetching=true', () => {
    render(
      <MemoryRouter>
        <WalletHeader address={TEST_ADDR} isFetching onRefresh={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled();
  });
});
