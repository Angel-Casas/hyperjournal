import { useEffect, useMemo, useRef, useState } from 'react';
import { useStrategyEntry } from '../hooks/useStrategyEntry';
import { useAllTags } from '../hooks/useAllTags';
import { Input } from '@lib/ui/components/input';
import { Label } from '@lib/ui/components/label';
import { TagInput } from '@lib/ui/components/tag-input';
import { normalizeTagList } from '@lib/tags/normalizeTag';
import { cn } from '@lib/ui/utils';
import type { StrategyJournalEntry } from '@entities/journal-entry';
import type { HyperJournalDb } from '@lib/storage/db';

type Props = {
  id: string;
  db?: HyperJournalDb;
};

type DraftState = {
  name: string;
  conditions: string;
  invalidation: string;
  idealRR: string;
  examples: string;
  recurringMistakes: string;
  notes: string;
  tags: ReadonlyArray<string>;
};

type Status =
  | { kind: 'clean' }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string };

const EMPTY_DRAFT: DraftState = {
  name: '',
  conditions: '',
  invalidation: '',
  idealRR: '',
  examples: '',
  recurringMistakes: '',
  notes: '',
  tags: [],
};

function isDraftEmpty(d: DraftState): boolean {
  return (
    d.name.trim() === '' &&
    d.conditions.trim() === '' &&
    d.invalidation.trim() === '' &&
    d.idealRR.trim() === '' &&
    d.examples.trim() === '' &&
    d.recurringMistakes.trim() === '' &&
    d.notes.trim() === '' &&
    d.tags.length === 0
  );
}

function entryToDraft(entry: StrategyJournalEntry | null): DraftState {
  if (!entry) return { ...EMPTY_DRAFT };
  return {
    name: entry.name,
    conditions: entry.conditions,
    invalidation: entry.invalidation,
    idealRR: entry.idealRR,
    examples: entry.examples,
    recurringMistakes: entry.recurringMistakes,
    notes: entry.notes,
    tags: entry.tags ?? [],
  };
}

function formatSavedAt(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function StrategyJournalForm({ id, db }: Props) {
  const hook = useStrategyEntry(id, db ? { db } : {});
  const allTags = useAllTags(db ? { db } : {});
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [status, setStatus] = useState<Status>({ kind: 'clean' });
  const [hydrated, setHydrated] = useState(false);

  const draftRef = useRef<DraftState>(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (!hydrated && !hook.isLoading) {
      if (hook.entry) {
        const next = entryToDraft(hook.entry);
        setDraft(next);
        draftRef.current = next;
      }
      setHydrated(true);
    }
  }, [hook.entry, hook.isLoading, hydrated]);

  async function commit(next: DraftState) {
    if (isDraftEmpty(next) && !hook.entry) return;
    setStatus({ kind: 'saving' });
    const now = Date.now();
    const entry: StrategyJournalEntry = {
      id: hook.entry?.id ?? id,
      scope: 'strategy',
      createdAt: hook.entry?.createdAt ?? now,
      updatedAt: now,
      name: next.name,
      conditions: next.conditions,
      invalidation: next.invalidation,
      idealRR: next.idealRR,
      examples: next.examples,
      recurringMistakes: next.recurringMistakes,
      notes: next.notes,
      tags: normalizeTagList(next.tags),
      provenance: 'observed',
    };
    try {
      await hook.save(entry);
      setStatus({ kind: 'saved', at: now });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : "Couldn't save your notes.",
      });
    }
  }

  function change<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    const next = { ...draftRef.current, [key]: value };
    draftRef.current = next;
    setDraft(next);
    setStatus({ kind: 'dirty' });
  }

  function onBlurCommit() {
    void commit(draftRef.current);
  }

  const suggestions = useMemo(
    () => allTags.tags.filter((t) => !draft.tags.includes(t)),
    [allTags.tags, draft.tags],
  );

  return (
    <section
      aria-labelledby="strategy-journal-heading"
      className="flex flex-col gap-4 rounded-lg border border-border bg-bg-raised p-6"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="strategy-journal-heading" className="text-lg font-semibold text-fg-base">
          Strategy
        </h2>
        <StatusIndicator status={status} onRetry={onBlurCommit} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={draft.name}
          onChange={(e) => change('name', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="A short label for this setup"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="conditions">Conditions</Label>
        <textarea
          id="conditions"
          value={draft.conditions}
          onChange={(e) => change('conditions', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="What needs to be true in the market for this setup?"
          rows={3}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="invalidation">Invalidation</Label>
        <textarea
          id="invalidation"
          value={draft.invalidation}
          onChange={(e) => change('invalidation', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="What makes the setup wrong or the thesis dead?"
          rows={3}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="idealRR">Ideal R:R</Label>
        <Input
          id="idealRR"
          value={draft.idealRR}
          onChange={(e) => change('idealRR', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="2:1, 2-3:1, 3R min..."
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="examples">Examples</Label>
        <textarea
          id="examples"
          value={draft.examples}
          onChange={(e) => change('examples', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="Past trades or scenarios that fit this setup."
          rows={3}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="recurringMistakes">Recurring mistakes</Label>
        <textarea
          id="recurringMistakes"
          value={draft.recurringMistakes}
          onChange={(e) => change('recurringMistakes', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="What you keep doing wrong when this setup appears."
          rows={3}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          value={draft.notes}
          onChange={(e) => change('notes', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="Anything else — links to trades, evolving rules, questions."
          rows={4}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tags">Tags</Label>
        <TagInput
          id="tags"
          value={draft.tags}
          onChange={(v) => change('tags', v)}
          onBlur={onBlurCommit}
          suggestions={suggestions}
          placeholder="Add tags, press Enter"
        />
      </div>
    </section>
  );
}

const textareaClass = cn(
  'w-full rounded-md border border-border bg-bg-overlay px-3 py-2 text-sm text-fg-base',
  'placeholder:text-fg-subtle',
  'ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
  'resize-y',
);

function StatusIndicator({
  status,
  onRetry,
}: {
  status: Status;
  onRetry: () => void;
}) {
  if (status.kind === 'clean') return null;
  if (status.kind === 'dirty') {
    return <span className="text-xs text-fg-muted">Unsaved changes</span>;
  }
  if (status.kind === 'saving') {
    return <span className="text-xs text-fg-muted">Saving…</span>;
  }
  if (status.kind === 'saved') {
    return (
      <span className="text-xs text-fg-muted">Saved at {formatSavedAt(status.at)}</span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs text-loss">
      {status.message}
      <button
        type="button"
        onClick={onRetry}
        className="underline ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        Retry
      </button>
    </span>
  );
}
