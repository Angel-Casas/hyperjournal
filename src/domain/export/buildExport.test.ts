import { describe, it, expect } from 'vitest';
import { buildExport } from './buildExport';
import type { ExportSnapshot } from '@entities/export';
import type { WalletAddress } from '@entities/wallet';

const ADDR = '0x0000000000000000000000000000000000000001' as WalletAddress;

const baseSnapshot: ExportSnapshot = {
  wallets: [{ address: ADDR, label: null, addedAt: 100 }],
  userSettings: { key: 'singleton', lastSelectedAddress: ADDR },
  fillsCache: [{ address: ADDR, fetchedAt: 200, fills: [] }],
  journalEntries: [],
};

describe('buildExport', () => {
  it('returns a file with the expected envelope fields', () => {
    const file = buildExport(baseSnapshot, { includeCache: false, now: 1714000000000 });
    expect(file.app).toBe('HyperJournal');
    expect(file.formatVersion).toBe(1);
    expect(file.exportedAt).toBe(1714000000000);
  });

  it('always includes wallets and userSettings in data', () => {
    const file = buildExport(baseSnapshot, { includeCache: false, now: 0 });
    expect(file.data.wallets).toHaveLength(1);
    expect(file.data.userSettings).toEqual({
      key: 'singleton',
      lastSelectedAddress: ADDR,
    });
  });

  it('omits fillsCache entirely when includeCache is false', () => {
    const file = buildExport(baseSnapshot, { includeCache: false, now: 0 });
    expect(file.data.fillsCache).toBeUndefined();
    expect('fillsCache' in file.data).toBe(false);
  });

  it('includes fillsCache when includeCache is true', () => {
    const file = buildExport(baseSnapshot, { includeCache: true, now: 0 });
    expect(file.data.fillsCache).toHaveLength(1);
  });

  it('emits userSettings: null when the snapshot has none', () => {
    const snap: ExportSnapshot = { ...baseSnapshot, userSettings: null };
    const file = buildExport(snap, { includeCache: false, now: 0 });
    expect(file.data.userSettings).toBeNull();
  });

  it('is deterministic for the same input', () => {
    const a = buildExport(baseSnapshot, { includeCache: true, now: 100 });
    const b = buildExport(baseSnapshot, { includeCache: true, now: 100 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('does not mutate the input snapshot', () => {
    const snap: ExportSnapshot = {
      wallets: [{ address: ADDR, label: null, addedAt: 100 }],
      userSettings: null,
      fillsCache: [],
      journalEntries: [],
    };
    const walletsBefore = snap.wallets;
    buildExport(snap, { includeCache: true, now: 0 });
    expect(snap.wallets).toBe(walletsBefore);
  });

  it('includes journalEntries unconditionally (both includeCache=true and =false)', () => {
    const snap: ExportSnapshot = {
      ...baseSnapshot,
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
    };
    expect(buildExport(snap, { includeCache: true, now: 0 }).data.journalEntries).toHaveLength(1);
    expect(buildExport(snap, { includeCache: false, now: 0 }).data.journalEntries).toHaveLength(1);
  });
});
