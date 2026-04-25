import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HyperJournalDb } from './db';
import { createImportRepo } from './import-repo';
import type { MergeResult } from '@entities/export';
import type { WalletAddress } from '@entities/wallet';

const A = '0x000000000000000000000000000000000000000A' as WalletAddress;
const B = '0x000000000000000000000000000000000000000B' as WalletAddress;

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`import-repo-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

const emptyResult: MergeResult = {
  walletsToUpsert: [],
  userSettingsToOverwrite: null,
  fillsCacheToUpsert: [],
  journalEntriesToUpsert: [],
  imagesToUpsert: [],
  summary: {
    walletsAdded: 0,
    walletsUpdated: 0,
    userSettingsOverwritten: false,
    fillsCacheEntries: 0,
    journalEntriesImported: 0,
    imagesAdded: 0,
    imagesUpdated: 0,
  },
};

describe('createImportRepo', () => {
  it('applyMerge with an empty result is a no-op', async () => {
    const repo = createImportRepo(db);
    await repo.applyMerge(emptyResult);
    expect(await db.wallets.count()).toBe(0);
  });

  it('applyMerge upserts wallets, incoming wins on conflict', async () => {
    await db.wallets.put({ address: A, label: 'old', addedAt: 1 });
    const repo = createImportRepo(db);
    await repo.applyMerge({
      ...emptyResult,
      walletsToUpsert: [
        { address: A, label: 'new', addedAt: 2 },
        { address: B, label: null, addedAt: 3 },
      ],
    });
    const all = await db.wallets.toArray();
    expect(all).toHaveLength(2);
    const byAddr = Object.fromEntries(all.map((w) => [w.address, w]));
    expect(byAddr[A]!.label).toBe('new');
    expect(byAddr[A]!.addedAt).toBe(2);
    expect(byAddr[B]!.label).toBeNull();
  });

  it('applyMerge overwrites userSettings when non-null', async () => {
    const repo = createImportRepo(db);
    await repo.applyMerge({
      ...emptyResult,
      userSettingsToOverwrite: { key: 'singleton', lastSelectedAddress: A },
    });
    expect(await db.userSettings.get('singleton')).toEqual({
      key: 'singleton',
      lastSelectedAddress: A,
    });
  });

  it('applyMerge does NOT touch userSettings when the overwrite is null', async () => {
    await db.userSettings.put({ key: 'singleton', lastSelectedAddress: A });
    const repo = createImportRepo(db);
    await repo.applyMerge(emptyResult);
    expect(await db.userSettings.get('singleton')).toEqual({
      key: 'singleton',
      lastSelectedAddress: A,
    });
  });

  it('applyMerge upserts fillsCache entries', async () => {
    const repo = createImportRepo(db);
    await repo.applyMerge({
      ...emptyResult,
      fillsCacheToUpsert: [{ address: A, fetchedAt: 42, fills: [] }],
    });
    const row = await db.fillsCache.get(A);
    expect(row?.fetchedAt).toBe(42);
  });

  it('applyMerge upserts journalEntries', async () => {
    const repo = createImportRepo(db);
    await repo.applyMerge({
      ...emptyResult,
      journalEntriesToUpsert: [
        {
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
          imageIds: [],
          provenance: 'observed',
        },
      ],
    });
    const row = await db.journalEntries.get('e1');
    if (!row || row.scope !== 'trade') throw new Error('expected trade entry');
    expect(row.preTradeThesis).toBe('t');
  });
});
