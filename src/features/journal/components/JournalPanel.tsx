export function JournalPanel() {
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
          Recent notes, strategies, and coaching prompts will appear here.
        </p>
      </header>
      <div className="flex flex-1 items-center justify-center text-fg-subtle">
        <span className="font-mono text-xs uppercase tracking-wider">No entries yet</span>
      </div>
    </section>
  );
}
