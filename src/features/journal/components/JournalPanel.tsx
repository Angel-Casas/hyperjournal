import { Link } from 'react-router-dom';
import { useRecentSessionEntries } from '../hooks/useRecentSessionEntries';
import { todayUtcDateString } from '@domain/dates/todayUtcDateString';
import { Button } from '@lib/ui/components/button';
import type { HyperJournalDb } from '@lib/storage/db';
import type { SessionJournalEntry } from '@entities/journal-entry';

type Props = {
  db?: HyperJournalDb;
  /** Injectable clock for tests; defaults to Date.now() at render time. */
  now?: number;
};

export function JournalPanel({ db, now }: Props) {
  const today = todayUtcDateString(now ?? Date.now());
  const { entries, isLoading } = useRecentSessionEntries(db ? { db } : {});

  return (
    <section
      aria-labelledby="journal-panel-heading"
      className="flex h-full flex-col gap-4 rounded-lg border border-border bg-bg-raised p-6"
    >
      <header className="flex items-center justify-between gap-4">
        <h2 id="journal-panel-heading" className="text-lg font-semibold text-fg-base">
          Journal
        </h2>
        <Link to={`/d/${today}`}>
          <Button variant="default" size="sm">
            + Today's journal
          </Button>
        </Link>
      </header>

      {isLoading ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-fg-subtle">No session journal yet. Start with today's.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <li key={e.id}>
              <Link
                to={`/d/${e.date}`}
                className="flex flex-col gap-1 rounded-md border border-border bg-bg-overlay p-3 text-sm ring-offset-bg-base hover:bg-bg-overlay/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                <span className="text-xs font-medium uppercase tracking-wider text-fg-muted">
                  {formatShortDate(e.date)}
                </span>
                <span className="line-clamp-1 text-fg-base">{teaser(e)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatShortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d));
  return utc.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function teaser(entry: SessionJournalEntry): string {
  const priority = [
    entry.summary,
    entry.marketConditions,
    entry.whatToRepeat,
    entry.whatToAvoid,
  ];
  for (const field of priority) {
    const first = field.split('\n')[0]?.trim();
    if (first) {
      return first.length > 60 ? `${first.slice(0, 59)}…` : first;
    }
  }
  return 'Mindset / discipline only';
}
