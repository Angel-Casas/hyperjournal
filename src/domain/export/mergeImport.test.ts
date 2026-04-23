import { describe, it, expect } from 'vitest';
import { mergeImport } from './mergeImport';
import type { ExportFile, ExportSnapshot } from '@entities/export';
import type { WalletAddress } from '@entities/wallet';

const A = '0x000000000000000000000000000000000000000A' as WalletAddress;
const B = '0x000000000000000000000000000000000000000B' as WalletAddress;

const emptySnapshot: ExportSnapshot = {
  wallets: [],
  userSettings: null,
  fillsCache: [],
  journalEntries: [],
};

function makeFile(overrides: Partial<ExportFile['data']> = {}): ExportFile {
  return {
    app: 'HyperJournal',
    formatVersion: 1,
    exportedAt: 1714000000000,
    data: {
      wallets: [],
      userSettings: null,
      ...overrides,
    },
  };
}

describe('mergeImport', () => {
  it('adds new wallets when the existing state is empty', () => {
    const file = makeFile({
      wallets: [{ address: A, label: null, addedAt: 1 }],
    });
    const result = mergeImport(emptySnapshot, file);
    expect(result.walletsToUpsert).toHaveLength(1);
    expect(result.summary.walletsAdded).toBe(1);
    expect(result.summary.walletsUpdated).toBe(0);
  });

  it('upserts (incoming wins) when a wallet already exists by address', () => {
    const existing: ExportSnapshot = {
      wallets: [{ address: A, label: 'old', addedAt: 100 }],
      userSettings: null,
      fillsCache: [],
      journalEntries: [],
    };
    const file = makeFile({
      wallets: [{ address: A, label: 'new', addedAt: 200 }],
    });
    const result = mergeImport(existing, file);
    expect(result.walletsToUpsert).toEqual([{ address: A, label: 'new', addedAt: 200 }]);
    expect(result.summary.walletsAdded).toBe(0);
    expect(result.summary.walletsUpdated).toBe(1);
  });

  it('distinguishes added vs updated walletsToUpsert when mixed', () => {
    const existing: ExportSnapshot = {
      wallets: [{ address: A, label: 'old', addedAt: 100 }],
      userSettings: null,
      fillsCache: [],
      journalEntries: [],
    };
    const file = makeFile({
      wallets: [
        { address: A, label: 'new', addedAt: 200 },
        { address: B, label: null, addedAt: 300 },
      ],
    });
    const result = mergeImport(existing, file);
    expect(result.walletsToUpsert).toHaveLength(2);
    expect(result.summary.walletsAdded).toBe(1);
    expect(result.summary.walletsUpdated).toBe(1);
  });

  it('overwrites userSettings when the file carries one', () => {
    const file = makeFile({
      userSettings: { key: 'singleton', lastSelectedAddress: A },
    });
    const result = mergeImport(emptySnapshot, file);
    expect(result.userSettingsToOverwrite).toEqual({
      key: 'singleton',
      lastSelectedAddress: A,
    });
    expect(result.summary.userSettingsOverwritten).toBe(true);
  });

  it('does not overwrite userSettings when the file carries null', () => {
    const existing: ExportSnapshot = {
      wallets: [],
      userSettings: { key: 'singleton', lastSelectedAddress: A },
      fillsCache: [],
      journalEntries: [],
    };
    const file = makeFile({ userSettings: null });
    const result = mergeImport(existing, file);
    expect(result.userSettingsToOverwrite).toBeNull();
    expect(result.summary.userSettingsOverwritten).toBe(false);
  });

  it('upserts fillsCache entries when present in the file', () => {
    const file: ExportFile = {
      app: 'HyperJournal',
      formatVersion: 1,
      exportedAt: 0,
      data: {
        wallets: [],
        userSettings: null,
        fillsCache: [{ address: A, fetchedAt: 0, fills: [] }],
      },
    };
    const result = mergeImport(emptySnapshot, file);
    expect(result.fillsCacheToUpsert).toHaveLength(1);
    expect(result.summary.fillsCacheEntries).toBe(1);
  });

  it('emits an empty fillsCacheToUpsert when the file has no fillsCache key', () => {
    const file = makeFile(); // no fillsCache
    const result = mergeImport(emptySnapshot, file);
    expect(result.fillsCacheToUpsert).toEqual([]);
    expect(result.summary.fillsCacheEntries).toBe(0);
  });

  it('passes journalEntries through from the file', () => {
    const file: ExportFile = {
      app: 'HyperJournal',
      formatVersion: 1,
      exportedAt: 0,
      data: {
        wallets: [],
        userSettings: null,
        journalEntries: [
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
            provenance: 'observed',
          },
        ],
      },
    };
    const result = mergeImport(emptySnapshot, file);
    expect(result.journalEntriesToUpsert).toHaveLength(1);
    expect(result.summary.journalEntriesImported).toBe(1);
  });

  it('emits an empty journalEntriesToUpsert when the file has no journalEntries key', () => {
    const file = makeFile();
    const result = mergeImport(emptySnapshot, file);
    expect(result.journalEntriesToUpsert).toEqual([]);
    expect(result.summary.journalEntriesImported).toBe(0);
  });
});
