import type { JournalEntry } from '@entities/journal-entry';
import type { HyperJournalDb } from './db';

export type JournalEntriesRepo = {
  findByTradeId(tradeId: string): Promise<JournalEntry | null>;
  upsert(entry: JournalEntry): Promise<void>;
  remove(id: string): Promise<void>;
  listAll(): Promise<ReadonlyArray<JournalEntry>>;
  listAllTradeIds(): Promise<Set<string>>;
};

/**
 * Repository for journal entries. Session 7a only uses the trade scope
 * (one entry per tradeId); findByTradeId filters on the indexed column
 * and returns the first match. Multi-scope queries will grow this repo
 * in Sessions 7b+.
 */
export function createJournalEntriesRepo(db: HyperJournalDb): JournalEntriesRepo {
  return {
    async findByTradeId(tradeId) {
      const entry = await db.journalEntries.where('tradeId').equals(tradeId).first();
      return entry ?? null;
    },
    async upsert(entry) {
      await db.journalEntries.put(entry);
    },
    async remove(id) {
      await db.journalEntries.delete(id);
    },
    async listAll() {
      return db.journalEntries.toArray();
    },
    async listAllTradeIds() {
      const rows = await db.journalEntries.toArray();
      return new Set(rows.map((r) => r.tradeId));
    },
  };
}
