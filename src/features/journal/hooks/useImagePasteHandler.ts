import { useEffect, type RefObject } from 'react';

/**
 * Attaches a paste listener to `ref.current`. When the clipboard
 * contains one or more image files, calls `onPaste(file)` for each and
 * preventDefault's the event. Text-only paste falls through to the
 * native textarea behavior. Mixed clipboard (text + image) consumes the
 * image and discards the text portion — matches user intent
 * ("I copied a screenshot").
 */
export function useImagePasteHandler<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onPaste: (file: File) => void,
): void {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const handler = (event: Event) => {
      const ce = event as ClipboardEvent;
      const items = ce.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length === 0) return;
      ce.preventDefault();
      ce.stopPropagation();
      for (const f of files) onPaste(f);
    };
    node.addEventListener('paste', handler);
    return () => {
      node.removeEventListener('paste', handler);
    };
  }, [ref, onPaste]);
}
