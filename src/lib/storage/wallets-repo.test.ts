import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HyperJournalDb } from './db';
import { createWalletsRepo, type WalletsRepo } from './wallets-repo';
import type { WalletAddress } from '@entities/wallet';

let db: HyperJournalDb;
let repo: WalletsRepo;

const addrA = '0x000000000000000000000000000000000000000a' as WalletAddress;
const addrB = '0x000000000000000000000000000000000000000b' as WalletAddress;

beforeEach(async () => {
  db = new HyperJournalDb(`hj-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
  repo = createWalletsRepo(db);
});

afterEach(async () => {
  db.close();
});

describe('walletsRepo', () => {
  it('saves a new wallet and lists it', async () => {
    await repo.save({ address: addrA, label: 'Main', addedAt: 1000 });
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.address).toBe(addrA);
    expect(list[0]!.label).toBe('Main');
  });

  it('lists wallets sorted by addedAt descending (newest first)', async () => {
    await repo.save({ address: addrA, label: null, addedAt: 1000 });
    await repo.save({ address: addrB, label: null, addedAt: 2000 });
    const list = await repo.list();
    expect(list.map((w) => w.address)).toEqual([addrB, addrA]);
  });

  it('upserts an existing wallet when save is called with the same address', async () => {
    await repo.save({ address: addrA, label: 'Main', addedAt: 1000 });
    await repo.save({ address: addrA, label: 'Renamed', addedAt: 1000 });
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.label).toBe('Renamed');
  });

  it('findByAddress returns the wallet or null', async () => {
    await repo.save({ address: addrA, label: null, addedAt: 1000 });
    expect((await repo.findByAddress(addrA))?.address).toBe(addrA);
    expect(await repo.findByAddress(addrB)).toBeNull();
  });

  it('remove deletes a wallet', async () => {
    await repo.save({ address: addrA, label: null, addedAt: 1000 });
    await repo.save({ address: addrB, label: null, addedAt: 2000 });
    await repo.remove(addrA);
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.address).toBe(addrB);
  });

  it('remove on a non-existent address is a no-op (does not throw)', async () => {
    await expect(repo.remove(addrA)).resolves.toBeUndefined();
  });
});
