import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExportPanel } from './ExportPanel';
import { HyperJournalDb } from '@lib/storage/db';
import type { WalletAddress } from '@entities/wallet';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// jsdom's URL doesn't implement createObjectURL/revokeObjectURL. Define
// stubs once so spyOn has something to replace.
beforeAll(() => {
  if (!('createObjectURL' in URL)) {
    Object.defineProperty(URL, 'createObjectURL', {
      value: () => 'blob:stub',
      writable: true,
      configurable: true,
    });
  }
  if (!('revokeObjectURL' in URL)) {
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: () => {},
      writable: true,
      configurable: true,
    });
  }
});

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`export-panel-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExportPanel db={db} />
    </QueryClientProvider>,
  );
}

const ADDR = '0x0000000000000000000000000000000000000001' as WalletAddress;

describe('ExportPanel', () => {
  it('renders the include-cache checkbox, unchecked by default', () => {
    renderPanel();
    const cb = screen.getByRole('checkbox', { name: /include cached market data/i });
    expect(cb).not.toBeChecked();
  });

  it('renders the Export button', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /export data/i })).toBeInTheDocument();
  });

  it('clicking Export creates an object URL and triggers a download', async () => {
    await db.wallets.put({ address: ADDR, label: null, addedAt: 1 });
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:test-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    // Suppress jsdom's "Not implemented: navigation" noise from <a>.click().
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /export data/i }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());

    // jsdom's Blob round-trip (arrayBuffer / text / new Response().text()) is
    // unreliable — we verify the Blob instance and MIME type here; the file
    // contents are covered by buildExport's pure-domain unit tests.
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');
    expect(clickSpy).toHaveBeenCalled();
  });

  it('Export click works with include-cache checked', async () => {
    await db.fillsCache.put({ address: ADDR, fetchedAt: 1, fills: [] });
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:test-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderPanel();
    fireEvent.click(screen.getByRole('checkbox', { name: /include cached market data/i }));
    fireEvent.click(screen.getByRole('button', { name: /export data/i }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(createObjectURL.mock.calls[0]![0]).toBeInstanceOf(Blob);
  });
});
