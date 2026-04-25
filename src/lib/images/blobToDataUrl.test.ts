import { describe, expect, it } from 'vitest';
import { blobToDataUrl } from './blobToDataUrl';
import { dataUrlToBlob } from './dataUrlToBlob';

describe('blobToDataUrl', () => {
  it('encodes a PNG blob to a base64 data URL', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
    const url = await blobToDataUrl(blob);
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('round-trips through dataUrlToBlob preserving bytes and MIME', async () => {
    const original = new Blob([new Uint8Array([10, 20, 30, 40, 50])], {
      type: 'image/jpeg',
    });
    const url = await blobToDataUrl(original);
    const restored = dataUrlToBlob(url);
    expect(restored.type).toBe('image/jpeg');
    expect(restored.size).toBe(original.size);
    // Re-encode the restored blob; identical dataUrl proves byte-for-byte
    // identity without leaning on jsdom's missing Blob.arrayBuffer().
    const reEncoded = await blobToDataUrl(restored);
    expect(reEncoded).toBe(url);
  });
});
