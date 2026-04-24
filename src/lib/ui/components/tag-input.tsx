import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { normalizeTag } from '@lib/tags/normalizeTag';
import { cn } from '@lib/ui/utils';

type Props = {
  id: string;
  value: ReadonlyArray<string>;
  onChange: (tags: ReadonlyArray<string>) => void;
  onBlur?: () => void;
  suggestions: ReadonlyArray<string>;
  placeholder?: string;
  maxLength?: number;
};

const MAX_SUGGESTIONS = 8;

export function TagInput({
  id,
  value,
  onChange,
  onBlur,
  suggestions,
  placeholder,
  maxLength = 40,
}: Props) {
  const [inputText, setInputText] = useState('');
  const [highlighted, setHighlighted] = useState(-1);
  const listboxId = `${id}-listbox`;
  const inputRef = useRef<HTMLInputElement | null>(null);

  const visible = useMemo(() => {
    const q = normalizeTag(inputText);
    if (q === '') return [] as ReadonlyArray<string>;
    return suggestions
      .filter((s) => s.startsWith(q) && !value.includes(s))
      .slice(0, MAX_SUGGESTIONS);
  }, [inputText, suggestions, value]);

  const open = visible.length > 0;

  function commit(rawText: string) {
    const normalized = normalizeTag(rawText).slice(0, maxLength);
    if (normalized !== '' && !value.includes(normalized)) {
      onChange([...value, normalized]);
    }
    setInputText('');
    setHighlighted(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0 && highlighted < visible.length) {
        commit(visible[highlighted]!);
      } else {
        commit(inputText);
      }
      return;
    }
    if (e.key === ',') {
      e.preventDefault();
      commit(inputText);
      return;
    }
    if (e.key === 'Backspace' && inputText === '' && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (visible.length === 0) return;
      setHighlighted((h) => Math.min(visible.length - 1, h + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(-1, h - 1));
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setInputText('');
      setHighlighted(-1);
      return;
    }
  }

  function handleBlur() {
    commit(inputText);
    onBlur?.();
  }

  function removeAt(idx: number) {
    const next = [...value];
    next.splice(idx, 1);
    onChange(next);
    inputRef.current?.focus();
  }

  return (
    <div className="relative">
      <div
        className={cn(
          'flex min-h-[2.5rem] flex-wrap items-center gap-1 rounded-md border border-border bg-bg-overlay px-2 py-1',
          'ring-offset-bg-base focus-within:outline-none focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2',
        )}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        {value.map((tag, idx) => (
          <span
            key={`${tag}-${idx}`}
            className="flex items-center gap-1 rounded-full border border-border bg-bg-raised px-2 py-0.5 text-xs text-fg-base"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove tag: ${tag}`}
              onClick={() => removeAt(idx)}
              className="rounded text-fg-muted hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            highlighted >= 0 ? `${listboxId}-opt-${highlighted}` : undefined
          }
          type="text"
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            setHighlighted(-1);
          }}
          onKeyDown={onKeyDown}
          onBlur={handleBlur}
          placeholder={value.length === 0 ? placeholder : undefined}
          maxLength={maxLength}
          className="flex-1 min-w-[8rem] bg-transparent text-sm text-fg-base outline-none placeholder:text-fg-subtle"
        />
      </div>
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-bg-raised shadow-sm"
        >
          {visible.map((s, idx) => (
            <li
              key={s}
              id={`${listboxId}-opt-${idx}`}
              role="option"
              aria-selected={idx === highlighted}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(s);
                inputRef.current?.focus();
              }}
              className={cn(
                'cursor-pointer px-3 py-1 text-sm text-fg-base',
                idx === highlighted ? 'bg-bg-overlay' : 'hover:bg-bg-overlay/60',
              )}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
