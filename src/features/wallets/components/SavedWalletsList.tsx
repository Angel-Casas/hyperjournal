import { Link } from 'react-router-dom';
import { useSavedWallets } from '../hooks/useSavedWallets';

export function SavedWalletsList() {
  const { list } = useSavedWallets();

  if (list.isLoading) {
    return <p className="text-sm text-fg-muted">Loading saved wallets…</p>;
  }

  if (!list.data || list.data.length === 0) {
    return (
      <p className="text-sm text-fg-subtle">
        No saved wallets yet. Paste one above to get started.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {list.data.map((wallet) => (
        <li key={wallet.address}>
          <Link
            to={`/w/${wallet.address}`}
            className="flex items-center justify-between gap-3 rounded border border-border bg-bg-overlay px-3 py-2 font-mono text-xs text-fg-muted ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <span className="truncate">{wallet.label ?? wallet.address}</span>
            <span className="text-fg-subtle">→</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
