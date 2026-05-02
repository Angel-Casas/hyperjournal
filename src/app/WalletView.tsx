import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, Navigate } from 'react-router-dom';
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
import { FiltersDrawer } from '@features/wallets/components/FiltersDrawer';
import { ActiveFilterChips } from '@features/wallets/components/ActiveFilterChips';
import { useJournalEntryIds, useJournalTagsByTradeId } from '@features/journal';
import { Button } from '@lib/ui/components/button';
import { applyFilters } from '@domain/filters/applyFilters';
import {
  DEFAULT_FILTER_STATE,
  countActive,
  isDefault,
  type FilterState,
} from '@domain/filters/filterState';
import {
  parseFilterStateFromSearchParams,
  serializeFilterStateToSearchParams,
} from '@lib/validation/filterState';
import { computeTradeStats } from '@domain/metrics/computeTradeStats';
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
  const { tagsByTradeId } = useJournalTagsByTradeId();
  const { save } = useSavedWallets();

  useEffect(() => {
    save.mutate({ address, label: null, addedAt: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const [searchParams, setSearchParams] = useSearchParams();
  const filterState = useMemo(
    () => parseFilterStateFromSearchParams(searchParams),
    [searchParams],
  );
  const setFilterState = useCallback(
    (next: FilterState) => {
      setSearchParams(serializeFilterStateToSearchParams(next), { replace: true });
    },
    [setSearchParams],
  );

  const filteredTrades = useMemo(
    () =>
      applyFilters(metrics.trades, filterState, {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    [metrics.trades, filterState],
  );
  const filteredStats = useMemo(
    () =>
      isDefault(filterState) ? metrics.stats : computeTradeStats(filteredTrades),
    [filterState, metrics.stats, filteredTrades],
  );
  const availableCoins = useMemo(
    () => Array.from(new Set(metrics.trades.map((t) => t.coin))).sort(),
    [metrics.trades],
  );
  const hasActiveFilters = !isDefault(filterState);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const errorCopy = errorCopyFor(metrics.error);

  return (
    <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
      <WalletHeader
        address={address}
        isFetching={metrics.isFetching}
        onRefresh={() => {
          void metrics.refresh();
        }}
        onOpenFilters={() => setDrawerOpen(true)}
        filterCount={countActive(filterState)}
      />

      <FiltersDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        state={filterState}
        onChange={setFilterState}
        availableCoins={availableCoins}
      />

      {hasActiveFilters && (
        <ActiveFilterChips state={filterState} onChange={setFilterState} />
      )}

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
          {filteredStats && <WalletMetricsGrid stats={filteredStats} />}
          <EquityCurveChart trades={filteredTrades} />
          <PnlCalendarChart trades={filteredTrades} />
          <TradeHistoryList
            trades={filteredTrades}
            address={address}
            tradeIdsWithNotes={tradeIdsWithNotes}
            tradeTagsByTradeId={tagsByTradeId}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={() => setFilterState(DEFAULT_FILTER_STATE)}
          />
        </>
      )}
    </main>
  );
}
