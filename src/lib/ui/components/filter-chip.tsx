import { cn } from '@lib/ui/utils';

type Props = {
  label: string;
  onRemove: () => void;
  ariaLabel: string;
  className?: string;
};

export function FilterChip({ label, onRemove, ariaLabel, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-bg-overlay px-2 py-0.5 text-xs text-fg-base',
        className,
      )}
    >
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={ariaLabel}
        className="rounded-full p-0.5 text-fg-muted ring-offset-bg-base hover:bg-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="h-3 w-3"
        >
          <path d="M18 6L6 18" />
          <path d="M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}
