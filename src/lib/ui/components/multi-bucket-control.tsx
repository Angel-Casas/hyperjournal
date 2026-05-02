import { cn } from '@lib/ui/utils';

type Props<T extends string> = {
  /** Section heading; rendered as the group label (visible h3). */
  label: string;
  /** Bucket id + display label pairs, in render order. */
  buckets: ReadonlyArray<{ id: T; label: string }>;
  /** Currently-selected ids. */
  selected: ReadonlyArray<T>;
  /** Click handler — toggles the bucket in the parent's state. */
  onToggle: (id: T) => void;
};

export function MultiBucketControl<T extends string>({
  label,
  buckets,
  selected,
  onToggle,
}: Props<T>) {
  const selectedSet = new Set(selected);
  return (
    <section
      role="group"
      aria-label={label}
      className="flex flex-col gap-2"
    >
      <h3 className="text-sm font-semibold text-fg-base">{label}</h3>
      <div className="flex flex-wrap gap-1.5">
        {buckets.map((b) => {
          const pressed = selectedSet.has(b.id);
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={pressed}
              onClick={() => onToggle(b.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                pressed
                  ? 'border-accent bg-accent/20 text-fg-base'
                  : 'border-border bg-bg-overlay text-fg-muted hover:text-fg-base',
              )}
            >
              {b.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
