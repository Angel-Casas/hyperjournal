import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HyperJournalDb } from './db';
import { createFillsCacheRepo, type FillsCacheRepo } from './fills-cache-repo';
import type { WalletAddress } from '@entities/wallet';
import type { RawFill } from '@entities/fill';

let db: HyperJournalDb;
let repo: FillsCacheRepo;

const addr = '0x000000000000000000000000000000000000000a' as WalletAddress;

const makeFill = (overrides: Partial<RawFill> = {}): RawFill => ({
  coin: 'BTC',
  px: 42000,
  sz: 0.1,
  side: 'B',
  time: 1700000000000,
  startPosition: 0,
  dir: 'Open Long',
  closedPnl: 0,
  hash: '0x0',
  oid: 1,
  crossed: true,
  fee: 1.5,
  tid: 1,
  feeToken: 'USDC',
  twapId: null,
  ...overrides,
});

beforeEach(async () => {
  db = new HyperJournalDb(`hj-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
  repo = createFillsCacheRepo(db);
});

afterEach(async () => {
  db.close();
});

describe('fillsCacheRepo', () => {
  it('get returns null when no cache exists for an address', async () => {
    expect(await repo.get(addr)).toBeNull();
  });

  it('set then get returns the same fills and fetchedAt', async () => {
    const fills = [makeFill({ tid: 1 }), makeFill({ tid: 2 })];
    await repo.set(addr, fills, 5_000);
    const entry = await repo.get(addr);
    expect(entry).not.toBeNull();
    expect(entry!.fetchedAt).toBe(5_000);
    expect(entry!.fills).toHaveLength(2);
    expect(entry!.fills[0]!.tid).toBe(1);
  });

  it('set overwrites any prior cache for the same address', async () => {
    await repo.set(addr, [makeFill({ tid: 1 })], 1_000);
    await repo.set(addr, [makeFill({ tid: 42 })], 2_000);
    const entry = await repo.get(addr);
    expect(entry!.fetchedAt).toBe(2_000);
    expect(entry!.fills).toHaveLength(1);
    expect(entry!.fills[0]!.tid).toBe(42);
  });

  it('invalidate removes the cache entry for the address', async () => {
    await repo.set(addr, [makeFill()], 1_000);
    await repo.invalidate(addr);
    expect(await repo.get(addr)).toBeNull();
  });

  it('isFresh uses the provided TTL and clock', async () => {
    await repo.set(addr, [makeFill()], 1_000);
    // age = 2500 - 1000 = 1500; ttl 2000 → fresh
    expect(await repo.isFresh(addr, 2_000, 2_500)).toBe(true);
    // age = 1500; ttl 1000 → stale
    expect(await repo.isFresh(addr, 1_000, 2_500)).toBe(false);
  });

  it('isFresh returns false when no cache entry exists', async () => {
    expect(await repo.isFresh(addr, 10_000, 0)).toBe(false);
  });
});
