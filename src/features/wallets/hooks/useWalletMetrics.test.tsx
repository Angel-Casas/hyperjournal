import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactNode } from 'react';

import { useWalletMetrics } from './useWalletMetrics';
import { HyperJournalDb } from '@lib/storage/db';
import type { WalletAddress } from '@entities/wallet';

const fixturesDir = resolve(__dirname, '../../../../tests/fixtures/hyperliquid');
const fillsFixture = readFileSync(resolve(fixturesDir, 'user-fills.json'), 'utf8');

const addr = '0x0000000000000000000000000000000000000001' as WalletAddress;

let db: HyperJournalDb;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  db = new HyperJournalDb(`hj-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(async () => {
  db.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useWalletMetrics', () => {
  it('returns null stats while fills are loading', () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response(fillsFixture, { status: 200 }));
    const { result } = renderHook(() => useWalletMetrics(addr, { db }), { wrapper });
    expect(result.current.stats).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('returns computed stats after fills load', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response(fillsFixture, { status: 200 }));
    const { result } = renderHook(() => useWalletMetrics(addr, { db }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.stats).not.toBeNull();
    expect(result.current.stats!.closedCount).toBeGreaterThan(0);
  });

  it('propagates error from the underlying fetch', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response('{}', { status: 500 }));
    const { result } = renderHook(() => useWalletMetrics(addr, { db }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeTruthy();
  });
});
