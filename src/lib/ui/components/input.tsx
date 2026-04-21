import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@lib/ui/utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-border bg-bg-overlay px-3 py-2 text-sm text-fg-base ring-offset-bg-base placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-loss aria-[invalid=true]:ring-loss',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
