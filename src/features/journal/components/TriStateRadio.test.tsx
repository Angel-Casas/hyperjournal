import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TriStateRadio } from './TriStateRadio';

afterEach(() => cleanup());

// Controlled wrapper — radios only fire onChange when the checked prop
// actually changes, so the test must maintain state across clicks.
function Controlled({
  onChange,
  initial = null,
}: {
  onChange: (v: boolean | null) => void;
  initial?: boolean | null;
}) {
  const [v, setV] = useState<boolean | null>(initial);
  return (
    <TriStateRadio
      legend="Plan followed?"
      name="plan"
      value={v}
      onChange={(next) => {
        setV(next);
        onChange(next);
      }}
    />
  );
}

describe('TriStateRadio', () => {
  it('renders three options with the given label', () => {
    render(<TriStateRadio legend="Plan followed?" name="plan" value={null} onChange={() => {}} />);
    expect(screen.getByText('Plan followed?')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /yes/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /no/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /unanswered/i })).toBeInTheDocument();
  });

  it('marks the Unanswered radio as checked when value is null', () => {
    render(<TriStateRadio legend="Plan followed?" name="plan" value={null} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /unanswered/i })).toBeChecked();
  });

  it('marks Yes / No when the value matches', () => {
    const { rerender } = render(
      <TriStateRadio legend="Plan followed?" name="plan" value={true} onChange={() => {}} />,
    );
    expect(screen.getByRole('radio', { name: /yes/i })).toBeChecked();
    rerender(<TriStateRadio legend="Plan followed?" name="plan" value={false} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /no/i })).toBeChecked();
  });

  it('fires onChange with the mapped value on click', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /yes/i }));
    expect(onChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('radio', { name: /no/i }));
    expect(onChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('radio', { name: /unanswered/i }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('fires onBlur when any radio loses focus', () => {
    const onBlur = vi.fn();
    render(
      <TriStateRadio legend="Plan followed?" name="plan" value={null} onChange={() => {}} onBlur={onBlur} />,
    );
    const yes = screen.getByRole('radio', { name: /yes/i });
    fireEvent.blur(yes);
    expect(onBlur).toHaveBeenCalled();
  });
});
