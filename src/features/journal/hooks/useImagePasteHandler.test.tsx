import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { renderHook } from '@testing-library/react';
import { useImagePasteHandler } from './useImagePasteHandler';

function makeClipboardEvent(items: Array<File | string>): Event {
  // jsdom's ClipboardEvent constructor doesn't support clipboardData fully,
  // so we hand-build an Event and attach a fake clipboardData.
  const event = new Event('paste', { bubbles: true, cancelable: true });
  const dtItems = items.map((item): {
    kind: 'file' | 'string';
    type: string;
    getAsFile: () => File | null;
  } => {
    if (item instanceof File) {
      return {
        kind: 'file',
        type: item.type,
        getAsFile: (): File | null => item,
      };
    }
    return {
      kind: 'string',
      type: 'text/plain',
      getAsFile: (): File | null => null,
    };
  });
  Object.defineProperty(event, 'clipboardData', {
    value: { items: dtItems },
  });
  return event;
}

function setupHandler(onPaste: (file: File) => void) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const Harness = () => {
    const ref = useRef<HTMLDivElement | null>(root);
    useImagePasteHandler(ref, onPaste);
    return null;
  };
  renderHook(() => Harness());
  return root;
}

describe('useImagePasteHandler', () => {
  it('consumes image paste with preventDefault and calls onPaste', () => {
    const onPaste = vi.fn();
    const root = setupHandler(onPaste);

    const file = new File([new Uint8Array([1])], 's.png', { type: 'image/png' });
    const event = makeClipboardEvent([file]);
    root.dispatchEvent(event);

    expect(onPaste).toHaveBeenCalledTimes(1);
    expect((onPaste.mock.calls[0]![0] as File).name).toBe('s.png');
    expect(event.defaultPrevented).toBe(true);
  });

  it('lets text paste fall through (no preventDefault)', () => {
    const onPaste = vi.fn();
    const root = setupHandler(onPaste);

    const event = makeClipboardEvent(['hello']);
    root.dispatchEvent(event);

    expect(onPaste).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('fans out across multiple image items in a single paste', () => {
    const onPaste = vi.fn();
    const root = setupHandler(onPaste);

    const a = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
    const b = new File([new Uint8Array([2])], 'b.png', { type: 'image/png' });
    root.dispatchEvent(makeClipboardEvent([a, b]));

    expect(onPaste).toHaveBeenCalledTimes(2);
  });
});
