import type { Provenance } from '@entities/provenance';
import { cn } from '@lib/ui/utils';

type Tone = 'neutral' | 'gain' | 'loss' | 'risk';

type Props = {
  label: string;
  value: string;
  tone?: Tone;
  provenance?: Provenance;
  subtext?: string;
};

const toneClass: Record<Tone, string> = {
  neutral: 'text-fg-base',
  gain: 'text-gain',
  loss: 'text-loss',
  risk: 'text-risk',
};

const provenanceColor: Record<Provenance, string> = {
  observed: 'bg-gain',
  derived: 'bg-accent',
  inferred: 'bg-risk',
  unknown: 'bg-fg-subtle',
};

export function MetricCard({
  label,
  value,
  tone = 'neutral',
  provenance,
  subtext,
}: Props) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-bg-raised p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-fg-muted">
          {label}
        </p>
        {provenance && (
          <span
            data-provenance={provenance}
            title={`Provenance: ${provenance}`}
            className={cn('h-2 w-2 rounded-full', provenanceColor[provenance])}
            aria-hidden
          />
        )}
      </div>
      <p className={cn('font-mono text-2xl font-semibold tabular-nums', toneClass[tone])}>
        {value}
      </p>
      {subtext && <p className="text-xs text-fg-subtle">{subtext}</p>}
    </div>
  );
}
