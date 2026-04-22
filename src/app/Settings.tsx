import { Link } from 'react-router-dom';
import { ExportPanel } from './settings/ExportPanel';
import { ImportPanel } from './settings/ImportPanel';

export function Settings() {
  return (
    <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-fg-base">Settings</h1>
        <Link
          to="/"
          className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          ← Back
        </Link>
      </header>

      <section
        aria-labelledby="settings-data-heading"
        className="flex flex-col gap-4 rounded-lg border border-border bg-bg-raised p-6"
      >
        <h2
          id="settings-data-heading"
          className="text-lg font-semibold text-fg-base"
        >
          Data
        </h2>
        <ExportPanel />
        <ImportPanel />
      </section>
    </main>
  );
}
