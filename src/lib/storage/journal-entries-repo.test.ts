import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HyperJournalDb } from './db';
import { createJournalEntriesRepo } from './journal-entries-repo';
import type { JournalEntry } from '@entities/journal-entry';

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`journal-repo-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'entry-1',
    scope: 'trade',
    tradeId: 'BTC-1',
    createdAt: 100,
    updatedAt: 100,
    preTradeThesis: '',
    postTradeReview: '',
    lessonLearned: '',
    mood: null,
    planFollowed: null,
    stopLossUsed: null,
    provenance: 'observed',
    ...overrides,
  };
}

describe('createJournalEntriesRepo', () => {
  it('findByTradeId returns null when no entry exists', async () => {
    const repo = createJournalEntriesRepo(db);
    expect(await repo.findByTradeId('BTC-1')).toBeNull();
  });

  it('findByTradeId returns the entry when one exists', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeEntry({ tradeId: 'BTC-1', preTradeThesis: 'thesis' }));
    const found = await repo.findByTradeId('BTC-1');
    expect(found?.preTradeThesis).toBe('thesis');
  });

  it('upsert overwrites by id', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeEntry({ id: 'e1', preTradeThesis: 'old' }));
    await repo.upsert(makeEntry({ id: 'e1', preTradeThesis: 'new', updatedAt: 200 }));
    const all = await repo.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.preTradeThesis).toBe('new');
    expect(all[0]!.updatedAt).toBe(200);
  });

  it('remove deletes the entry by id', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeEntry({ id: 'e1' }));
    await repo.remove('e1');
    expect(await repo.listAll()).toEqual([]);
  });

  it('listAll returns every entry', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeEntry({ id: 'e1', tradeId: 'BTC-1' }));
    await repo.upsert(makeEntry({ id: 'e2', tradeId: 'ETH-1' }));
    const all = await repo.listAll();
    expect(all).toHaveLength(2);
  });

  it('listAllTradeIds returns a deduplicated set of tradeIds', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeEntry({ id: 'e1', tradeId: 'BTC-1' }));
    await repo.upsert(makeEntry({ id: 'e2', tradeId: 'ETH-1' }));
    const ids = await repo.listAllTradeIds();
    expect(ids).toBeInstanceOf(Set);
    expect(ids.has('BTC-1')).toBe(true);
    expect(ids.has('ETH-1')).toBe(true);
    expect(ids.size).toBe(2);
  });
});
