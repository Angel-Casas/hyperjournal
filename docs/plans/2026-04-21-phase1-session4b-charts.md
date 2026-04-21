# Phase 1 Session 4b — Charts + P/L Calendar + Trade History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the three headline visualizations to `/w/:address`: a cumulative-PnL (equity) curve, a day-granular P/L calendar heatmap, and a scrollable trade history list. All three consume Session 3's `ReconstructedTrade[]` via pure-domain transforms, then render through a thin ECharts React wrapper (for the two charts) and a native table (for history). No routing changes — the expanded view sits on the existing wallet page.

**Architecture:** Two new pure-domain helpers in `domain/metrics/` — `buildEquityCurve(trades)` and `buildPnlCalendar(trades)` — produce plain-data shapes the charts consume. A `<EChartsBase>` React component in `lib/charts/` owns mount/resize/update/dispose lifecycle; equity + calendar each own a Session-4b-specific wrapper that builds the ECharts `option` object from our domain shape and passes it to the base. The trade history list is a virtualized table component. All three plug into `WalletView`'s existing layout.

**Tech Stack (new this session):** `echarts@5.5.1` (runtime), `@tanstack/react-virtual@3.10.8` (trade-list virtualization), both blessed by ADR. No React wrapper library — we write our own thin wrapper per ADR-0007 to keep control over the imperative lifecycle.

---

## File structure (at end of session)

```
HyperJournal/
├── src/
│   ├── domain/
│   │   └── metrics/
│   │       ├── buildEquityCurve.ts              (pure: trades → [{time, equity}])
│   │       ├── buildEquityCurve.test.ts
│   │       ├── buildPnlCalendar.ts              (pure: trades → day-bucketed PnL)
│   │       └── buildPnlCalendar.test.ts
│   ├── lib/
│   │   └── charts/
│   │       ├── EChartsBase.tsx                  (thin React wrapper — mount, resize, update, dispose)
│   │       └── EChartsBase.test.tsx
│   ├── features/
│   │   └── wallets/
│   │       └── components/
│   │           ├── EquityCurveChart.tsx         (domain → ECharts option)
│   │           ├── PnlCalendarChart.tsx
│   │           └── TradeHistoryList.tsx         (virtualized table)
│   └── app/
│       └── WalletView.tsx                       (layout updated: metrics + charts + history)
```

---

## Conventions

- Commands from `/Users/angel/Documents/HyperJournal`.
- Commits end with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- TDD for domain helpers; component tests for `EChartsBase` (mount/update lifecycle) and `TradeHistoryList` (row rendering + virtualization behavior). Chart wrappers (`EquityCurveChart`, `PnlCalendarChart`) get smoke tests that verify they call through to `EChartsBase` with a well-shaped option — full chart rendering is visual and stays a manual check.
- Domain helpers remain pure: no `Date.now()`, no `new Date()` at module level. Date bucketing uses date-fns' pure functions (`startOfDay(new Date(ms))` is pure for a given ms input).

---

## ADR-0007 (first commit of this session) — ECharts React integration

Write this ADR before any code:

### Context
Session 4b needs two interactive charts. CLAUDE.md §2 pins Apache ECharts. The ecosystem has `echarts-for-react` (community wrapper, ~2KB) and the raw `echarts` core (~350KB minified + hand-written wrapper ~40 LOC).

### Decision
Use raw `echarts` + a hand-written `EChartsBase` React component. The wrapper owns:
- Initializing the ECharts instance on mount (`echarts.init(el)`) against a `useRef`ed div.
- Applying a `setOption(option, { notMerge: true })` when the `option` prop changes.
- Calling `resize()` in a `ResizeObserver` callback.
- `dispose()` on unmount.

Pass-through props: `option: EChartsOption`, `className?`, `style?`, `onEvents?: Record<string, (params: unknown) => void>` for click/hover handlers.

### Alternatives considered
- `echarts-for-react` — rejected: adds a dependency that re-implements exactly what our 40 LOC wrapper does, plus imposes React 18 opinions (e.g., lifecycle-via-effect rather than imperative) we may not want. Skipping the wrapper keeps the dependency surface slim and lets us upgrade ECharts independently.
- `recharts` / `visx` — rejected: CLAUDE.md §2 is pinned on ECharts for the quality + animation we want; other libs have different aesthetic defaults.

### Consequences
- Easier: we fully own the ECharts lifecycle; custom renderers, events, and animations can be threaded without the wrapper fighting us.
- Harder: must be careful about referential stability of the `option` prop — identical contents with new object reference triggers unnecessary `setOption` calls. Consumers use `useMemo` for their options.
- Invariant: `EChartsBase` does NOT build option objects itself. Consumers pass a complete `EChartsOption`. Keeps the wrapper agnostic to chart type.

---

## Task 1: ECharts install + `EChartsBase` wrapper + ADR-0007

**Files:**
- Install: `echarts@5.5.1`
- Create: `src/lib/charts/EChartsBase.tsx`
- Create: `src/lib/charts/EChartsBase.test.tsx`
- Modify: `docs/DECISIONS.md` (append ADR-0007)

- [ ] **Step 1.1: Install**

```bash
pnpm add echarts@5.5.1
```

- [ ] **Step 1.2: Write the failing tests (RED)**

Create `src/lib/charts/EChartsBase.test.tsx`:

```tsx
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { EChartsBase } from './EChartsBase';
import * as echarts from 'echarts';

afterEach(() => cleanup());

describe('EChartsBase', () => {
  it('initializes an ECharts instance on a div element', () => {
    const initSpy = vi.spyOn(echarts, 'init');
    render(<EChartsBase option={{}} />);
    expect(initSpy).toHaveBeenCalled();
    const [el] = initSpy.mock.calls[0]!;
    expect(el).toBeInstanceOf(HTMLDivElement);
    initSpy.mockRestore();
  });

  it('applies className and style to the root div', () => {
    render(<EChartsBase option={{}} className="chart-root" style={{ height: 200 }} />);
    const el = screen.getByTestId('echarts-base');
    expect(el).toHaveClass('chart-root');
    expect(el).toHaveStyle({ height: '200px' });
  });

  it('calls setOption when the option prop changes', () => {
    const { rerender } = render(<EChartsBase option={{ title: { text: 'a' } }} />);
    // We cannot easily intercept setOption on the real instance without
    // leaking implementation. Smoke: the component re-renders without
    // error when option changes.
    expect(() =>
      rerender(<EChartsBase option={{ title: { text: 'b' } }} />),
    ).not.toThrow();
  });

  it('disposes the instance on unmount', () => {
    // Spy on the dispose method of the instance returned by init.
    const disposeSpy = vi.fn();
    const originalInit = echarts.init;
    vi.spyOn(echarts, 'init').mockImplementation(((el: HTMLElement) => {
      const inst = originalInit(el);
      const origDispose = inst.dispose.bind(inst);
      inst.dispose = () => {
        disposeSpy();
        origDispose();
      };
      return inst;
    }) as typeof echarts.init);
    const { unmount } = render(<EChartsBase option={{}} />);
    unmount();
    expect(disposeSpy).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });
});
```

Run:
```bash
pnpm test src/lib/charts/
```
Expected: RED.

- [ ] **Step 1.3: Write `EChartsBase` (GREEN)**

Create `src/lib/charts/EChartsBase.tsx`:

```tsx
import { useEffect, useRef, type CSSProperties } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption, ECharts } from 'echarts';

type Props = {
  option: EChartsOption;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  onEvents?: Record<string, (params: unknown) => void> | undefined;
};

/**
 * Thin React wrapper around a raw `echarts` instance. Owns lifecycle:
 * init on mount, setOption on option-change, resize via ResizeObserver,
 * dispose on unmount. Does NOT build option objects — consumers pass a
 * complete EChartsOption. Per ADR-0007.
 *
 * Consumers should useMemo their option object so prop-identity changes
 * only when content changes; otherwise setOption fires on every render.
 */
export function EChartsBase({ option, className, style, onEvents }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<ECharts | null>(null);

  // Init + dispose
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    const instance = echarts.init(el);
    instanceRef.current = instance;

    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(el);

    return () => {
      observer.disconnect();
      instance.dispose();
      instanceRef.current = null;
    };
  }, []);

  // Apply option on every change
  useEffect(() => {
    instanceRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  // Attach event handlers (keyed by event name). Reattached every
  // render because handlers can close over changing state.
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || !onEvents) return undefined;
    for (const [name, handler] of Object.entries(onEvents)) {
      instance.on(name, handler);
    }
    return () => {
      for (const name of Object.keys(onEvents)) {
        instance.off(name);
      }
    };
  }, [onEvents]);

  return (
    <div
      ref={hostRef}
      data-testid="echarts-base"
      className={className}
      style={style}
    />
  );
}
```

- [ ] **Step 1.4: Append ADR-0007 to `docs/DECISIONS.md`**

(Full ADR text in the "ADR-0007" section above.)

- [ ] **Step 1.5: Run + gauntlet + commit**

```bash
pnpm test src/lib/charts/
pnpm lint
pnpm typecheck
pnpm build
```

All exit 0.

```bash
git add package.json pnpm-lock.yaml src/lib/charts/ docs/DECISIONS.md
git commit -m "$(cat <<'EOF'
feat(charts): add EChartsBase thin wrapper with ADR-0007

ECharts 5.5.1 installed. EChartsBase owns the imperative lifecycle
(init, setOption, resize via ResizeObserver, dispose) and exposes a
declarative `option` prop plus optional className/style/onEvents.
Consumers memoize their option object; the wrapper does not build
ECharts options itself. ADR-0007 captures the no-echarts-for-react
decision and the referential-stability invariant.

4 tests cover init-on-mount, prop passthrough, option-change
re-render safety, and dispose-on-unmount.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `buildEquityCurve` pure helper + tests

Takes `ReconstructedTrade[]`, emits `Array<{ time: number; equity: number; coin: string; pnl: number }>` — one point per closed trade, time-sorted, equity running. The shape is domain, not chart-specific, so Session 5 can reuse it (e.g., for a snapshot export).

- [ ] **Step 2.1: Test (RED)**

Create `src/domain/metrics/buildEquityCurve.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildEquityCurve } from './buildEquityCurve';
import type { ReconstructedTrade } from '@entities/trade';

const makeTrade = (o: Partial<ReconstructedTrade>): ReconstructedTrade => ({
  id: 'x',
  wallet: null,
  coin: 'BTC',
  side: 'long',
  status: 'closed',
  legs: [],
  openedAt: 0,
  closedAt: 0,
  holdTimeMs: 0,
  openedSize: 0,
  closedSize: 0,
  avgEntryPx: 0,
  avgExitPx: null,
  realizedPnl: 0,
  totalFees: 0,
  provenance: 'observed',
  ...o,
});

describe('buildEquityCurve', () => {
  it('returns an empty array for no trades', () => {
    expect(buildEquityCurve([])).toEqual([]);
  });

  it('emits one point per closed trade, time-sorted, with running equity', () => {
    const trades = [
      makeTrade({ id: 'a', closedAt: 3, realizedPnl: -5, coin: 'BTC' }),
      makeTrade({ id: 'b', closedAt: 1, realizedPnl: 10, coin: 'ETH' }),
      makeTrade({ id: 'c', closedAt: 2, realizedPnl: 20, coin: 'BTC' }),
    ];
    const curve = buildEquityCurve(trades);
    expect(curve).toEqual([
      { time: 1, equity: 10, coin: 'ETH', pnl: 10 },
      { time: 2, equity: 30, coin: 'BTC', pnl: 20 },
      { time: 3, equity: 25, coin: 'BTC', pnl: -5 },
    ]);
  });

  it('excludes open trades', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', closedAt: 1, realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'open', closedAt: 2, realizedPnl: 999 }),
    ];
    const curve = buildEquityCurve(trades);
    expect(curve).toHaveLength(1);
    expect(curve[0]!.equity).toBe(10);
  });
});
```

- [ ] **Step 2.2: Impl (GREEN)**

```ts
import type { ReconstructedTrade } from '@entities/trade';

export type EquityPoint = {
  readonly time: number;
  readonly equity: number;
  readonly coin: string;
  readonly pnl: number;
};

/**
 * Cumulative realized-PnL curve. One point per closed trade, sorted by
 * closedAt ascending. `equity` is the running sum; `coin` and `pnl` let
 * tooltips show which trade caused each step.
 */
export function buildEquityCurve(
  trades: ReadonlyArray<ReconstructedTrade>,
): ReadonlyArray<EquityPoint> {
  const closed = trades
    .filter((t) => t.status === 'closed')
    .slice()
    .sort((a, b) => a.closedAt - b.closedAt);
  let running = 0;
  return closed.map((t) => {
    running += t.realizedPnl;
    return { time: t.closedAt, equity: running, coin: t.coin, pnl: t.realizedPnl };
  });
}
```

- [ ] **Step 2.3: Run + commit**

Standard gauntlet + commit.

---

## Task 3: `buildPnlCalendar` pure helper + tests

Bucket trades by local-day (or UTC-day — decide early). Each bucket: `{ date: 'YYYY-MM-DD', pnl: number, tradeCount: number }`. Used by the calendar heatmap.

- [ ] **Step 3.1: Decide on timezone**

Use **UTC** for v1. Per CLAUDE.md §4.4 the product favors correctness over local-convenience; users in different timezones viewing the same wallet should see the same buckets. Local-timezone mode is a BACKLOG toggle.

- [ ] **Step 3.2: Test (RED)**

```ts
import { describe, expect, it } from 'vitest';
import { buildPnlCalendar } from './buildPnlCalendar';
// ... makeTrade helper as in buildEquityCurve.test.ts

describe('buildPnlCalendar', () => {
  it('returns an empty map for no trades', () => {
    expect(buildPnlCalendar([]).size).toBe(0);
  });

  it('buckets closed trades by UTC date, summing PnL and counting trades', () => {
    // 2024-03-15 12:00 UTC  = 1710504000000
    // 2024-03-15 23:59 UTC  = 1710547199000
    // 2024-03-16 01:00 UTC  = 1710550800000
    const trades = [
      makeTrade({ id: 'a', status: 'closed', closedAt: 1710504000000, realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'closed', closedAt: 1710547199000, realizedPnl: 5 }),
      makeTrade({ id: 'c', status: 'closed', closedAt: 1710550800000, realizedPnl: -3 }),
    ];
    const cal = buildPnlCalendar(trades);
    expect(cal.size).toBe(2);
    expect(cal.get('2024-03-15')).toEqual({ date: '2024-03-15', pnl: 15, tradeCount: 2 });
    expect(cal.get('2024-03-16')).toEqual({ date: '2024-03-16', pnl: -3, tradeCount: 1 });
  });

  it('excludes open trades from buckets', () => {
    const trades = [
      makeTrade({ id: 'a', status: 'closed', closedAt: 1710504000000, realizedPnl: 10 }),
      makeTrade({ id: 'b', status: 'open', closedAt: 1710504000000, realizedPnl: 999 }),
    ];
    const cal = buildPnlCalendar(trades);
    expect(cal.get('2024-03-15')!.tradeCount).toBe(1);
    expect(cal.get('2024-03-15')!.pnl).toBe(10);
  });
});
```

- [ ] **Step 3.3: Impl (GREEN)**

```ts
import type { ReconstructedTrade } from '@entities/trade';

export type PnlCalendarDay = {
  readonly date: string; // YYYY-MM-DD (UTC)
  readonly pnl: number;
  readonly tradeCount: number;
};

/**
 * Bucket closed trades by their `closedAt` UTC date. Returns a map keyed
 * by `YYYY-MM-DD` with the day's total realized PnL and trade count.
 * UTC is used so the same wallet shows the same buckets regardless of
 * viewer timezone — local-timezone mode is a BACKLOG item.
 */
export function buildPnlCalendar(
  trades: ReadonlyArray<ReconstructedTrade>,
): ReadonlyMap<string, PnlCalendarDay> {
  const out = new Map<string, { date: string; pnl: number; tradeCount: number }>();
  for (const t of trades) {
    if (t.status !== 'closed') continue;
    const d = new Date(t.closedAt);
    const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const existing = out.get(date);
    if (existing) {
      existing.pnl += t.realizedPnl;
      existing.tradeCount += 1;
    } else {
      out.set(date, { date, pnl: t.realizedPnl, tradeCount: 1 });
    }
  }
  return out;
}
```

Note: no date-fns needed here — native `Date` UTC accessors are sufficient for day-bucketing. Save the dep for calendar component formatting if needed.

- [ ] **Step 3.4: Run + commit**

---

## Task 4: `EquityCurveChart` — domain → ECharts option

Thin wrapper that calls `buildEquityCurve`, builds an `EChartsOption`, passes to `<EChartsBase>`.

### Design

- X axis: time (ECharts `type: 'time'`)
- Y axis: equity USDC
- Single line series, area-filled below in `gain` colour
- Tooltip: date + "PnL: $X • Running equity: $Y • Coin"
- Dark theme: override `backgroundColor`, `textStyle`, axis lines etc. to match HJ tokens. Easiest: read computed CSS variables in a small helper, OR hardcode the HSL values (they're already in globals.css).

Use hardcoded CSS-var HSL strings via `getComputedStyle(document.documentElement)` read inside `useMemo` — avoids coupling to tailwind at runtime but stays themeable.

- [ ] **Step 4.1: Smoke-test (RED)**

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EquityCurveChart } from './EquityCurveChart';

const trades = [/* synthetic closed trades */];

describe('EquityCurveChart', () => {
  it('renders the chart container', () => {
    render(<EquityCurveChart trades={trades} />);
    expect(screen.getByTestId('echarts-base')).toBeInTheDocument();
  });

  it('renders an empty-state message when there are no closed trades', () => {
    render(<EquityCurveChart trades={[]} />);
    expect(screen.getByText(/no closed trades/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4.2: Impl**

```tsx
import { useMemo } from 'react';
import { EChartsBase } from '@lib/charts/EChartsBase';
import { buildEquityCurve } from '@domain/metrics/buildEquityCurve';
import type { ReconstructedTrade } from '@entities/trade';
import type { EChartsOption } from 'echarts';

type Props = { trades: ReadonlyArray<ReconstructedTrade> };

export function EquityCurveChart({ trades }: Props) {
  const curve = useMemo(() => buildEquityCurve(trades), [trades]);

  const option = useMemo<EChartsOption>(() => {
    if (curve.length === 0) return {};
    return {
      animation: true,
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'hsl(220 12% 9%)',
        borderColor: 'hsl(220 10% 26%)',
        textStyle: { color: 'hsl(210 20% 96%)' },
        formatter: (p: unknown) => {
          const param = (Array.isArray(p) ? p[0] : p) as {
            data: { value: [number, number]; coin: string; pnl: number };
          };
          const [timestamp, equity] = param.data.value;
          const date = new Date(timestamp).toISOString().slice(0, 10);
          const pnlStr =
            param.data.pnl >= 0
              ? `+$${param.data.pnl.toFixed(2)}`
              : `-$${Math.abs(param.data.pnl).toFixed(2)}`;
          return `${date}<br/>Trade: ${param.data.coin} ${pnlStr}<br/>Equity: $${equity.toFixed(2)}`;
        },
      },
      grid: { left: 50, right: 20, top: 20, bottom: 40 },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: 'hsl(220 10% 26%)' } },
        axisLabel: { color: 'hsl(215 16% 72%)' },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: 'hsl(220 10% 26%)' } },
        axisLabel: {
          color: 'hsl(215 16% 72%)',
          formatter: (v: number) =>
            v >= 0 ? `$${v.toFixed(0)}` : `-$${Math.abs(v).toFixed(0)}`,
        },
        splitLine: { lineStyle: { color: 'hsl(220 10% 18%)' } },
      },
      series: [
        {
          type: 'line',
          smooth: false,
          showSymbol: false,
          lineStyle: { color: 'hsl(152 76% 50%)', width: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'hsl(152 76% 50% / 0.4)' },
                { offset: 1, color: 'hsl(152 76% 50% / 0)' },
              ],
            },
          },
          data: curve.map((p) => ({
            value: [p.time, p.equity] as [number, number],
            coin: p.coin,
            pnl: p.pnl,
          })),
        },
      ],
    };
  }, [curve]);

  if (curve.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-bg-raised text-sm text-fg-subtle">
        No closed trades to chart yet.
      </div>
    );
  }

  return (
    <section
      aria-labelledby="equity-heading"
      className="rounded-lg border border-border bg-bg-raised p-4"
    >
      <h2 id="equity-heading" className="mb-4 text-lg font-semibold text-fg-base">
        Equity curve
      </h2>
      <EChartsBase option={option} style={{ height: 260 }} />
    </section>
  );
}
```

- [ ] **Step 4.3: Run + gauntlet + commit**

---

## Task 5: `PnlCalendarChart` — day heatmap

Uses ECharts' built-in `calendar` coordinate + `heatmap` series. Calendar scales automatically to the trade date range.

### Design

- Year-range: min(closedAt) year → max(closedAt) year, clipped to the most recent 365 days if range is larger (v1 simplification)
- Cell colour: gain green for positive days, loss red for negative, tone intensity proportional to log(|pnl|)
- Tooltip: `YYYY-MM-DD<br/>N trades • $PnL`
- Empty state: "No closed trades to display"

- [ ] **Step 5.1: Test (RED)**

Mirror Task 4's smoke test for the calendar: container present, empty-state when no data.

- [ ] **Step 5.2: Impl**

```tsx
import { useMemo } from 'react';
import { EChartsBase } from '@lib/charts/EChartsBase';
import { buildPnlCalendar } from '@domain/metrics/buildPnlCalendar';
import type { ReconstructedTrade } from '@entities/trade';
import type { EChartsOption } from 'echarts';

type Props = { trades: ReadonlyArray<ReconstructedTrade> };

export function PnlCalendarChart({ trades }: Props) {
  const calendar = useMemo(() => buildPnlCalendar(trades), [trades]);

  const option = useMemo<EChartsOption>(() => {
    if (calendar.size === 0) return {};
    const entries = Array.from(calendar.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const firstDate = entries[0]!.date;
    const lastDate = entries[entries.length - 1]!.date;
    const maxAbs = entries.reduce((m, e) => Math.max(m, Math.abs(e.pnl)), 1);

    return {
      animation: false,
      backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: 'hsl(220 12% 9%)',
        borderColor: 'hsl(220 10% 26%)',
        textStyle: { color: 'hsl(210 20% 96%)' },
        formatter: (p: unknown) => {
          const param = p as { data: [string, number, number] };
          const [date, pnl, count] = param.data;
          const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
          return `${date}<br/>${count} trade${count === 1 ? '' : 's'} • ${pnlStr}`;
        },
      },
      visualMap: {
        min: -maxAbs,
        max: maxAbs,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        show: false,
        inRange: {
          color: [
            'hsl(357 80% 60%)', // loss at min
            'hsl(220 10% 18%)', // neutral at 0
            'hsl(152 76% 50%)', // gain at max
          ],
        },
      },
      calendar: {
        range: [firstDate, lastDate],
        cellSize: ['auto', 16],
        itemStyle: { borderColor: 'hsl(220 13% 6%)', borderWidth: 1 },
        splitLine: { show: false },
        dayLabel: { color: 'hsl(215 16% 72%)' },
        monthLabel: { color: 'hsl(215 16% 72%)' },
        yearLabel: { show: false },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: entries.map((e) => [e.date, e.pnl, e.tradeCount]),
        },
      ],
    };
  }, [calendar]);

  if (calendar.size === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-border bg-bg-raised text-sm text-fg-subtle">
        No closed trades to display in calendar.
      </div>
    );
  }

  return (
    <section
      aria-labelledby="calendar-heading"
      className="rounded-lg border border-border bg-bg-raised p-4"
    >
      <h2 id="calendar-heading" className="mb-4 text-lg font-semibold text-fg-base">
        P/L calendar
      </h2>
      <EChartsBase option={option} style={{ height: 180 }} />
    </section>
  );
}
```

- [ ] **Step 5.3: Run + commit**

---

## Task 6: `TradeHistoryList` — virtualized table

Install `@tanstack/react-virtual@3.10.8` and render a scrollable table. Columns: coin, side, opened-at date, status, PnL (colour-coded), hold time.

### Design

- 300px viewport height
- Sort: most-recent closedAt first (open trades at top if sorted separately, or flat chronological — choose flat chronological sorted DESC by closedAt, with openTrades at bottom getting their openedAt as sort key).

Wait, cleaner: sort by `max(closedAt, openedAt)` descending. Closed trades use closedAt; open trades use openedAt. Most recent activity at top.

- [ ] **Step 6.1: Install virtualizer**

```bash
pnpm add @tanstack/react-virtual@3.10.8
```

- [ ] **Step 6.2: Test (RED)**

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TradeHistoryList } from './TradeHistoryList';

describe('TradeHistoryList', () => {
  it('renders an empty state for no trades', () => {
    render(<TradeHistoryList trades={[]} />);
    expect(screen.getByText(/no trades yet/i)).toBeInTheDocument();
  });

  it('renders rows for each trade', () => {
    const trades = [/* 3 synthetic */];
    render(<TradeHistoryList trades={trades} />);
    // Headers
    expect(screen.getByRole('columnheader', { name: /coin/i })).toBeInTheDocument();
    // One row per trade + 1 header row
    expect(screen.getAllByRole('row').length).toBeGreaterThanOrEqual(trades.length);
  });
});
```

- [ ] **Step 6.3: Impl**

```tsx
import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ReconstructedTrade } from '@entities/trade';
import { formatCurrency, formatHoldTime } from '@lib/ui/format';
import { cn } from '@lib/ui/utils';

type Props = { trades: ReadonlyArray<ReconstructedTrade> };

const ROW_HEIGHT = 40;
const VIEWPORT = 300;

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
      <div className="grid grid-cols-[minmax(80px,1fr)_70px_minmax(120px,1fr)_80px_minmax(100px,1fr)_80px] items-center gap-2 border-b border-border pb-2 text-[11px] font-medium uppercase tracking-wider text-fg-muted">
        <div role="columnheader">Coin</div>
        <div role="columnheader">Side</div>
        <div role="columnheader">Opened</div>
        <div role="columnheader">Status</div>
        <div role="columnheader" className="text-right">PnL</div>
        <div role="columnheader" className="text-right">Held</div>
      </div>
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ height: VIEWPORT }}
      >
        <div
          role="rowgroup"
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
        >
          {virtualizer.getVirtualItems().map((v) => {
            const t = sorted[v.index]!;
            const pnlTone =
              t.realizedPnl > 0 ? 'text-gain' : t.realizedPnl < 0 ? 'text-loss' : 'text-fg-base';
            return (
              <div
                key={t.id}
                role="row"
                className="grid grid-cols-[minmax(80px,1fr)_70px_minmax(120px,1fr)_80px_minmax(100px,1fr)_80px] items-center gap-2 border-b border-border py-2 text-sm"
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
                <div role="cell" className={t.side === 'long' ? 'text-gain' : 'text-loss'}>
                  {t.side}
                </div>
                <div role="cell" className="font-mono text-xs text-fg-muted">
                  {new Date(t.openedAt).toISOString().slice(0, 10)}
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
```

- [ ] **Step 6.4: Run + commit**

---

## Task 7: `WalletView` layout update

Wire the three new components into the existing layout. Structure:

```
Header
Metrics grid (from Session 4a)
Equity curve (full width)
P/L calendar (full width)
Trade history (full width)
```

- [ ] **Step 7.1: Update `WalletView.tsx`**

The existing layout already stacks sections in `flex flex-col gap-6`. Add the three new sections after the metrics grid. Each consumes `trades` — expose `trades` from `useWalletMetrics` by threading it through, or call a new helper hook `useWalletTrades` that returns `{ trades, isLoading, isError }`.

Decision: add `trades` to `useWalletMetrics`' return so it is computed once and shared. Both metrics and charts need it.

Update `useWalletMetrics.ts`:

```ts
export type UseWalletMetricsResult = {
  stats: TradeStats | null;
  trades: ReadonlyArray<ReconstructedTrade>;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
};

// ... inside useMemo:
const result = useMemo(() => {
  if (!fills.data) return { stats: null, trades: [] as ReadonlyArray<ReconstructedTrade> };
  const trades = reconstructTrades(fills.data);
  return { stats: computeTradeStats(trades), trades };
}, [fills.data]);
return { ...result, isLoading, isError, error };
```

Then WalletView:

```tsx
{metrics.stats && (
  <>
    <WalletMetricsGrid stats={metrics.stats} />
    <EquityCurveChart trades={metrics.trades} />
    <PnlCalendarChart trades={metrics.trades} />
    <TradeHistoryList trades={metrics.trades} />
  </>
)}
```

- [ ] **Step 7.2: Update `useWalletMetrics.test.tsx`**

The third assertion (`result.current.stats!.closedCount...`) already implicitly tests that `trades` are computed. Add a new assertion that `trades` is non-empty after load.

- [ ] **Step 7.3: Update `features/wallets/index.ts`**

Export the three new components.

- [ ] **Step 7.4: Manual browser smoke**

`pnpm dev`, open `/w/0xf318...`, confirm metrics grid, equity curve, calendar, and trade list all render without errors. Tooltip on the equity curve shows a meaningful trade; calendar cells are coloured; trade list scrolls smoothly.

- [ ] **Step 7.5: Commit**

---

## Task 8: Docs + final verification + across-session review

- [ ] Update `docs/CONVENTIONS.md`: add §11 "Charts and data visualization" documenting the `EChartsBase` pattern (consumer memoizes options, wrapper owns lifecycle, HSL values pulled from design tokens).
- [ ] Update `docs/BACKLOG.md`: Session 4b deferrals (local-timezone calendar mode, hover-on-calendar-day → filter trade list, equity curve benchmarks, export chart as PNG, etc.).
- [ ] Append `docs/SESSION_LOG.md` entry.
- [ ] Final gauntlet + `superpowers:code-reviewer` across session.

---

## Self-review checklist

- **Plan coverage:** roadmap's Session 4 deliverables (equity curve, P/L calendar, trade history, analytics expanded view) all map to tasks.
- **Purity:** `buildEquityCurve` and `buildPnlCalendar` are pure. `EChartsBase` has imperative side effects — that's OK, it's a `lib/` concern not a `domain/` one.
- **No sneaky dependencies:** ECharts and `react-virtual` are the only new runtime deps. ADR-0007 documents the ECharts choice.
- **Fixture correctness:** every chart's data comes from `ReconstructedTrade[]` which is bit-for-bit correct (per Session 3's oracle). The charts inherit that correctness.
