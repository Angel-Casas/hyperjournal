import { describe, expect, it } from 'vitest';
import { ALLOWED_MIMES, MAX_BYTES, validateImageBlob } from './validateImageBlob';

function makeBlob(size: number, type: string): Blob {
  return new Blob([new Uint8Array(size)], { type });
}

describe('validateImageBlob', () => {
  it('accepts each whitelisted MIME', () => {
    for (const mime of ALLOWED_MIMES) {
      expect(validateImageBlob(makeBlob(100, mime))).toEqual({ ok: true });
    }
  });

  it('rejects an unsupported MIME', () => {
    expect(validateImageBlob(makeBlob(100, 'image/heic'))).toEqual({
      ok: false,
      reason: 'wrong-mime',
    });
  });

  it('rejects a blob over MAX_BYTES', () => {
    expect(validateImageBlob(makeBlob(MAX_BYTES + 1, 'image/png'))).toEqual({
      ok: false,
      reason: 'too-big',
    });
  });

  it('accepts a blob exactly at MAX_BYTES', () => {
    expect(validateImageBlob(makeBlob(MAX_BYTES, 'image/png'))).toEqual({
      ok: true,
    });
  });

  it('rejects a zero-byte blob', () => {
    expect(validateImageBlob(makeBlob(0, 'image/png'))).toEqual({
      ok: false,
      reason: 'too-big',
    });
  });
});
