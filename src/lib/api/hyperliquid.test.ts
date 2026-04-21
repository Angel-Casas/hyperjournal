import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fetchClearinghouseState, fetchUserFills, HyperliquidApiError } from './hyperliquid';
import type { WalletAddress } from '@entities/wallet';

const fixturesDir = resolve(__dirname, '../../../tests/fixtures/hyperliquid');
const fillsFixture = readFileSync(resolve(fixturesDir, 'user-fills.json'), 'utf8');
const stateFixture = readFileSync(resolve(fixturesDir, 'clearinghouse-state.json'), 'utf8');

const testWallet = '0x0000000000000000000000000000000000000001' as WalletAddress;

describe('fetchUserFills', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs to the /info endpoint with the right body shape', async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValue(new Response(fillsFixture, { status: 200 }));

    await fetchUserFills(testWallet);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://api.hyperliquid.xyz/info');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init!.body as string)).toEqual({
      type: 'userFills',
      user: testWallet,
    });
  });

  it('returns typed RawFill[] after validation', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response(fillsFixture, { status: 200 }));
    const result = await fetchUserFills(testWallet);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(typeof result[0]!.px).toBe('number');
    expect(['B', 'A']).toContain(result[0]!.side);
  });

  it('throws HyperliquidApiError on non-2xx response', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response('{"error":"nope"}', { status: 500 }));
    await expect(fetchUserFills(testWallet)).rejects.toThrow(HyperliquidApiError);
  });

  it('preserves the status and body on HyperliquidApiError', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response('server exploded', { status: 503 }));
    try {
      await fetchUserFills(testWallet);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(HyperliquidApiError);
      const e = err as HyperliquidApiError;
      expect(e.status).toBe(503);
      expect(e.body).toBe('server exploded');
    }
  });

  it('throws when the response body fails schema validation', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response('[{"coin":"BTC"}]', { status: 200 }));
    await expect(fetchUserFills(testWallet)).rejects.toThrow();
  });
});

describe('fetchClearinghouseState', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs with type "clearinghouseState"', async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValue(new Response(stateFixture, { status: 200 }));

    const state = await fetchClearinghouseState(testWallet);

    expect(JSON.parse(mockFetch.mock.calls[0]![1]!.body as string)).toEqual({
      type: 'clearinghouseState',
      user: testWallet,
    });
    expect(typeof state.time).toBe('number');
    expect(Array.isArray(state.assetPositions)).toBe(true);
  });
});
