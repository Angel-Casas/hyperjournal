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
    const first = out.data.journalEntries![0]!;
    if (first.scope !== 'trade') throw new Error('expected trade entry');
    expect(first.mood).toBe('calm');
  });

  it('parses a file with a session journalEntries row', () => {
    const out = ExportFileSchema.parse({
      ...validFile,
      data: {
        ...validFile.data,
        journalEntries: [
          {
            id: 's1',
            scope: 'session',
            date: '2026-04-22',
            createdAt: 1,
            updatedAt: 1,
            marketConditions: '',
            summary: 's',
            whatToRepeat: '',
            whatToAvoid: '',
            mindset: 'focused',
            disciplineScore: 4,
            provenance: 'observed',
          },
        ],
      },
    });
    expect(out.data.journalEntries).toHaveLength(1);
    expect(out.data.journalEntries![0]!.scope).toBe('session');
  });

  it('rejects a session entry missing the date field', () => {
    expect(() =>
      ExportFileSchema.parse({
        ...validFile,
        data: {
          ...validFile.data,
          journalEntries: [
            {
              id: 's1',
              scope: 'session',
              createdAt: 1,
              updatedAt: 1,
              marketConditions: '',
              summary: '',
              whatToRepeat: '',
              whatToAvoid: '',
              mindset: null,
              disciplineScore: null,
              provenance: 'observed',
            },
          ],
        },
      }),
    ).toThrow();
  });

  it('rejects a disciplineScore of 6 (out of 1-5 range)', () => {
    expect(() =>
      ExportFileSchema.parse({
        ...validFile,
        data: {
          ...validFile.data,
          journalEntries: [
            {
              id: 's1',
              scope: 'session',
              date: '2026-04-22',
              createdAt: 1,
              updatedAt: 1,
              marketConditions: '',
              summary: '',
              whatToRepeat: '',
              whatToAvoid: '',
              mindset: null,
              disciplineScore: 6,
              provenance: 'observed',
            },
          ],
        },
      }),
    ).toThrow();
  });

  it('parses a file with a strategy journalEntries row', () => {
    const out = ExportFileSchema.parse({
      ...validFile,
      data: {
        ...validFile.data,
        journalEntries: [
          {
            id: 'strat-1',
            scope: 'strategy',
            createdAt: 1,
            updatedAt: 1,
            name: 'Breakout',
            conditions: 'clear resistance break',
            invalidation: '',
            idealRR: '2:1',
            examples: '',
            recurringMistakes: '',
            notes: '',
            provenance: 'observed',
          },
        ],
      },
    });
    expect(out.data.journalEntries).toHaveLength(1);
    expect(out.data.journalEntries![0]!.scope).toBe('strategy');
  });

  it('rejects a strategy entry missing the name field', () => {
    expect(() =>
      ExportFileSchema.parse({
        ...validFile,
        data: {
          ...validFile.data,
          journalEntries: [
            {
              id: 'strat-1',
              scope: 'strategy',
              createdAt: 1,
              updatedAt: 1,
              // no name
              conditions: '',
              invalidation: '',
              idealRR: '',
              examples: '',
              recurringMistakes: '',
              notes: '',
              provenance: 'observed',
            },
          ],
        },
      }),
    ).toThrow();
  });

  it('parses a trade entry with strategyId set to a string', () => {
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
            preTradeThesis: '',
            postTradeReview: '',
            lessonLearned: '',
            mood: null,
            planFollowed: null,
            stopLossUsed: null,
            strategyId: 'strat-uuid-abc',
            provenance: 'observed',
          },
        ],
      },
    });
    const first = out.data.journalEntries![0]!;
    if (first.scope !== 'trade') throw new Error('expected trade');
    expect(first.strategyId).toBe('strat-uuid-abc');
  });

  it('parses a trade entry with strategyId explicitly null', () => {
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
            preTradeThesis: '',
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
    });
    const first = out.data.journalEntries![0]!;
    if (first.scope !== 'trade') throw new Error('expected trade');
    expect(first.strategyId).toBeNull();
  });

  it('defaults strategyId to null when the field is missing (pre-7d export)', () => {
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
            preTradeThesis: '',
            postTradeReview: '',
            lessonLearned: '',
            mood: null,
            planFollowed: null,
            stopLossUsed: null,
            // no strategyId — pre-7d export shape
            provenance: 'observed',
          },
        ],
      },
    });
    const first = out.data.journalEntries![0]!;
    if (first.scope !== 'trade') throw new Error('expected trade');
    expect(first.strategyId).toBeNull();
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
