import { useJournalImage } from '../hooks/useJournalImage';
import type { HyperJournalDb } from '@lib/storage/db';
import { cn } from '@lib/ui/utils';

type Props = {
  imageIds: ReadonlyArray<string>;
  onRemove: (id: string) => void;
  db?: HyperJournalDb | undefined;
};

export function ImageGallery({ imageIds, onRemove, db }: Props) {
  if (imageIds.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Attached images">
      {imageIds.map((id) => (
        <li key={id}>
          <Thumbnail id={id} onRemove={onRemove} db={db} />
        </li>
      ))}
    </ul>
  );
}

type ThumbnailProps = {
  id: string;
  onRemove: (id: string) => void;
  db?: HyperJournalDb | undefined;
};

function Thumbnail({ id, onRemove, db }: ThumbnailProps) {
  const img = useJournalImage(id, db ? { db } : {});

  if (!img.isLoading && img.url === null) {
    return (
      <div
        className={cn(
          'relative flex h-24 w-32 items-center justify-center rounded-md border border-border bg-bg-overlay text-xs text-fg-muted',
        )}
      >
        image unavailable
        <button
          type="button"
          onClick={() => onRemove(id)}
          aria-label={`Remove image ${id}`}
          className="absolute right-1 top-1 rounded bg-bg-base/80 px-1 text-fg-muted hover:text-fg-base"
        >
          ✕
        </button>
      </div>
    );
  }

  if (!img.url) {
    return <div className="h-24 w-32 animate-pulse rounded-md bg-bg-overlay" />;
  }

  return (
    <div className="relative">
      <a
        href={img.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open image ${id} in a new tab`}
        className="block"
      >
        <img
          src={img.url}
          alt="Attached screenshot"
          className="h-24 w-32 rounded-md border border-border object-cover"
        />
      </a>
      <button
        type="button"
        onClick={() => onRemove(id)}
        aria-label={`Remove image ${id}`}
        className="absolute right-1 top-1 rounded bg-bg-base/80 px-1 text-fg-muted hover:text-fg-base"
      >
        ✕
      </button>
    </div>
  );
}
