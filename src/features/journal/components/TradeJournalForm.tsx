import { useEffect, useMemo, useRef, useState } from 'react';
import { useTradeJournalEntry } from '../hooks/useTradeJournalEntry';
import { useStrategies } from '../hooks/useStrategies';
import { useAllTags } from '../hooks/useAllTags';
import { TriStateRadio } from './TriStateRadio';
import { Label } from '@lib/ui/components/label';
import { TagInput } from '@lib/ui/components/tag-input';
import { normalizeTagList } from '@lib/tags/normalizeTag';
import { cn } from '@lib/ui/utils';
import type { Mood, TradeJournalEntry } from '@entities/journal-entry';
import type { HyperJournalDb } from '@lib/storage/db';

type Props = {
  tradeId: string;
  db?: HyperJournalDb;
};

type DraftState = {
  preTradeThesis: string;
  postTradeReview: string;
  lessonLearned: string;
  mood: Mood | null;
  planFollowed: boolean | null;
  stopLossUsed: boolean | null;
  strategyId: string | null;
  tags: ReadonlyArray<string>;
};

type Status =
  | { kind: 'clean' }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string };

const EMPTY_DRAFT: DraftState = {
  preTradeThesis: '',
  postTradeReview: '',
  lessonLearned: '',
  mood: null,
  planFollowed: null,
  stopLossUsed: null,
  strategyId: null,
  tags: [],
};

const MOOD_OPTIONS: ReadonlyArray<{ value: Mood | ''; label: string }> = [
  { value: '', label: '— unset' },
  { value: 'calm', label: 'Calm' },
  { value: 'confident', label: 'Confident' },
  { value: 'anxious', label: 'Anxious' },
  { value: 'greedy', label: 'Greedy' },
  { value: 'regretful', label: 'Regretful' },
];

function isDraftEmpty(draft: DraftState): boolean {
  return (
    draft.preTradeThesis.trim() === '' &&
    draft.postTradeReview.trim() === '' &&
    draft.lessonLearned.trim() === '' &&
    draft.mood === null &&
    draft.planFollowed === null &&
    draft.stopLossUsed === null &&
    draft.strategyId === null &&
    draft.tags.length === 0
  );
}

function entryToDraft(entry: TradeJournalEntry | null): DraftState {
  if (!entry) return { ...EMPTY_DRAFT };
  return {
    preTradeThesis: entry.preTradeThesis,
    postTradeReview: entry.postTradeReview,
    lessonLearned: entry.lessonLearned,
    mood: entry.mood,
    planFollowed: entry.planFollowed,
    stopLossUsed: entry.stopLossUsed,
    // Pre-7d rows may carry undefined here; treat as null.
    strategyId: entry.strategyId ?? null,
    // Pre-7e rows may carry undefined; treat as [].
    tags: entry.tags ?? [],
  };
}

function formatSavedAt(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TradeJournalForm({ tradeId, db }: Props) {
  const hook = useTradeJournalEntry(tradeId, db ? { db } : {});
  const strategies = useStrategies(db ? { db } : {});
  const allTags = useAllTags(db ? { db } : {});
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [status, setStatus] = useState<Status>({ kind: 'clean' });
  const [hydrated, setHydrated] = useState(false);

  // Ref tracks the latest draft so onBlurCommit — which may fire in the
  // same synchronous tick as a preceding change — reads the updated
  // values. Without this, React's batched re-render means the blur
  // handler captures the pre-change state and skips the save.
  const draftRef = useRef<DraftState>(draft);
  draftRef.current = draft;

  // Hydrate once when the query resolves the first time. If the entry
  // is null (no prior journal), skip the setDraft — draft is already
  // EMPTY_DRAFT from useState init, and overwriting would clobber user
  // input that landed during the initial load.
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
    if (isDraftEmpty(next) && !hook.entry) {
      // No existing row and nothing to save — stay idle.
      return;
    }
    setStatus({ kind: 'saving' });
    const now = Date.now();
    const entry: TradeJournalEntry = {
      id: hook.entry?.id ?? crypto.randomUUID(),
      scope: 'trade',
      tradeId,
      createdAt: hook.entry?.createdAt ?? now,
      updatedAt: now,
      preTradeThesis: next.preTradeThesis,
      postTradeReview: next.postTradeReview,
      lessonLearned: next.lessonLearned,
      mood: next.mood,
      planFollowed: next.planFollowed,
      stopLossUsed: next.stopLossUsed,
      strategyId: next.strategyId,
      tags: normalizeTagList(next.tags),
      imageIds: hook.entry?.imageIds ?? [],
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
      aria-labelledby="journal-heading"
      className="flex flex-col gap-4 rounded-lg border border-border bg-bg-raised p-6"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="journal-heading" className="text-lg font-semibold text-fg-base">
          Journal
        </h2>
        <StatusIndicator status={status} onRetry={onBlurCommit} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="preTradeThesis">Pre-trade thesis</Label>
        <textarea
          id="preTradeThesis"
          value={draft.preTradeThesis}
          onChange={(e) => change('preTradeThesis', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="What was your thesis before entering this trade?"
          rows={3}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="postTradeReview">Post-trade review</Label>
        <textarea
          id="postTradeReview"
          value={draft.postTradeReview}
          onChange={(e) => change('postTradeReview', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="What actually happened? What went right or wrong?"
          rows={4}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="lessonLearned">Lesson learned</Label>
        <textarea
          id="lessonLearned"
          value={draft.lessonLearned}
          onChange={(e) => change('lessonLearned', e.target.value)}
          onBlur={onBlurCommit}
          placeholder="One sentence takeaway for next time."
          rows={2}
          className={textareaClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="mood">Mood</Label>
        <select
          id="mood"
          value={draft.mood ?? ''}
          onChange={(e) =>
            change('mood', e.target.value === '' ? null : (e.target.value as Mood))
          }
          onBlur={onBlurCommit}
          className={cn(
            'h-10 rounded-md border border-border bg-bg-overlay px-3 text-sm text-fg-base',
            'ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          )}
        >
          {MOOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="strategy">Strategy</Label>
        <select
          id="strategy"
          value={draft.strategyId ?? ''}
          onChange={(e) =>
            change('strategyId', e.target.value === '' ? null : e.target.value)
          }
          onBlur={onBlurCommit}
          className={cn(
            'h-10 rounded-md border border-border bg-bg-overlay px-3 text-sm text-fg-base',
            'ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          )}
        >
          <option value="">— no strategy</option>
          {draft.strategyId &&
            !strategies.entries.some((s) => s.id === draft.strategyId) && (
              <option value={draft.strategyId}>— deleted strategy</option>
            )}
          {strategies.entries.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name.trim() === '' ? 'Untitled' : s.name}
            </option>
          ))}
        </select>
        {!strategies.isLoading && strategies.entries.length === 0 && (
          <p className="text-xs text-fg-muted">
            Create strategies in{' '}
            <a
              href="/strategies"
              className="underline ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              /strategies
            </a>
            .
          </p>
        )}
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

      <TriStateRadio
        legend="Plan followed?"
        name="planFollowed"
        value={draft.planFollowed}
        onChange={(v) => change('planFollowed', v)}
        onBlur={onBlurCommit}
      />

      <TriStateRadio
        legend="Stop-loss used?"
        name="stopLossUsed"
        value={draft.stopLossUsed}
        onChange={(v) => change('stopLossUsed', v)}
        onBlur={onBlurCommit}
      />
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
