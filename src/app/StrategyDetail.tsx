import { useParams, Navigate, Link } from 'react-router-dom';
import { StrategyJournalForm, useStrategyEntry } from '@features/journal';
import type { HyperJournalDb } from '@lib/storage/db';

type Props = { db?: HyperJournalDb };

export function StrategyDetail({ db }: Props) {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return <Navigate to="/strategies" replace />;
  }

  return <StrategyDetailInner id={id} {...(db ? { db } : {})} />;
}

function StrategyDetailInner({ id, db }: { id: string; db?: HyperJournalDb }) {
  const hook = useStrategyEntry(id, db ? { db } : {});

  if (hook.isLoading) {
    return (
      <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
        <p className="text-fg-muted">Loading strategy…</p>
      </main>
    );
  }

  if (!hook.entry) {
    return <Navigate to="/strategies" replace />;
  }

  const headingName = hook.entry.name.trim() === '' ? 'Untitled' : hook.entry.name;

  return (
    <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-fg-base">{headingName}</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/settings"
            className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            Settings
          </Link>
          <Link
            to="/strategies"
            className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            ← Back
          </Link>
        </div>
      </header>

      <StrategyJournalForm id={id} {...(db ? { db } : {})} />
    </main>
  );
}
