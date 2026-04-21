type Props = { compact?: boolean };

export function JournalPanel({ compact = true }: Props) {
  return (
    <section
      aria-labelledby="journal-heading"
      className="flex h-full flex-col rounded-lg border border-border bg-bg-raised p-6"
    >
      <header className="mb-4">
        <h2 id="journal-heading" className="text-lg font-semibold text-fg-base">
          Journal & coaching
        </h2>
        <p className="text-sm text-fg-muted">
          {compact
            ? 'Recent notes, strategies, and coaching prompts will appear here.'
            : 'Expanded journal view — populated in Session 5.'}
        </p>
      </header>
      <div className="flex flex-1 items-center justify-center text-fg-subtle">
        <span className="font-mono text-xs uppercase tracking-wider">Empty state</span>
      </div>
    </section>
  );
}
