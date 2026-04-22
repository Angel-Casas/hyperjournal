import { useParams, Navigate, Link } from 'react-router-dom';
import { isValidDateString } from '@domain/dates/isValidDateString';
import { SessionJournalForm } from '@features/journal';

export function DayDetail() {
  const { date } = useParams<{ date: string }>();

  if (!date || !isValidDateString(date)) {
    return <Navigate to="/" replace />;
  }

  return <DayDetailInner date={date} />;
}

function DayDetailInner({ date }: { date: string }) {
  const formatted = formatLongDate(date);
  return (
    <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-fg-base">{formatted}</h1>
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

      <SessionJournalForm date={date} />
    </main>
  );
}

/**
 * "2026-04-22" → "Monday, April 22, 2026" (user locale). Uses
 * Date.UTC to avoid timezone drift — the route date is UTC-anchored.
 */
function formatLongDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d));
  return utc.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
