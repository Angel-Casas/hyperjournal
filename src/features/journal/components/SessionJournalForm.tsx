import { useEffect, useRef, useState } from 'react';
import { useSessionJournalEntry } from '../hooks/useSessionJournalEntry';
import { Label } from '@lib/ui/components/label';
import { cn } from '@lib/ui/utils';
import type { Mindset, SessionJournalEntry } from '@entities/journal-entry';
import type { HyperJournalDb } from '@lib/storage/db';

type Props = {
  date: string;
  db?: HyperJournalDb;
};

type DraftState = {
  marketConditions: string;
  summary: string;
  whatToRepeat: string;
  whatToAvoid: string;
  mindset: Mindset | null;
  disciplineScore: number | null;
};

type Status =
  | { kind: 'clean' }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string };

const EMPTY_DRAFT: DraftState = {
  marketConditions: '',
  summary: '',
  whatToRepeat: '',
  whatToAvoid: '',
  mindset: null,
  disciplineScore: null,
};

const MINDSET_OPTIONS: ReadonlyArray<{ value: Mindset | ''; label: string }> = [
  { value: '', label: '— unset' },
  { value: 'focused', label: 'Focused' },
  { value: 'scattered', label: 'Scattered' },
  { value: 'reactive', label: 'Reactive' },
  { value: 'patient', label: 'Patient' },
  { value: 'tilted', label: 'Tilted' },
];

function isDraftEmpty(d: DraftState): boolean {
  return (
    d.marketConditions.trim() === '' &&
    d.summary.trim() === '' &&
    d.whatToRepeat.trim() === '' &&
    d.whatToAvoid.trim() === '' &&
    d.mindset === null &&
    d.disciplineScore === null
  );
}

function entryToDraft(entry: SessionJournalEntry | null): DraftState {
  if (!entry) return { ...EMPTY_DRAFT };
  return {
    marketConditions: entry.marketConditions,
    summary: entry.summary,
    whatToRepeat: entry.whatToRepeat,
    whatToAvoid: entry.whatToAvoid,
    mindset: entry.mindset,
    disciplineScore: entry.disciplineScore,
  };
}

function formatSavedAt(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SessionJournalForm({ date, db }: Props) {
  const hook = useSessionJournalEntry(date, db ? { db } : {});
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
    const entry: SessionJournalEntry = {
      id: hook.entry?.id ?? crypto.randomUUID(),
      scope: 'session',
      date,
      createdAt: hook.entry?.createdAt ?? now,
      updatedAt: now,
      marketConditions: next.marketConditions,
      summary: next.summary,
      whatToRepeat: next.whatToRepeat,
      whatToAvoid: next.whatToAvoid,
      mindset: next.mindset,
      disciplineScore: next.disciplineScore,
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

  return (
    <section
      aria-labelledby="session-journal-heading"
      className="flex flex-col gap-4 rounded-lg border border-border bg-bg-raised p-6"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="session-journal-heading" className="text-lg font-semibold text-fg-base">
          Journal
        </h2>
        <StatusIndicator status={status} onRetry={onBlurCommit} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="marketConditions">Market conditions</Label>
        <textarea
          id="marketConditions"
          value={draft.marketConditions}
          onChange={(e) => change('marketConditions', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="Choppy, trending, news-driven..."
          rows={2}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="summary">Summary of the day</Label>
        <textarea
          id="summary"
          value={draft.summary}
          onChange={(e) => change('summary', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="What happened, what you did, what you got wrong."
          rows={4}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="whatToRepeat">What to repeat</Label>
        <textarea
          id="whatToRepeat"
          value={draft.whatToRepeat}
          onChange={(e) => change('whatToRepeat', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="What worked that you want to do again."
          rows={2}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="whatToAvoid">What to avoid</Label>
        <textarea
          id="whatToAvoid"
          value={draft.whatToAvoid}
          onChange={(e) => change('whatToAvoid', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="What you did that you want to stop doing."
          rows={2}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="mindset">Mindset</Label>
        <select
          id="mindset"
          value={draft.mindset ?? ''}
          onChange={(e) =>
            change('mindset', e.target.value === '' ? null : (e.target.value as Mindset))
          }
          onBlur={onBlurCommit}
          className={cn(
            'h-10 rounded-md border border-border bg-bg-overlay px-3 text-sm text-fg-base',
            'ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          )}
        >
          {MINDSET_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-fg-base">Discipline score</legend>
        <div className="flex flex-wrap gap-3 text-sm text-fg-base">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              htmlFor={`disciplineScore-${n}`}
              className="flex cursor-pointer items-center gap-2"
            >
              <input
                id={`disciplineScore-${n}`}
                name="disciplineScore"
                type="radio"
                checked={draft.disciplineScore === n}
                onChange={() => change('disciplineScore', n)}
                onBlur={onBlurCommit}
                className="h-4 w-4 border-border bg-bg-overlay text-accent ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              />
              <span>{n}</span>
            </label>
          ))}
          <label
            htmlFor="disciplineScore-unanswered"
            className="flex cursor-pointer items-center gap-2"
          >
            <input
              id="disciplineScore-unanswered"
              name="disciplineScore"
              type="radio"
              checked={draft.disciplineScore === null}
              onChange={() => change('disciplineScore', null)}
              onBlur={onBlurCommit}
              className="h-4 w-4 border-border bg-bg-overlay text-accent ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            />
            <span>Unanswered</span>
          </label>
        </div>
      </fieldset>
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
