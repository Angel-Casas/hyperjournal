import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { HyperJournalDb } from '@lib/storage/db';
import { useJournalImage } from './useJournalImage';
import type { JournalImage } from '@entities/journal-image';

let db: HyperJournalDb;

const createObjectURLSpy = vi.fn((_blob: Blob) => `blob:fake-${Math.random()}`);
const revokeObjectURLSpy = vi.fn();

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  db = new HyperJournalDb(`hj-img-hook-${Math.random().toString(36).slice(2)}`);
  await db.open();
  createObjectURLSpy.mockClear();
  revokeObjectURLSpy.mockClear();
  Object.defineProperty(URL, 'createObjectURL', {
    value: createObjectURLSpy,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: revokeObjectURLSpy,
    writable: true,
    configurable: true,
  });
});

afterEach(async () => {
  db.close();
});

function makeImage(overrides: Partial<JournalImage> = {}): JournalImage {
  return {
    id: 'img-1',
    blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
    mime: 'image/png',
    width: 10,
    height: 20,
    bytes: 1,
    createdAt: 0,
    provenance: 'observed',
    ...overrides,
  };
}

describe('useJournalImage', () => {
  it('resolves to a blob URL for an existing image', async () => {
    // Spy on db.images.get to return a real Blob (jsdom + fake-indexeddb
    // strips Blob fidelity on retrieval; the hook needs a real blob).
    vi.spyOn(db.images, 'get').mockResolvedValue(makeImage());

    const { result } = renderHook(() => useJournalImage('img-1', { db }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.url).not.toBeNull());
    expect(result.current.url).toMatch(/^blob:fake-/);
    expect(result.current.width).toBe(10);
    expect(result.current.mime).toBe('image/png');
  });

  it('returns null url when the image is missing', async () => {
    const { result } = renderHook(() => useJournalImage('nope', { db }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.url).toBeNull();
  });

  it('revokes the blob URL on unmount', async () => {
    vi.spyOn(db.images, 'get').mockResolvedValue(makeImage());

    const { result, unmount } = renderHook(() => useJournalImage('img-1', { db }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.url).not.toBeNull());
    const url = result.current.url;
    unmount();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith(url);
  });
});
