import type { ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@lib/ui/components/sheet';
import { Button } from '@lib/ui/components/button';
import { MultiBucketControl } from '@lib/ui/components/multi-bucket-control';
import {
  DEFAULT_FILTER_STATE,
  isDefault,
  setCoin,
  setCustomDateRange,
  setDateRangePreset,
  setOutcome,
  setSide,
  setStatus,
  toggleHoldDuration,
  toggleTimeOfDay,
  toggleDayOfWeek,
  toggleTradeSize,
  type DateRangePreset,
  type FilterState,
  type Outcome,
  type Side,
  type Status,
} from '@domain/filters/filterState';
import { DAY_OF_WEEK_ORDER } from '@entities/filter-state';
import {
  HOLD_DURATION_BUCKETS,
  TIME_OF_DAY_BANDS,
  DAY_OF_WEEK_LABELS,
  TRADE_SIZE_BUCKETS,
} from '@domain/filters/buckets';
import { isValidDateString, type YYYYMMDD } from '@domain/dates/isValidDateString';
import { cn } from '@lib/ui/utils';

type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  state: FilterState;
  onChange: (next: FilterState) => void;
  availableCoins: ReadonlyArray<string>;
};

const PRESET_LABELS: Record<DateRangePreset, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '1y': 'Last year',
  all: 'All time',
};

const PRESETS: ReadonlyArray<DateRangePreset> = ['7d', '30d', '90d', '1y', 'all'];

const DAY_BUCKETS = DAY_OF_WEEK_ORDER.map((id) => ({
  id,
  label: DAY_OF_WEEK_LABELS[id],
}));

const HOLD_BUCKETS_DISPLAY = HOLD_DURATION_BUCKETS.map((b) => ({
  id: b.id,
  label: b.label,
}));
const TOD_BANDS_DISPLAY = TIME_OF_DAY_BANDS.map((b) => ({
  id: b.id,
  label: b.label,
}));
const SIZE_BUCKETS_DISPLAY = TRADE_SIZE_BUCKETS.map((b) => ({
  id: b.id,
  label: b.label,
}));

export function FiltersDrawer({
  open,
  onOpenChange,
  state,
  onChange,
  availableCoins,
}: Props) {
  const dr = state.dateRange;
  const isCustom = dr.kind === 'custom';
  const customFrom = dr.kind === 'custom' ? dr.from : '';
  const customTo = dr.kind === 'custom' ? dr.to : '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isDefault(state)}
              onClick={() => onChange(DEFAULT_FILTER_STATE)}
            >
              Clear all
            </Button>
            <SheetClose
              className="rounded-md p-1 text-fg-muted ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              aria-label="Close filters"
            >
              ✕
            </SheetClose>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-6 overflow-y-auto">
          <Group title="When">
            <Section heading="Date range">
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <PresetButton
                    key={p}
                    active={
                      state.dateRange.kind === 'preset' &&
                      state.dateRange.preset === p
                    }
                    onClick={() => onChange(setDateRangePreset(state, p))}
                  >
                    {PRESET_LABELS[p]}
                  </PresetButton>
                ))}
                <PresetButton
                  active={isCustom}
                  onClick={() => {
                    const today = new Date().toISOString().slice(0, 10);
                    onChange(
                      setCustomDateRange(
                        state,
                        today as YYYYMMDD,
                        today as YYYYMMDD,
                      ),
                    );
                  }}
                >
                  Custom…
                </PresetButton>
              </div>
              {isCustom && (
                <div className="mt-3 flex items-center gap-3">
                  <label className="flex flex-col gap-1 text-xs text-fg-muted">
                    From
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (isValidDateString(v)) {
                          onChange(
                            setCustomDateRange(state, v, customTo as YYYYMMDD),
                          );
                        }
                      }}
                      className="rounded-md border border-border bg-bg-overlay px-2 py-1 text-sm text-fg-base"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-fg-muted">
                    To
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (isValidDateString(v)) {
                          onChange(
                            setCustomDateRange(state, customFrom as YYYYMMDD, v),
                          );
                        }
                      }}
                      className="rounded-md border border-border bg-bg-overlay px-2 py-1 text-sm text-fg-base"
                    />
                  </label>
                </div>
              )}
            </Section>

            <MultiBucketControl
              label="Time of day"
              buckets={TOD_BANDS_DISPLAY}
              selected={state.timeOfDay}
              onToggle={(b) => onChange(toggleTimeOfDay(state, b))}
            />

            <MultiBucketControl
              label="Day of week"
              buckets={DAY_BUCKETS}
              selected={state.dayOfWeek}
              onToggle={(d) => onChange(toggleDayOfWeek(state, d))}
            />
          </Group>

          <Group title="What">
            <Section heading="Coin">
              <label htmlFor="filter-coin" className="sr-only">
                Coin
              </label>
              <select
                id="filter-coin"
                value={state.coin ?? ''}
                onChange={(e) =>
                  onChange(
                    setCoin(state, e.target.value === '' ? null : e.target.value),
                  )
                }
                className="w-full rounded-md border border-border bg-bg-overlay px-3 py-1.5 text-sm text-fg-base"
              >
                <option value="">All coins</option>
                {availableCoins.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Section>

            <Section heading="Side">
              <SegmentedControl<Side>
                ariaLabel="Filter by side"
                value={state.side}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'long', label: 'Long' },
                  { value: 'short', label: 'Short' },
                ]}
                onChange={(v) => onChange(setSide(state, v))}
              />
            </Section>
          </Group>

          <Group title="Outcome / shape">
            <Section heading="Status">
              <SegmentedControl<Status>
                ariaLabel="Filter by status"
                value={state.status}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'closed', label: 'Closed' },
                  { value: 'open', label: 'Open' },
                ]}
                onChange={(v) => onChange(setStatus(state, v))}
              />
            </Section>

            <Section heading="Outcome">
              <SegmentedControl<Outcome>
                ariaLabel="Filter by outcome"
                value={state.outcome}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'winner', label: 'Winners' },
                  { value: 'loser', label: 'Losers' },
                ]}
                onChange={(v) => onChange(setOutcome(state, v))}
              />
            </Section>

            <MultiBucketControl
              label="Hold duration"
              buckets={HOLD_BUCKETS_DISPLAY}
              selected={state.holdDuration}
              onToggle={(b) => onChange(toggleHoldDuration(state, b))}
            />

            <MultiBucketControl
              label="Trade size"
              buckets={SIZE_BUCKETS_DISPLAY}
              selected={state.tradeSize}
              onToggle={(b) => onChange(toggleTradeSize(state, b))}
            />
          </Group>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
        {title}
      </h2>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-fg-base">{heading}</h3>
      {children}
    </section>
  );
}

function PresetButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        active
          ? 'border-accent bg-accent/20 text-fg-base'
          : 'border-border bg-bg-overlay text-fg-muted hover:text-fg-base',
      )}
    >
      {children}
    </button>
  );
}

type Option<T extends string> = { value: T; label: string };

function SegmentedControl<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: T;
  options: ReadonlyArray<Option<T>>;
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex rounded-md border border-border bg-bg-overlay p-0.5"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex-1 rounded-md px-3 py-1 text-xs ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            value === opt.value
              ? 'bg-bg-raised text-fg-base shadow-sm'
              : 'text-fg-muted hover:text-fg-base',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
