import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from './sheet';

function Harness({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" aria-labelledby="title">
        <SheetHeader>
          <SheetTitle id="title">Filters</SheetTitle>
          <SheetClose>Close</SheetClose>
        </SheetHeader>
        <div>Body content</div>
      </SheetContent>
    </Sheet>
  );
}

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(<Harness initialOpen={false} />);
    expect(screen.queryByText('Body content')).toBeNull();
  });

  it('renders content when open', () => {
    render(<Harness initialOpen={true} />);
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('SheetTitle is the accessible name', () => {
    render(<Harness initialOpen={true} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Filters');
  });
});
