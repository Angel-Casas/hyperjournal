import { useEffect } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { isValidWalletAddress } from '@domain/wallets/isValidWalletAddress';
import { useUserFills, useSavedWallets } from '@features/wallets';
import type { WalletAddress } from '@entities/wallet';

export function WalletView() {
  const { address } = useParams<{ address: string }>();

  if (!address || !isValidWalletAddress(address)) {
    return <Navigate to="/" replace />;
  }

  return <WalletViewInner address={address} />;
}

function WalletViewInner({ address }: { address: WalletAddress }) {
  const fills = useUserFills(address);
  const { save } = useSavedWallets();

  // Upsert the wallet on arrival so direct-URL visits populate the saved list
  // too. The upsert is idempotent (same address → same row), and including
  // `save` in deps would re-run on every render because mutation identity is
  // not referentially stable — keep deps to [address] only.
  useEffect(() => {
    save.mutate({ address, label: null, addedAt: Date.now() });
    // Intentionally only on address change — `save.mutate` is idempotent
    // (upsert on same row), and TanStack Query's mutation object identity
    // changes on every render; including it in deps would infinite-loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  return (
    <main className="flex h-[100dvh] flex-col gap-4 bg-bg-base p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg-base">Wallet</h1>
          <p className="font-mono text-xs text-fg-muted">{address}</p>
        </div>
        <Link to="/" className="text-sm text-fg-muted underline hover:text-fg-base">
          ← Back
        </Link>
      </header>

      <section
        aria-labelledby="fills-heading"
        className="flex-1 rounded-lg border border-border bg-bg-raised p-6"
      >
        <h2 id="fills-heading" className="mb-4 text-lg font-semibold text-fg-base">
          Fills
        </h2>

        {fills.isLoading && <p className="text-fg-muted">Loading fills…</p>}

        {fills.isError && (
          <p className="text-loss">Could not load fills: {fills.error.message}</p>
        )}

        {fills.data && (
          <p className="text-fg-base">
            Loaded <strong>{fills.data.length.toLocaleString()}</strong> fills.
          </p>
        )}
      </section>
    </main>
  );
}
