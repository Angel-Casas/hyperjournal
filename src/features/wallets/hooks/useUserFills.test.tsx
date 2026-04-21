import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactNode } from 'react';

import { useUserFills } from './useUserFills';
import { HyperJournalDb } from '@lib/storage/db';
import { createFillsCacheRepo } from '@lib/storage/fills-cache-repo';
import type { WalletAddress } from '@entities/wallet';

const fixturesDir = resolve(__dirname, '../../../../tests/fixtures/hyperliquid');
const fillsFixture = readFileSync(resolve(fixturesDir, 'user-fills.json'), 'utf8');

const addr = '0x000000000000000000000000000000000000000a' as WalletAddress;

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

describe('useUserFills', () => {
  it('fetches fills from the API when no cache exists and writes them to Dexie', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response(fillsFixture, { status: 200 }));

    const { result } = renderHook(() => useUserFills(addr, { db }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data!.length).toBeGreaterThan(0);
    const cached = await createFillsCacheRepo(db).get(addr);
    expect(cached).not.toBeNull();
    expect(cached!.fills.length).toBe(result.current.data!.length);
  });

  it('returns cached fills without calling fetch when cache is fresh', async () => {
    const mockFetch = vi.mocked(global.fetch);
    const cachedFills = [
      {
        coin: 'BTC',
        px: 1,
        sz: 1,
        side: 'B' as const,
        time: 1,
        startPosition: 0,
        dir: '',
        closedPnl: 0,
        hash: '',
        oid: 1,
        crossed: true,
        fee: 0,
        tid: 1,
        feeToken: 'USDC',
        twapId: null,
      },
    ];
    await createFillsCacheRepo(db).set(addr, cachedFills, Date.now());

    const { result } = renderHook(() => useUserFills(addr, { db }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0]!.tid).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refetches from API and updates cache when cache is stale', async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValue(new Response(fillsFixture, { status: 200 }));

    // Seed a stale cache (fetchedAt far in the past)
    await createFillsCacheRepo(db).set(addr, [], 0);

    const { result } = renderHook(() => useUserFills(addr, { db }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(result.current.data!.length).toBeGreaterThan(0);
  });

  it('surfaces an error when the fetch fails and the cache is empty', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response('{}', { status: 500 }));

    const { result } = renderHook(() => useUserFills(addr, { db }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeTruthy();
  });
});
