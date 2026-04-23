import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCreateStrategy, useStrategies } from '@features/journal';
import { Button } from '@lib/ui/components/button';
import { Input } from '@lib/ui/components/input';
import { Label } from '@lib/ui/components/label';
import type { HyperJournalDb } from '@lib/storage/db';
import type { StrategyJournalEntry } from '@entities/journal-entry';

type Props = { db?: HyperJournalDb };

export function Strategies({ db }: Props) {
  const { entries, isLoading } = useStrategies(db ? { db } : {});
  const { create, isLoading: isCreating } = useCreateStrategy(db ? { db } : {});
  const navigate = useNavigate();

  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = draft.trim();
    if (name === '') {
      setError('Give the strategy a name.');
      return;
    }
    const id = await create(name);
    setDraft('');
    setError(null);
    navigate(`/s/${id}`);
  }

  return (
    <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-fg-base">Strategies</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/settings"
            className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            Settings
          </Link>
          <Link
            to="/"
            className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            ← Back
          </Link>
        </div>
      </header>

      <section
        aria-labelledby="new-strategy-heading"
        className="flex flex-col gap-3 rounded-lg border border-border bg-bg-raised p-6"
      >
        <h2 id="new-strategy-heading" className="sr-only">
          New strategy
        </h2>
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <Label htmlFor="new-strategy-name">New strategy name</Label>
          <div className="flex gap-2">
            <Input
              id="new-strategy-name"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Breakout, Mean-reversion, Trend follow"
              className="flex-1"
            />
            <Button type="submit" disabled={isCreating}>
              Create
            </Button>
          </div>
          {error && <p className="text-xs text-loss">{error}</p>}
        </form>
      </section>

      <section
        aria-labelledby="strategies-list-heading"
        className="flex flex-col gap-3 rounded-lg border border-border bg-bg-raised p-6"
      >
        <h2
          id="strategies-list-heading"
          className="text-lg font-semibold text-fg-base"
        >
          Your strategies
        </h2>

        {isLoading ? (
          <p className="text-sm text-fg-muted">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-fg-subtle">No strategies yet. Name one above to start.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((e) => (
              <li key={e.id}>
                <Link
                  to={`/s/${e.id}`}
                  className="flex flex-col gap-1 rounded-md border border-border bg-bg-overlay p-3 text-sm ring-offset-bg-base hover:bg-bg-overlay/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  <span className="font-semibold text-fg-base">
                    {e.name.trim() === '' ? 'Untitled' : e.name}
                  </span>
                  <span className="text-xs text-fg-muted">
                    Updated {formatShortDate(e.updatedAt)}
                  </span>
                  <span className="line-clamp-1 text-fg-base">{teaser(e)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function teaser(entry: StrategyJournalEntry): string {
  const priority = [
    entry.conditions,
    entry.invalidation,
    entry.notes,
    entry.recurringMistakes,
    entry.examples,
    entry.idealRR,
  ];
  for (const field of priority) {
    const first = field.split('\n')[0]?.trim();
    if (first) {
      return first.length > 60 ? `${first.slice(0, 59)}…` : first;
    }
  }
  return 'Empty content';
}
