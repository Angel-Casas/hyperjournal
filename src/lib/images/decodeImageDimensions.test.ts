import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decodeImageDimensions } from './decodeImageDimensions';

const fakes: FakeImage[] = [];

class FakeImage {
  width = 0;
  height = 0;
  src = '';
  onload: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor() {
    fakes.push(this);
  }
  addEventListener(type: string, fn: () => void) {
    if (type === 'load') this.onload = fn;
    if (type === 'error') this.onerror = fn as () => void;
  }
  removeEventListener(): void {}
}

let originalImage: typeof Image;
let originalCIB: unknown;
let originalCreateObjectURL: typeof URL.createObjectURL | undefined;
let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined;

beforeEach(() => {
  fakes.length = 0;
  originalImage = globalThis.Image;
  originalCIB = (globalThis as Record<string, unknown>).createImageBitmap;
  // Force the Image() fallback path for deterministic jsdom tests.
  delete (globalThis as Record<string, unknown>).createImageBitmap;
  globalThis.Image = FakeImage as unknown as typeof Image;

  // jsdom lacks URL.createObjectURL; stub for this test (Session 7f T24
  // factors a shared stub into setup.ts, but that lands later in the plan).
  originalCreateObjectURL = URL.createObjectURL;
  originalRevokeObjectURL = URL.revokeObjectURL;
  Object.defineProperty(URL, 'createObjectURL', {
    value: () => 'blob:fake',
    writable: true,
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: () => {},
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  globalThis.Image = originalImage;
  if (originalCIB !== undefined) {
    (globalThis as Record<string, unknown>).createImageBitmap = originalCIB;
  }
  if (originalCreateObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', {
      value: originalCreateObjectURL,
      writable: true,
      configurable: true,
    });
  }
  if (originalRevokeObjectURL) {
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: originalRevokeObjectURL,
      writable: true,
      configurable: true,
    });
  }
});

describe('decodeImageDimensions', () => {
  it('returns width and height via the Image() fallback', async () => {
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
    const promise = decodeImageDimensions(blob);

    // Wait a tick for the Image to be constructed inside the helper.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const img = fakes[0]!;
    img.width = 640;
    img.height = 480;
    img.onload?.();

    await expect(promise).resolves.toEqual({ width: 640, height: 480 });
  });

  it('rejects when the Image() element errors', async () => {
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
    const promise = decodeImageDimensions(blob);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const img = fakes[0]!;
    img.onerror?.(new Event('error'));

    await expect(promise).rejects.toThrow(/decode/i);
  });
});
