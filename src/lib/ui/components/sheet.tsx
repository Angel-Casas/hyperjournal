import { forwardRef, type ComponentPropsWithoutRef, type HTMLAttributes } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@lib/ui/utils';

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetPortal = Dialog.Portal;
export const SheetClose = Dialog.Close;

const SheetOverlay = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Dialog.Overlay>
>(({ className, ...props }, ref) => (
  <Dialog.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-40 bg-bg-base/60 backdrop-blur-sm',
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = 'SheetOverlay';

type SheetContentProps = ComponentPropsWithoutRef<typeof Dialog.Content> & {
  side?: 'right' | 'bottom';
};

export const SheetContent = forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, side = 'right', children, ...props }, ref) => (
    <SheetPortal>
      <SheetOverlay />
      <Dialog.Content
        ref={ref}
        aria-describedby={undefined}
        className={cn(
          'fixed z-50 flex flex-col gap-4 border border-border bg-bg-raised p-6 shadow-lg',
          'transition-transform duration-200 ease-out',
          side === 'right' &&
            'inset-y-0 right-0 h-full w-full max-w-sm data-[state=closed]:translate-x-full data-[state=open]:translate-x-0',
          side === 'bottom' &&
            'inset-x-0 bottom-0 max-h-[90vh] w-full data-[state=closed]:translate-y-full data-[state=open]:translate-y-0',
          className,
        )}
        {...props}
      >
        {children}
      </Dialog.Content>
    </SheetPortal>
  ),
);
SheetContent.displayName = 'SheetContent';

export function SheetHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-between gap-2', className)}
      {...props}
    />
  );
}

export const SheetTitle = forwardRef<
  HTMLHeadingElement,
  ComponentPropsWithoutRef<typeof Dialog.Title>
>(({ className, ...props }, ref) => (
  <Dialog.Title
    ref={ref}
    className={cn('text-lg font-semibold text-fg-base', className)}
    {...props}
  />
));
SheetTitle.displayName = 'SheetTitle';

export const SheetDescription = forwardRef<
  HTMLParagraphElement,
  ComponentPropsWithoutRef<typeof Dialog.Description>
>(({ className, ...props }, ref) => (
  <Dialog.Description
    ref={ref}
    className={cn('text-sm text-fg-muted', className)}
    {...props}
  />
));
SheetDescription.displayName = 'SheetDescription';
