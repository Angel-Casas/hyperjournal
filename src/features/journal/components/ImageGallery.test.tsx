import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { HyperJournalDb } from '@lib/storage/db';
import { ImageGallery } from './ImageGallery';
import type { JournalImage } from '@entities/journal-image';

let db: HyperJournalDb;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  db = new HyperJournalDb(`hj-gallery-${Math.random().toString(36).slice(2)}`);
  await db.open();
  // URL.createObjectURL / revokeObjectURL stubs live in src/tests/setup.ts.
});

afterEach(async () => {
  db.close();
});

function makeImage(id: string, overrides: Partial<JournalImage> = {}): JournalImage {
  return {
    id,
    blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
    mime: 'image/png',
    width: 100,
    height: 50,
    bytes: 1,
    createdAt: 0,
    provenance: 'observed',
    ...overrides,
  };
}

describe('ImageGallery', () => {
  it('renders one thumbnail per imageId', async () => {
    vi.spyOn(db.images, 'get').mockImplementation((async (id: string) => {
      if (id === 'a' || id === 'b') return makeImage(id);
      return undefined;
    }) as unknown as typeof db.images.get);
    render(
      <ImageGallery imageIds={['a', 'b']} onRemove={vi.fn()} db={db} />,
      { wrapper },
    );
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
  });

  it('opens each thumbnail in a new tab via target="_blank"', async () => {
    vi.spyOn(db.images, 'get').mockResolvedValue(makeImage('a'));
    render(<ImageGallery imageIds={['a']} onRemove={vi.fn()} db={db} />, { wrapper });
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
    const link = screen.getByRole('link', { name: /open image/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('href', 'blob:stub');
  });

  it('calls onRemove when the X button is clicked', async () => {
    vi.spyOn(db.images, 'get').mockResolvedValue(makeImage('a'));
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<ImageGallery imageIds={['a']} onRemove={onRemove} db={db} />, { wrapper });
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /remove image/i }));
    expect(onRemove).toHaveBeenCalledWith('a');
  });

  it('renders a placeholder for a missing image', async () => {
    render(
      <ImageGallery imageIds={['nope']} onRemove={vi.fn()} db={db} />,
      { wrapper },
    );
    await waitFor(() =>
      expect(screen.getByText(/image unavailable/i)).toBeInTheDocument(),
    );
  });

  it('returns null when imageIds is empty', () => {
    const { container } = render(
      <ImageGallery imageIds={[]} onRemove={vi.fn()} db={db} />,
      { wrapper },
    );
    expect(container.firstChild).toBeNull();
  });
});
