type Props = {
  tags: ReadonlyArray<string>;
  max?: number;
};

const DEFAULT_MAX = 3;

export function TagChipList({ tags, max = DEFAULT_MAX }: Props) {
  if (tags.length === 0) return null;
  const visible = tags.slice(0, max);
  const hidden = tags.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((t) => (
        <span
          key={t}
          className="rounded-full border border-border bg-bg-overlay px-2 py-0.5 text-xs text-fg-muted"
        >
          {t}
        </span>
      ))}
      {hidden > 0 && (
        <span className="rounded-full border border-border bg-bg-overlay px-2 py-0.5 text-xs text-fg-muted">
          +{hidden} more
        </span>
      )}
    </div>
  );
}
