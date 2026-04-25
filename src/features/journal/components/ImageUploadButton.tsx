import { useRef, type ChangeEvent } from 'react';
import { cn } from '@lib/ui/utils';

type Props = {
  onSelect: (file: File) => void;
  disabled: boolean;
};

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

export function ImageUploadButton({ onSelect, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files) return;
    for (const file of files) onSelect(file);
    // Reset so re-selecting the same file fires change again.
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <label
      className={cn(
        'inline-flex h-9 cursor-pointer select-none items-center gap-2 rounded-md border border-border bg-bg-overlay px-3 text-sm text-fg-base',
        'ring-offset-bg-base focus-within:outline-none focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      Add image
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={onChange}
        disabled={disabled}
        aria-label="Add image"
        className="sr-only"
      />
    </label>
  );
}
