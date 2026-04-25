import type { JournalImage } from '@entities/journal-image';
import type { HyperJournalDb } from './db';

export type JournalImagesRepo = {
  getById(id: string): Promise<JournalImage | null>;
  getMany(ids: ReadonlyArray<string>): Promise<ReadonlyArray<JournalImage>>;
  create(image: JournalImage): Promise<void>;
  remove(id: string): Promise<void>;
  removeMany(ids: ReadonlyArray<string>): Promise<void>;
  listAll(): Promise<ReadonlyArray<JournalImage>>;
};

/**
 * Repository for journal-attached images. All methods are thin wrappers
 * over `db.images.<op>(...)` so they auto-join an outer Dexie transaction
 * when one is open (used by entry hooks for atomic add/remove + entry
 * upsert; see ADR-0008 / spec §3.1).
 */
export function createJournalImagesRepo(db: HyperJournalDb): JournalImagesRepo {
  return {
    async getById(id) {
      const row = await db.images.get(id);
      return row ?? null;
    },
    async getMany(ids) {
      if (ids.length === 0) return [];
      const rows = await db.images.bulkGet([...ids]);
      return rows.filter((r): r is JournalImage => r !== undefined);
    },
    async create(image) {
      await db.images.put(image);
    },
    async remove(id) {
      await db.images.delete(id);
    },
    async removeMany(ids) {
      if (ids.length === 0) return;
      await db.images.bulkDelete([...ids]);
    },
    async listAll() {
      return db.images.toArray();
    },
  };
}
