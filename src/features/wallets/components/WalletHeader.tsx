import { Link } from 'react-router-dom';
import type { WalletAddress } from '@entities/wallet';
import { Button } from '@lib/ui/components/button';
import { cn } from '@lib/ui/utils';

type Props = {
  address: WalletAddress;
  isFetching: boolean;
  onRefresh: () => void;
};

export function WalletHeader({ address, isFetching, onRefresh }: Props) {
  return (
    <header className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-fg-base">Wallet</h1>
        <p className="truncate font-mono text-xs text-fg-muted">{address}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isFetching}
          aria-label="Refresh wallet data"
        >
          <RefreshIcon className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          Refresh
        </Button>
        <Link
          to="/"
          className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          ← Back
        </Link>
      </div>
    </header>
  );
}

function RefreshIcon({ className }: { className?: string | undefined }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <polyline points="21 4 21 10 15 10" />
    </svg>
  );
}
