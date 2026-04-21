import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ReconstructedTrade } from '@entities/trade';
import { formatCurrency, formatHoldTime } from '@lib/ui/format';
import { cn } from '@lib/ui/utils';

type Props = { trades: ReadonlyArray<ReconstructedTrade> };

const ROW_HEIGHT = 40;
const VIEWPORT_HEIGHT = 300;
const GRID_COLUMNS =
  'grid-cols-[minmax(80px,1fr)_70px_minmax(120px,1fr)_80px_minmax(100px,1fr)_80px]';

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function TradeHistoryList({ trades }: Props) {
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
      <div
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
            return (
              <div
                key={t.id}
                role="row"
                className={cn(
                  'grid items-center gap-2 border-b border-border py-2 text-sm',
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
                <div role="cell" className="truncate font-mono text-fg-base">
                  {t.coin}
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
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
