import { useEffect } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { isValidWalletAddress } from '@domain/wallets/isValidWalletAddress';
import {
  EquityCurveChart,
  PnlCalendarChart,
  TradeHistoryList,
  useSavedWallets,
  useWalletMetrics,
  WalletMetricsGrid,
} from '@features/wallets';
import type { WalletAddress } from '@entities/wallet';

export function WalletView() {
  const { address } = useParams<{ address: string }>();

  if (!address || !isValidWalletAddress(address)) {
    return <Navigate to="/" replace />;
  }

  return <WalletViewInner address={address} />;
}

function WalletViewInner({ address }: { address: WalletAddress }) {
  const metrics = useWalletMetrics(address);
  const { save } = useSavedWallets();

  useEffect(() => {
    save.mutate({ address, label: null, addedAt: Date.now() });
    // Intentionally only on address change — save.mutate is idempotent
    // (upsert on same row), and TanStack Query's mutation object identity
    // changes on every render; including it in deps would infinite-loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  return (
    <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg-base">Wallet</h1>
          <p className="font-mono text-xs text-fg-muted">{address}</p>
        </div>
        <Link to="/" className="text-sm text-fg-muted underline hover:text-fg-base">
          ← Back
        </Link>
      </header>

      {metrics.isLoading && (
        <section className="rounded-lg border border-border bg-bg-raised p-6">
          <p className="text-fg-muted">Loading metrics…</p>
        </section>
      )}

      {metrics.isError && (
        <section className="rounded-lg border border-border bg-bg-raised p-6">
          <p className="text-loss">
            Could not load wallet data: {metrics.error?.message}
          </p>
        </section>
      )}

      {metrics.stats && (
        <>
          <WalletMetricsGrid stats={metrics.stats} />
          <EquityCurveChart trades={metrics.trades} />
          <PnlCalendarChart trades={metrics.trades} />
          <TradeHistoryList trades={metrics.trades} />
        </>
      )}
    </main>
  );
}
