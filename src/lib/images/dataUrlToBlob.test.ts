import { describe, expect, it } from 'vitest';
import { dataUrlToBlob } from './dataUrlToBlob';

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=';

describe('dataUrlToBlob', () => {
  it('decodes a valid PNG data URL into a Blob', () => {
    const blob = dataUrlToBlob(TINY_PNG_DATA_URL);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('throws on a missing "data:" prefix', () => {
    expect(() => dataUrlToBlob('not-a-data-url')).toThrow(/malformed/i);
  });

  it('throws on a missing ";base64," marker', () => {
    expect(() => dataUrlToBlob('data:image/png,xxxxx')).toThrow(/malformed/i);
  });

  it('throws on an unknown MIME', () => {
    expect(() => dataUrlToBlob('data:image/heic;base64,AAAA')).toThrow(/mime/i);
  });
});
