import { useParams, Navigate, Link } from 'react-router-dom';
import { isValidWalletAddress } from '@domain/wallets/isValidWalletAddress';
import { useWalletMetrics } from '@features/wallets';
import { TradeJournalForm } from '@features/journal';
import { formatCurrency, formatHoldTime } from '@lib/ui/format';
import type { WalletAddress } from '@entities/wallet';
import type { ReconstructedTrade } from '@entities/trade';

export function TradeDetail() {
  const { address, tradeId } = useParams<{ address: string; tradeId: string }>();

  if (!address || !isValidWalletAddress(address)) {
    return <Navigate to="/" replace />;
  }
  if (!tradeId) {
    return <Navigate to={`/w/${address}`} replace />;
  }

  return <TradeDetailInner address={address} tradeId={tradeId} />;
}

function TradeDetailInner({
  address,
  tradeId,
}: {
  address: WalletAddress;
  tradeId: string;
}) {
  const metrics = useWalletMetrics(address);

  if (metrics.isLoading) {
    return (
      <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
        <p className="text-fg-muted">Loading trade…</p>
      </main>
    );
  }

  const trade = metrics.trades.find((t) => t.id === tradeId);
  if (!trade) {
    return <Navigate to={`/w/${address}`} replace />;
  }

  return (
    <main className="flex min-h-[100dvh] flex-col gap-6 bg-bg-base p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="text-xl font-semibold text-fg-base">{trade.coin}</h1>
          <SideBadge side={trade.side} />
          <StatusBadge status={trade.status} />
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/settings"
            className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            Settings
          </Link>
          <Link
            to={`/w/${address}`}
            className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            ← Back
          </Link>
        </div>
      </header>

      <TradeSummary trade={trade} />
      <TradeJournalForm tradeId={trade.id} />
    </main>
  );
}

function SideBadge({ side }: { side: 'long' | 'short' }) {
  const tone = side === 'long' ? 'bg-gain/10 text-gain' : 'bg-loss/10 text-loss';
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-medium uppercase ${tone}`}>
      {side}
    </span>
  );
}

function StatusBadge({ status }: { status: 'open' | 'closed' }) {
  const tone = status === 'closed' ? 'bg-bg-overlay text-fg-muted' : 'bg-risk/10 text-risk';
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>
  );
}

function TradeSummary({ trade }: { trade: ReconstructedTrade }) {
  const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return (
    <section
      aria-labelledby="trade-summary-heading"
      className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-bg-raised p-6 md:grid-cols-4"
    >
      <h2 id="trade-summary-heading" className="sr-only">
        Trade summary
      </h2>
      <SummaryCell label="Opened" value={fmtDate(trade.openedAt)} />
      <SummaryCell
        label={trade.status === 'closed' ? 'Closed' : 'Still open'}
        value={trade.status === 'closed' ? fmtDate(trade.closedAt) : '—'}
      />
      <SummaryCell
        label="Avg entry"
        value={trade.avgEntryPx !== null ? trade.avgEntryPx.toFixed(2) : '—'}
      />
      <SummaryCell
        label="Avg exit"
        value={trade.avgExitPx !== null ? trade.avgExitPx.toFixed(2) : '—'}
      />
      <SummaryCell label="Size" value={trade.openedSize.toString()} />
      <SummaryCell
        label="Realized PnL"
        value={trade.status === 'closed' ? formatCurrency(trade.realizedPnl) : '—'}
      />
      <SummaryCell label="Fees" value={formatCurrency(-trade.totalFees)} />
      <SummaryCell
        label="Held"
        value={trade.status === 'closed' ? formatHoldTime(trade.holdTimeMs) : '—'}
      />
    </section>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wider text-fg-muted">
        {label}
      </p>
      <p className="font-mono text-sm text-fg-base">{value}</p>
    </div>
  );
}
