import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { SplitHome } from './SplitHome';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SplitHome', () => {
  it('renders the paste, recent-wallets, analytics, and journal sections', () => {
    render(<SplitHome />, { wrapper });
    expect(screen.getByRole('heading', { name: /paste a wallet/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /recent wallets/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /trading analytics/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^journal$/i })).toBeInTheDocument();
  });
});
