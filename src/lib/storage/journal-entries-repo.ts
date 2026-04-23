import type {
  JournalEntry,
  SessionJournalEntry,
  StrategyJournalEntry,
  TradeJournalEntry,
} from '@entities/journal-entry';
import type { HyperJournalDb } from './db';

export type JournalEntriesRepo = {
  findByTradeId(tradeId: string): Promise<TradeJournalEntry | null>;
  findByDate(date: string): Promise<SessionJournalEntry | null>;
  findStrategyById(id: string): Promise<StrategyJournalEntry | null>;
  upsert(entry: JournalEntry): Promise<void>;
  remove(id: string): Promise<void>;
  listAll(): Promise<ReadonlyArray<JournalEntry>>;
  listAllTradeIds(): Promise<Set<string>>;
  listSessionEntries(limit?: number): Promise<ReadonlyArray<SessionJournalEntry>>;
  listStrategies(limit?: number): Promise<ReadonlyArray<StrategyJournalEntry>>;
};

/**
 * Repository for journal entries. Session 7a added trade-scope lookups;
 * 7b adds session-scope (findByDate + listSessionEntries); 7c adds
 * strategy-scope (findStrategyById + listStrategies). Return types
 * narrow to the specific variant so callers don't need their own type
 * guards.
 */
export function createJournalEntriesRepo(db: HyperJournalDb): JournalEntriesRepo {
  return {
    async findByTradeId(tradeId) {
      const entry = await db.journalEntries
        .where('tradeId')
        .equals(tradeId)
        .first();
      if (!entry || entry.scope !== 'trade') return null;
      return entry;
    },
    async findByDate(date) {
      const entry = await db.journalEntries
        .where('date')
        .equals(date)
        .first();
      if (!entry || entry.scope !== 'session') return null;
      return entry;
    },
    async findStrategyById(id) {
      const entry = await db.journalEntries.get(id);
      if (!entry || entry.scope !== 'strategy') return null;
      return entry;
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
      const rows = await db.journalEntries
        .where('scope')
        .equals('trade')
        .toArray();
      // Narrowed: every row here is a TradeJournalEntry (scope filter).
      return new Set(rows.map((r) => (r as TradeJournalEntry).tradeId));
    },
    async listSessionEntries(limit = 7) {
      const rows = await db.journalEntries
        .where('scope')
        .equals('session')
        .toArray();
      // Narrowed: every row here is a SessionJournalEntry.
      const sessions = rows as SessionJournalEntry[];
      sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      return sessions.slice(0, limit);
    },
    async listStrategies(limit) {
      const rows = await db.journalEntries
        .where('scope')
        .equals('strategy')
        .toArray();
      // Narrowed: every row here is a StrategyJournalEntry.
      const strategies = rows as StrategyJournalEntry[];
      strategies.sort((a, b) => b.updatedAt - a.updatedAt);
      return limit === undefined ? strategies : strategies.slice(0, limit);
    },
  };
}
