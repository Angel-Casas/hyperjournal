import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSessionJournalEntry } from '../hooks/useSessionJournalEntry';
import { useAllTags } from '../hooks/useAllTags';
import { useImagePasteHandler } from '../hooks/useImagePasteHandler';
import { MAX_IMAGES_PER_ENTRY } from '../hooks/useTradeJournalEntry';
import { ImageGallery } from './ImageGallery';
import { ImageUploadButton } from './ImageUploadButton';
import { ImageBanner, type BannerReason } from './ImageBanner';
import { Label } from '@lib/ui/components/label';
import { TagInput } from '@lib/ui/components/tag-input';
import { normalizeTagList } from '@lib/tags/normalizeTag';
import { cn } from '@lib/ui/utils';
import type { Mindset, SessionJournalEntry } from '@entities/journal-entry';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';

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
  tags: ReadonlyArray<string>;
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
  tags: [],
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
    d.disciplineScore === null &&
    d.tags.length === 0
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
    tags: entry.tags ?? [],
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
  const allTags = useAllTags(db ? { db } : {});
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [status, setStatus] = useState<Status>({ kind: 'clean' });
  const [hydrated, setHydrated] = useState(false);
  const [imageBanner, setImageBanner] = useState<BannerReason | null>(null);

  const draftRef = useRef<DraftState>(draft);
  draftRef.current = draft;
  const sectionRef = useRef<HTMLElement | null>(null);
  const bannerTimerRef = useRef<number | null>(null);

  function showBanner(reason: BannerReason) {
    if (bannerTimerRef.current !== null) {
      window.clearTimeout(bannerTimerRef.current);
    }
    setImageBanner(reason);
    bannerTimerRef.current = window.setTimeout(() => {
      setImageBanner(null);
      bannerTimerRef.current = null;
    }, 5000);
  }

  useEffect(
    () => () => {
      if (bannerTimerRef.current !== null) {
        window.clearTimeout(bannerTimerRef.current);
      }
    },
    [],
  );

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

  function buildEntry(
    next: DraftState,
    imageIds: ReadonlyArray<string>,
    now: number,
    existing: SessionJournalEntry | null = hook.entry,
  ): SessionJournalEntry {
    return {
      id: existing?.id ?? crypto.randomUUID(),
      scope: 'session',
      date,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      marketConditions: next.marketConditions,
      summary: next.summary,
      whatToRepeat: next.whatToRepeat,
      whatToAvoid: next.whatToAvoid,
      mindset: next.mindset,
      disciplineScore: next.disciplineScore,
      tags: normalizeTagList(next.tags),
      imageIds,
      provenance: 'observed',
    };
  }

  async function readLatest(): Promise<SessionJournalEntry | null> {
    const actualDb = db ?? defaultDb;
    const fresh = await actualDb.journalEntries
      .where('date')
      .equals(date)
      .first();
    return fresh && fresh.scope === 'session' ? fresh : null;
  }

  async function commit(next: DraftState) {
    if (isDraftEmpty(next) && !hook.entry) return;
    setStatus({ kind: 'saving' });
    const now = Date.now();
    const fresh = await readLatest();
    const imageIds = fresh?.imageIds ?? hook.entry?.imageIds ?? [];
    const entry = buildEntry(next, imageIds, now, fresh);
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

  const handleAddImage = useCallback(
    async (file: File) => {
      const fresh = await readLatest();
      const existing = fresh?.imageIds ?? hook.entry?.imageIds ?? [];
      const result = await hook.addImage(file, (newImageId) =>
        buildEntry(
          draftRef.current,
          [...existing, newImageId],
          Date.now(),
          fresh,
        ),
      );
      if (!result.ok) {
        showBanner(result.reason);
      } else {
        setImageBanner(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hook],
  );

  const handleRemoveImage = useCallback(
    async (id: string) => {
      const fresh = await readLatest();
      const existing = fresh?.imageIds ?? hook.entry?.imageIds ?? [];
      await hook.removeImage(id, () =>
        buildEntry(
          draftRef.current,
          existing.filter((x) => x !== id),
          Date.now(),
          fresh,
        ),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hook],
  );

  useImagePasteHandler(sectionRef, handleAddImage);

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
      ref={sectionRef}
      aria-labelledby="session-journal-heading"
      className="flex flex-col gap-4 rounded-lg border border-border bg-bg-raised p-6"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
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
        <Label>Images</Label>
        <ImageGallery
          imageIds={hook.entry?.imageIds ?? []}
          onRemove={handleRemoveImage}
          db={db}
        />
        <div>
          <ImageUploadButton
            onSelect={handleAddImage}
            disabled={(hook.entry?.imageIds.length ?? 0) >= MAX_IMAGES_PER_ENTRY}
          />
        </div>
        {imageBanner && <ImageBanner reason={imageBanner} />}
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
