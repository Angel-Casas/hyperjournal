import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HyperJournalDb } from './db';
import { createExportRepo } from './export-repo';
import type { WalletAddress } from '@entities/wallet';

const ADDR = '0x0000000000000000000000000000000000000001' as WalletAddress;

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`export-repo-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

describe('createExportRepo', () => {
  it('readSnapshot returns empty tables when Dexie is fresh', async () => {
    const repo = createExportRepo(db);
    const snap = await repo.readSnapshot();
    expect(snap.wallets).toEqual([]);
    expect(snap.userSettings).toBeNull();
    expect(snap.fillsCache).toEqual([]);
  });

  it('readSnapshot returns all wallet rows', async () => {
    await db.wallets.put({ address: ADDR, label: null, addedAt: 1 });
    const repo = createExportRepo(db);
    const snap = await repo.readSnapshot();
    expect(snap.wallets).toHaveLength(1);
    expect(snap.wallets[0]!.address).toBe(ADDR);
  });

  it('readSnapshot returns the userSettings singleton when present', async () => {
    await db.userSettings.put({ key: 'singleton', lastSelectedAddress: ADDR });
    const repo = createExportRepo(db);
    const snap = await repo.readSnapshot();
    expect(snap.userSettings).toEqual({
      key: 'singleton',
      lastSelectedAddress: ADDR,
    });
  });

  it('readSnapshot returns all fillsCache rows', async () => {
    await db.fillsCache.put({ address: ADDR, fetchedAt: 42, fills: [] });
    const repo = createExportRepo(db);
    const snap = await repo.readSnapshot();
    expect(snap.fillsCache).toHaveLength(1);
    expect(snap.fillsCache[0]!.fetchedAt).toBe(42);
  });

  it('readSnapshot returns all journalEntries rows', async () => {
    const tradeEntry: import('@entities/journal-entry').TradeJournalEntry = {
      id: 'e1',
      scope: 'trade',
      tradeId: 'BTC-1',
      createdAt: 1,
      updatedAt: 1,
      preTradeThesis: 't',
      postTradeReview: '',
      lessonLearned: '',
      mood: null,
      planFollowed: null,
      stopLossUsed: null,
      strategyId: null,
      tags: [],
      provenance: 'observed',
    };
    await db.journalEntries.put(tradeEntry);
    const repo = createExportRepo(db);
    const snap = await repo.readSnapshot();
    expect(snap.journalEntries).toHaveLength(1);
    const first = snap.journalEntries[0]!;
    if (first.scope !== 'trade') throw new Error('expected trade entry');
    expect(first.preTradeThesis).toBe('t');
  });
});
