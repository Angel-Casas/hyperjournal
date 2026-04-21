import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-bg-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-accent text-fg-base hover:bg-accent/90',
        secondary: 'bg-bg-overlay text-fg-base hover:bg-bg-overlay/80',
        ghost: 'text-fg-muted hover:bg-bg-overlay hover:text-fg-base',
        outline: 'border border-border bg-transparent text-fg-base hover:bg-bg-overlay',
        destructive: 'bg-loss text-fg-base hover:bg-loss/90',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);
