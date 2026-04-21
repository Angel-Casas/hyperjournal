type Props = { compact?: boolean };

export function AnalyticsPanel({ compact = true }: Props) {
  return (
    <section
      aria-labelledby="analytics-heading"
      className="flex h-full flex-col rounded-lg border border-border bg-bg-raised p-6"
    >
      <header className="mb-4">
        <h2 id="analytics-heading" className="text-lg font-semibold text-fg-base">
          Trading analytics
        </h2>
        <p className="text-sm text-fg-muted">
          {compact
            ? 'Paste a Hyperliquid wallet address to see performance, calendar, and key metrics.'
            : 'Expanded analytics view — populated in Session 4.'}
        </p>
      </header>
      <div className="flex flex-1 items-center justify-center text-fg-subtle">
        <span className="font-mono text-xs uppercase tracking-wider">Empty state</span>
      </div>
    </section>
  );
}
