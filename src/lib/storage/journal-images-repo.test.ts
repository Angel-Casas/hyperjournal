import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HyperJournalDb } from './db';
import {
  createJournalImagesRepo,
  type JournalImagesRepo,
} from './journal-images-repo';
import type { JournalImage } from '@entities/journal-image';

let db: HyperJournalDb;
let repo: JournalImagesRepo;

beforeEach(async () => {
  db = new HyperJournalDb(`images-repo-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
  repo = createJournalImagesRepo(db);
});

afterEach(async () => {
  db.close();
});

function makeImage(overrides: Partial<JournalImage> = {}): JournalImage {
  return {
    id: 'img-1',
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    mime: 'image/png',
    width: 10,
    height: 10,
    bytes: 3,
    createdAt: 100,
    provenance: 'observed',
    ...overrides,
  };
}

describe('JournalImagesRepo', () => {
  it('create + getById round-trips', async () => {
    await repo.create(makeImage());
    const got = await repo.getById('img-1');
    expect(got?.id).toBe('img-1');
    expect(got?.mime).toBe('image/png');
    // bytes is the reliable size field; jsdom's blob.size drops through
    // fake-indexeddb's structured clone (real browsers preserve it).
    expect(got?.bytes).toBe(3);
  });

  it('getById returns null for a missing id', async () => {
    expect(await repo.getById('nope')).toBeNull();
  });

  it('getMany preserves input order and filters missing', async () => {
    await repo.create(makeImage({ id: 'a' }));
    await repo.create(makeImage({ id: 'b' }));
    const got = await repo.getMany(['b', 'missing', 'a']);
    expect(got.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('remove deletes the row', async () => {
    await repo.create(makeImage());
    await repo.remove('img-1');
    expect(await repo.getById('img-1')).toBeNull();
  });

  it('removeMany deletes a list of rows', async () => {
    await repo.create(makeImage({ id: 'a' }));
    await repo.create(makeImage({ id: 'b' }));
    await repo.create(makeImage({ id: 'c' }));
    await repo.removeMany(['a', 'c']);
    const remaining = (await repo.listAll()).map((i) => i.id).sort();
    expect(remaining).toEqual(['b']);
  });

  it('listAll returns every row', async () => {
    await repo.create(makeImage({ id: 'a' }));
    await repo.create(makeImage({ id: 'b', createdAt: 50 }));
    expect((await repo.listAll()).length).toBe(2);
  });
});
