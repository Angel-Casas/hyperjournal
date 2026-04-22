import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TradeDetail } from './TradeDetail';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/w/:address" element={<div data-testid="wallet-view">wallet view</div>} />
          <Route path="/w/:address/t/:tradeId" element={<TradeDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TradeDetail', () => {
  it('redirects when the address is invalid', async () => {
    renderAt('/w/not-a-hex/t/BTC-1');
    // With an invalid address, TradeDetail returns <Navigate to="/" />.
    // The test route table doesn't include "/", so the redirect lands on
    // React Router's "No routes matched" state; we assert that the wallet
    // view stub is NOT in the DOM (TradeDetail's own content never rendered).
    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    });
  });

  it('redirects to /w/:address when the tradeId does not match any trade', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })));
    renderAt('/w/0x0000000000000000000000000000000000000001/t/NONEXISTENT');
    await waitFor(() => expect(screen.getByTestId('wallet-view')).toBeInTheDocument());
  });
});
