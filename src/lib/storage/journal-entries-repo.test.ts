import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HyperJournalDb } from './db';
import { createJournalEntriesRepo } from './journal-entries-repo';
import type {
  JournalEntry,
  SessionJournalEntry,
  StrategyJournalEntry,
} from '@entities/journal-entry';

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`journal-repo-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

afterEach(async () => {
  db.close();
});

function makeTradeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
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
  } as JournalEntry;
}

function makeSessionEntry(overrides: Partial<SessionJournalEntry> = {}): JournalEntry {
  return {
    id: 'session-1',
    scope: 'session',
    date: '2026-04-22',
    createdAt: 100,
    updatedAt: 100,
    marketConditions: '',
    summary: '',
    whatToRepeat: '',
    whatToAvoid: '',
    mindset: null,
    disciplineScore: null,
    provenance: 'observed',
    ...overrides,
  } as JournalEntry;
}

function makeStrategyEntry(overrides: Partial<StrategyJournalEntry> = {}): JournalEntry {
  return {
    id: 'strat-1',
    scope: 'strategy',
    createdAt: 100,
    updatedAt: 100,
    name: '',
    conditions: '',
    invalidation: '',
    idealRR: '',
    examples: '',
    recurringMistakes: '',
    notes: '',
    provenance: 'observed',
    ...overrides,
  } as JournalEntry;
}

describe('createJournalEntriesRepo', () => {
  it('findByTradeId returns null when no entry exists', async () => {
    const repo = createJournalEntriesRepo(db);
    expect(await repo.findByTradeId('BTC-1')).toBeNull();
  });

  it('findByTradeId returns the entry when one exists', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeTradeEntry({ tradeId: 'BTC-1', preTradeThesis: 'thesis' }));
    const found = await repo.findByTradeId('BTC-1');
    expect(found?.preTradeThesis).toBe('thesis');
  });

  it('upsert overwrites by id', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeTradeEntry({ id: 'e1', preTradeThesis: 'old' }));
    await repo.upsert(makeTradeEntry({ id: 'e1', preTradeThesis: 'new', updatedAt: 200 }));
    const all = await repo.listAll();
    expect(all).toHaveLength(1);
    const first = all[0]!;
    if (first.scope !== 'trade') throw new Error('expected trade entry');
    expect(first.preTradeThesis).toBe('new');
    expect(first.updatedAt).toBe(200);
  });

  it('remove deletes the entry by id', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeTradeEntry({ id: 'e1' }));
    await repo.remove('e1');
    expect(await repo.listAll()).toEqual([]);
  });

  it('listAll returns every entry', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeTradeEntry({ id: 'e1', tradeId: 'BTC-1' }));
    await repo.upsert(makeTradeEntry({ id: 'e2', tradeId: 'ETH-1' }));
    const all = await repo.listAll();
    expect(all).toHaveLength(2);
  });

  it('listAllTradeIds returns a deduplicated set of tradeIds', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeTradeEntry({ id: 'e1', tradeId: 'BTC-1' }));
    await repo.upsert(makeTradeEntry({ id: 'e2', tradeId: 'ETH-1' }));
    const ids = await repo.listAllTradeIds();
    expect(ids).toBeInstanceOf(Set);
    expect(ids.has('BTC-1')).toBe(true);
    expect(ids.has('ETH-1')).toBe(true);
    expect(ids.size).toBe(2);
  });

  it('findByDate returns the session entry when one exists', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeSessionEntry({ date: '2026-04-22', summary: 's' }));
    const found = await repo.findByDate('2026-04-22');
    expect(found?.summary).toBe('s');
    expect(found?.scope).toBe('session');
  });

  it('findByDate returns null when the matching entry is a different scope', async () => {
    const repo = createJournalEntriesRepo(db);
    // A trade entry with a `date`-like tradeId should not match.
    await repo.upsert(makeTradeEntry({ tradeId: '2026-04-22' }));
    expect(await repo.findByDate('2026-04-22')).toBeNull();
  });

  it('listSessionEntries returns session-scope rows ordered by updatedAt desc', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeSessionEntry({ id: 'old', date: '2026-04-20', updatedAt: 100 }));
    await repo.upsert(makeSessionEntry({ id: 'new', date: '2026-04-22', updatedAt: 300 }));
    await repo.upsert(makeTradeEntry({ id: 'trade', updatedAt: 200 }));
    const result = await repo.listSessionEntries();
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('new');
    expect(result[1]!.id).toBe('old');
  });

  it('listSessionEntries respects the limit arg', async () => {
    const repo = createJournalEntriesRepo(db);
    for (let i = 0; i < 5; i++) {
      await repo.upsert(
        makeSessionEntry({
          id: `s${i}`,
          date: `2026-04-${String(22 - i).padStart(2, '0')}`,
          updatedAt: i,
        }),
      );
    }
    const result = await repo.listSessionEntries(3);
    expect(result).toHaveLength(3);
  });

  it('listAllTradeIds only returns trade-scope rows (session rows excluded)', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeTradeEntry({ id: 't1', tradeId: 'BTC-1' }));
    await repo.upsert(makeSessionEntry({ id: 's1', date: '2026-04-22' }));
    const ids = await repo.listAllTradeIds();
    expect(ids.has('BTC-1')).toBe(true);
    expect(ids.size).toBe(1);
  });

  it('findStrategyById returns the strategy entry when one exists', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeStrategyEntry({ id: 's1', name: 'Breakout' }));
    const found = await repo.findStrategyById('s1');
    expect(found?.name).toBe('Breakout');
    expect(found?.scope).toBe('strategy');
  });

  it('findStrategyById returns null when the id is a different scope', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeTradeEntry({ id: 'x' }));
    expect(await repo.findStrategyById('x')).toBeNull();
  });

  it('listStrategies returns strategy-scope rows ordered by updatedAt desc', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeStrategyEntry({ id: 'old', name: 'A', updatedAt: 100 }));
    await repo.upsert(makeStrategyEntry({ id: 'new', name: 'B', updatedAt: 300 }));
    await repo.upsert(makeSessionEntry({ id: 'sess', updatedAt: 200 }));
    const result = await repo.listStrategies();
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('new');
    expect(result[1]!.id).toBe('old');
  });

  it('listStrategies respects the limit arg', async () => {
    const repo = createJournalEntriesRepo(db);
    for (let i = 0; i < 4; i++) {
      await repo.upsert(
        makeStrategyEntry({ id: `s${i}`, name: `S${i}`, updatedAt: i }),
      );
    }
    expect(await repo.listStrategies(2)).toHaveLength(2);
  });

  it('listSessionEntries + listAllTradeIds do not leak strategy rows', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeStrategyEntry({ id: 's1', name: 'Breakout' }));
    expect(await repo.listSessionEntries()).toEqual([]);
    expect((await repo.listAllTradeIds()).size).toBe(0);
  });
});

describe('cascade delete (Session 7f)', () => {
  it('removes the entry and its imageIds in one transaction', async () => {
    const repo = createJournalEntriesRepo(db);
    await db.images.bulkPut([
      {
        id: 'img-a',
        blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
        mime: 'image/png',
        width: 1,
        height: 1,
        bytes: 1,
        createdAt: 0,
        provenance: 'observed',
      },
      {
        id: 'img-b',
        blob: new Blob([new Uint8Array([2])], { type: 'image/png' }),
        mime: 'image/png',
        width: 1,
        height: 1,
        bytes: 1,
        createdAt: 0,
        provenance: 'observed',
      },
    ]);

    await repo.upsert(makeTradeEntry({ id: 'e1', imageIds: ['img-a', 'img-b'] }));
    await repo.remove('e1');

    expect(await db.images.get('img-a')).toBeUndefined();
    expect(await db.images.get('img-b')).toBeUndefined();
    expect(await db.journalEntries.get('e1')).toBeUndefined();
  });

  it('does not throw when an imageId references a missing image row', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeTradeEntry({ id: 'e2', imageIds: ['missing'] }));
    await expect(repo.remove('e2')).resolves.toBeUndefined();
  });

  it('handles entries with empty imageIds array', async () => {
    const repo = createJournalEntriesRepo(db);
    await repo.upsert(makeTradeEntry({ id: 'e3', imageIds: [] }));
    await expect(repo.remove('e3')).resolves.toBeUndefined();
  });

  it('handles pre-7f entries lacking imageIds entirely', async () => {
    const repo = createJournalEntriesRepo(db);
    // makeTradeEntry doesn't include imageIds; the helper relies on `as JournalEntry`.
    await repo.upsert(makeTradeEntry({ id: 'e4' }));
    await expect(repo.remove('e4')).resolves.toBeUndefined();
  });
});
