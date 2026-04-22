import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WalletView } from './WalletView';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderWalletView(address: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/w/${address}`]}>
        <Routes>
          <Route path="/w/:address" element={<WalletView />} />
          <Route path="/" element={<div data-testid="home">home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('WalletView error copy', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows 4xx copy for HyperliquidApiError with status 404', async () => {
    const fetchMock = vi.mocked(globalThis.fetch) as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '',
    } as unknown as Response);
    renderWalletView('0x0000000000000000000000000000000000000001');
    await waitFor(() => {
      expect(screen.getByText(/no hyperliquid history/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('shows 5xx/network copy for HyperliquidApiError with status 503', async () => {
    const fetchMock = vi.mocked(globalThis.fetch) as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '',
    } as unknown as Response);
    renderWalletView('0x0000000000000000000000000000000000000001');
    await waitFor(() => {
      expect(screen.getByText(/couldn.t reach hyperliquid/i)).toBeInTheDocument();
    });
  });

  it('shows ZodError copy when the response fails validation', async () => {
    const fetchMock = vi.mocked(globalThis.fetch) as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ unexpected: 'shape' }),
    } as unknown as Response);
    renderWalletView('0x0000000000000000000000000000000000000001');
    await waitFor(() => {
      expect(screen.getByText(/doesn.t yet understand/i)).toBeInTheDocument();
    });
  });

  it('shows generic copy for unknown errors', async () => {
    const fetchMock = vi.mocked(globalThis.fetch) as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValue(new Error('boom'));
    renderWalletView('0x0000000000000000000000000000000000000001');
    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });

  it('Try again button triggers a refetch', async () => {
    const fetchMock = vi.mocked(globalThis.fetch) as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '',
    } as unknown as Response);
    renderWalletView('0x0000000000000000000000000000000000000001');
    const tryAgain = await screen.findByRole('button', { name: /try again/i });
    fetchMock.mockClear();
    fireEvent.click(tryAgain);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });
});
