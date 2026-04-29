import { useMemo, useRef, type SVGProps } from 'react';
import { Link } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ReconstructedTrade } from '@entities/trade';
import type { WalletAddress } from '@entities/wallet';
import { formatCurrency, formatHoldTime } from '@lib/ui/format';
import { cn } from '@lib/ui/utils';
import { TagChipList } from '@lib/ui/components/tag-chip-list';

const EMPTY_IDS: ReadonlySet<string> = new Set();
const EMPTY_TAGS_MAP: ReadonlyMap<string, ReadonlyArray<string>> = new Map();

type Props = {
  trades: ReadonlyArray<ReconstructedTrade>;
  address: WalletAddress;
  /**
   * Set of tradeIds that have journal notes. Supplied by the route-level
   * composer (src/app/*) which is allowed to consume features/journal;
   * features/wallets can't import sibling features directly per the
   * boundaries rule. Defaults to an empty set.
   */
  tradeIdsWithNotes?: ReadonlySet<string>;
  /**
   * Map of tradeId → tag array. Same boundary rationale as
   * tradeIdsWithNotes. Defaults to an empty map.
   */
  tradeTagsByTradeId?: ReadonlyMap<string, ReadonlyArray<string>>;
  /**
   * When true, the empty-state copy switches from "No trades yet" to
   * "No trades match these filters" and (if onClearFilters is supplied)
   * shows a Clear all button.
   */
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
};

const ROW_HEIGHT = 40;
const VIEWPORT_HEIGHT = 300;
const GRID_COLUMNS =
  'grid-cols-[minmax(80px,1fr)_70px_minmax(120px,1fr)_80px_minmax(100px,1fr)_80px_minmax(80px,1fr)]';

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function TradeHistoryList({
  trades,
  address,
  tradeIdsWithNotes = EMPTY_IDS,
  tradeTagsByTradeId = EMPTY_TAGS_MAP,
  hasActiveFilters = false,
  onClearFilters,
}: Props) {
  const sorted = useMemo(
    () =>
      [...trades].sort((a, b) => {
        const ak = a.status === 'closed' ? a.closedAt : a.openedAt;
        const bk = b.status === 'closed' ? b.closedAt : b.openedAt;
        return bk - ak;
      }),
    [trades],
  );

  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  if (sorted.length === 0) {
    if (hasActiveFilters) {
      return (
        <div className="flex h-32 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-bg-raised text-sm text-fg-subtle">
          <p>No trades match these filters.</p>
          {onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="rounded-md border border-border bg-bg-overlay px-3 py-1 text-xs text-fg-base ring-offset-bg-base hover:bg-bg-overlay/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              Clear all
            </button>
          )}
        </div>
      );
    }
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border border-border bg-bg-raised text-sm text-fg-subtle">
        No trades yet.
      </div>
    );
  }

  return (
    <section
      aria-labelledby="history-heading"
      className="rounded-lg border border-border bg-bg-raised p-4"
    >
      <h2 id="history-heading" className="mb-4 text-lg font-semibold text-fg-base">
        Trade history
      </h2>
      <div role="table" aria-label="Trade history">
        <div role="rowgroup">
          <div
            role="row"
            className={cn(
              'grid items-center gap-2 border-b border-border pb-2 text-[11px] font-medium uppercase tracking-wider text-fg-muted',
              GRID_COLUMNS,
            )}
          >
            <div role="columnheader">Coin</div>
            <div role="columnheader">Side</div>
            <div role="columnheader">Opened</div>
            <div role="columnheader">Status</div>
            <div role="columnheader" className="text-right">
              PnL
            </div>
            <div role="columnheader" className="text-right">
              Held
            </div>
            <div role="columnheader">Tags</div>
          </div>
        </div>
        <div ref={parentRef} className="overflow-auto" style={{ height: VIEWPORT_HEIGHT }}>
          <div
            role="rowgroup"
            style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map((v) => {
              const t = sorted[v.index]!;
              const pnlTone =
                t.status === 'open'
                  ? 'text-fg-muted'
                  : t.realizedPnl > 0
                    ? 'text-gain'
                    : t.realizedPnl < 0
                      ? 'text-loss'
                      : 'text-fg-base';
              const hasNotes = tradeIdsWithNotes.has(t.id);
              return (
                <Link
                  key={t.id}
                  to={`/w/${address}/t/${t.id}`}
                  role="row"
                  className={cn(
                    'grid items-center gap-2 border-b border-border py-2 text-sm',
                    'ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                    'hover:bg-bg-overlay/40',
                    GRID_COLUMNS,
                  )}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${v.start}px)`,
                    height: ROW_HEIGHT,
                  }}
                >
                  <div role="cell" className="flex items-center gap-1 truncate font-mono text-fg-base">
                    <span className="truncate">{t.coin}</span>
                    {hasNotes && (
                      <PencilIcon aria-label="Has journal notes" className="h-3 w-3 shrink-0 text-fg-muted" />
                    )}
                  </div>
                  <div
                    role="cell"
                    className={t.side === 'long' ? 'text-gain' : 'text-loss'}
                  >
                    {t.side}
                  </div>
                  <div role="cell" className="font-mono text-xs text-fg-muted">
                    {formatDate(t.openedAt)}
                  </div>
                  <div role="cell" className="text-fg-muted">
                    {t.status}
                  </div>
                  <div role="cell" className={cn('text-right font-mono', pnlTone)}>
                    {t.status === 'open' ? '—' : formatCurrency(t.realizedPnl)}
                  </div>
                  <div role="cell" className="text-right font-mono text-fg-muted">
                    {t.status === 'open' ? '—' : formatHoldTime(t.holdTimeMs)}
                  </div>
                  <div role="cell" className="overflow-hidden">
                    <TagChipList tags={tradeTagsByTradeId.get(t.id) ?? []} max={2} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function PencilIcon({
  className,
  ...rest
}: SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}
