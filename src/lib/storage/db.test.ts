import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HyperJournalDb } from './db';

describe('HyperJournalDb (v4)', () => {
  let db: HyperJournalDb;

  beforeEach(async () => {
    db = new HyperJournalDb(`db-test-${Math.random().toString(36).slice(2)}`);
    await db.open();
  });

  afterEach(async () => {
    db.close();
  });

  it('exposes the images table', () => {
    expect(db.images).toBeDefined();
  });

  it('round-trips a JournalImage row', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    await db.images.put({
      id: 'img-1',
      blob,
      mime: 'image/png',
      width: 10,
      height: 20,
      bytes: 3,
      createdAt: 0,
      provenance: 'observed',
    });
    const got = await db.images.get('img-1');
    expect(got).toBeDefined();
    expect(got?.mime).toBe('image/png');
    expect(got?.width).toBe(10);
    expect(got?.bytes).toBe(3);
    // jsdom's Blob loses its size field through fake-indexeddb's structured
    // clone. Real browser IndexedDB preserves it; the bytes field on the
    // entity is our reliable size source. Verify the blob exists.
    expect(got?.blob).toBeDefined();
  });
});
