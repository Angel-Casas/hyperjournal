import { describe, it, expect } from 'vitest';
import { ExportFileSchema, parseExport } from './export';

const validFile = {
  app: 'HyperJournal',
  formatVersion: 1,
  exportedAt: 1714000000000,
  data: {
    wallets: [
      { address: '0x0000000000000000000000000000000000000001', label: null, addedAt: 1713000000000 },
    ],
    userSettings: null,
  },
};

describe('ExportFileSchema', () => {
  it('parses a minimal valid file (no fillsCache)', () => {
    const out = ExportFileSchema.parse(validFile);
    expect(out.data.wallets).toHaveLength(1);
    expect(out.data.fillsCache).toBeUndefined();
    expect(out.data.userSettings).toBeNull();
  });

  it('parses a file with userSettings singleton', () => {
    const out = ExportFileSchema.parse({
      ...validFile,
      data: {
        ...validFile.data,
        userSettings: { key: 'singleton', lastSelectedAddress: '0x0000000000000000000000000000000000000001' },
      },
    });
    expect(out.data.userSettings).toEqual({
      key: 'singleton',
      lastSelectedAddress: '0x0000000000000000000000000000000000000001',
    });
  });

  it('parses a file with fillsCache rows', () => {
    const out = ExportFileSchema.parse({
      ...validFile,
      data: {
        ...validFile.data,
        fillsCache: [
          { address: '0x0000000000000000000000000000000000000001', fetchedAt: 1714000000000, fills: [] },
        ],
      },
    });
    expect(out.data.fillsCache).toHaveLength(1);
  });

  it('rejects a file with app !== "HyperJournal"', () => {
    expect(() => ExportFileSchema.parse({ ...validFile, app: 'SomethingElse' })).toThrow();
  });

  it('rejects a file with formatVersion !== 1', () => {
    expect(() => ExportFileSchema.parse({ ...validFile, formatVersion: 2 })).toThrow();
  });

  it('rejects a file with missing required fields', () => {
    expect(() => ExportFileSchema.parse({})).toThrow();
  });

  it('rejects a wallets row with a non-hex address', () => {
    expect(() =>
      ExportFileSchema.parse({
        ...validFile,
        data: {
          ...validFile.data,
          wallets: [{ address: 'not-a-hex', label: null, addedAt: 1 }],
        },
      }),
    ).toThrow();
  });

  it('parses a file with journalEntries rows', () => {
    const out = ExportFileSchema.parse({
      ...validFile,
      data: {
        ...validFile.data,
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
            mood: 'calm',
            planFollowed: true,
            stopLossUsed: null,
            provenance: 'observed',
          },
        ],
      },
    });
    expect(out.data.journalEntries).toHaveLength(1);
    expect(out.data.journalEntries![0]!.mood).toBe('calm');
  });

  it('rejects a journalEntries row with an invalid scope', () => {
    expect(() =>
      ExportFileSchema.parse({
        ...validFile,
        data: {
          ...validFile.data,
          journalEntries: [
            {
              id: 'e1',
              scope: 'weird',
              tradeId: 'BTC-1',
              createdAt: 1,
              updatedAt: 1,
              preTradeThesis: '',
              postTradeReview: '',
              lessonLearned: '',
              mood: null,
              planFollowed: null,
              stopLossUsed: null,
              provenance: 'observed',
            },
          ],
        },
      }),
    ).toThrow();
  });
});

describe('parseExport', () => {
  it('returns the parsed file on valid input', () => {
    expect(parseExport(validFile).formatVersion).toBe(1);
  });

  it('throws ZodError on invalid input', () => {
    expect(() => parseExport({ nope: true })).toThrow();
  });
});
