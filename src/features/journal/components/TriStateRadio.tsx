import { cn } from '@lib/ui/utils';

type Props = {
  legend: string;
  name: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  onBlur?: () => void;
};

type Option = { label: string; value: boolean | null };

const OPTIONS: ReadonlyArray<Option> = [
  { label: 'Yes', value: true },
  { label: 'No', value: false },
  { label: 'Unanswered', value: null },
];

/**
 * Three-option radio group: Yes / No / Unanswered. Used for
 * planFollowed and stopLossUsed on the trade journal form. Unanswered
 * is the default and is a first-class value — forcing users to pick
 * Yes or No up front would push them toward whichever is less
 * emotionally loaded.
 */
export function TriStateRadio({ legend, name, value, onChange, onBlur }: Props) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-fg-base">{legend}</legend>
      <div className="flex flex-wrap gap-3 text-sm text-fg-base">
        {OPTIONS.map((opt) => {
          const id = `${name}-${opt.label.toLowerCase()}`;
          const checked = value === opt.value;
          return (
            <label
              key={opt.label}
              htmlFor={id}
              className="flex cursor-pointer items-center gap-2"
            >
              <input
                id={id}
                name={name}
                type="radio"
                checked={checked}
                onChange={() => onChange(opt.value)}
                {...(onBlur ? { onBlur } : {})}
                className={cn(
                  'h-4 w-4 border-border bg-bg-overlay text-accent ring-offset-bg-base',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                )}
              />
              <span>{opt.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
