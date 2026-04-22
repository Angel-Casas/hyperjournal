import { useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { ZodError } from 'zod';
import { HyperliquidApiError } from '@lib/api/hyperliquid';
import { isValidWalletAddress } from '@domain/wallets/isValidWalletAddress';
import {
  EquityCurveChart,
  PnlCalendarChart,
  TradeHistoryList,
  useSavedWallets,
  useWalletMetrics,
  WalletHeader,
  WalletMetricsGrid,
} from '@features/wallets';
import { useJournalEntryIds } from '@features/journal';
import { Button } from '@lib/ui/components/button';
import type { WalletAddress } from '@entities/wallet';

type ErrorCopy = {
  heading: string;
  tone: 'loss' | 'risk' | 'neutral';
};

function errorCopyFor(error: Error | null): ErrorCopy {
  if (error instanceof HyperliquidApiError) {
    if (error.status >= 400 && error.status < 500) {
      return {
        heading:
          "That wallet has no Hyperliquid history yet, or Hyperliquid doesn't recognize the address.",
        tone: 'neutral',
      };
    }
    return {
      heading: "Couldn't reach Hyperliquid. Check your connection and try again.",
      tone: 'risk',
    };
  }
  if (error instanceof ZodError) {
    return {
      heading:
        "Hyperliquid returned data HyperJournal doesn't yet understand. Please report this.",
      tone: 'loss',
    };
  }
  if (
    error &&
    (error.message.toLowerCase().includes('fetch') ||
      error.message.toLowerCase().includes('network'))
  ) {
    return {
      heading: "Couldn't reach Hyperliquid. Check your connection and try again.",
      tone: 'risk',
    };
  }
  return { heading: 'Something went wrong. Try refreshing.', tone: 'neutral' };
}

const toneClass = {
  loss: 'text-loss',
  risk: 'text-risk',
  neutral: 'text-fg-base',
} as const;

export function WalletView() {
  const { address } = useParams<{ address: string }>();

  if (!address || !isValidWalletAddress(address)) {
    return <Navigate to="/" replace />;
  }

  return <WalletViewInner address={address} />;
}

function WalletViewInner({ address }: { address: WalletAddress }) {
  const metrics = useWalletMetrics(address);
  const { ids: tradeIdsWithNotes } = useJournalEntryIds();
  const { save } = useSavedWallets();

  useEffect(() => {
    save.mutate({ address, label: null, addedAt: Date.now() });
    // Mutation identity changes every render; intentional dep omission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const errorCopy = errorCopyFor(metrics.error);

  return (
    <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
      <WalletHeader
        address={address}
        isFetching={metrics.isFetching}
        onRefresh={() => {
          void metrics.refresh();
        }}
      />

      {metrics.isLoading && (
        <section className="rounded-lg border border-border bg-bg-raised p-6">
          <p className="text-fg-muted">Loading metrics…</p>
        </section>
      )}

      {metrics.isError && (
        <section
          aria-labelledby="wallet-error-heading"
          className="flex flex-col gap-3 rounded-lg border border-border bg-bg-raised p-6"
        >
          <h2
            id="wallet-error-heading"
            className={`text-base font-medium ${toneClass[errorCopy.tone]}`}
          >
            {errorCopy.heading}
          </h2>
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void metrics.refresh();
              }}
            >
              Try again
            </Button>
          </div>
        </section>
      )}

      {metrics.stats && (
        <>
          <WalletMetricsGrid stats={metrics.stats} />
          <EquityCurveChart trades={metrics.trades} />
          <PnlCalendarChart trades={metrics.trades} />
          <TradeHistoryList
            trades={metrics.trades}
            address={address}
            tradeIdsWithNotes={tradeIdsWithNotes}
          />
        </>
      )}
    </main>
  );
}
