import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { TagInput } from './tag-input';

afterEach(() => cleanup());

function Harness({
  initial = [],
  suggestions = [],
  onChange,
  onBlur,
}: {
  initial?: ReadonlyArray<string>;
  suggestions?: ReadonlyArray<string>;
  onChange?: (tags: ReadonlyArray<string>) => void;
  onBlur?: () => void;
}) {
  const [value, setValue] = useState<ReadonlyArray<string>>(initial);
  return (
    <TagInput
      id="t"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      {...(onBlur ? { onBlur } : {})}
      suggestions={suggestions}
      placeholder="Add tags"
    />
  );
}

describe('TagInput', () => {
  it('renders each existing chip with its label', () => {
    render(<Harness initial={['breakout', 'fomc']} />);
    expect(screen.getByText('breakout')).toBeInTheDocument();
    expect(screen.getByText('fomc')).toBeInTheDocument();
  });

  it('Enter commits the typed text as a new normalized chip', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: '  Breakout  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['breakout']);
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('comma commits the typed text as a new chip', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'revenge trade' } });
    fireEvent.keyDown(input, { key: ',' });
    expect(onChange).toHaveBeenCalledWith(['revenge trade']);
  });

  it('Backspace in empty input removes the last chip', () => {
    const onChange = vi.fn();
    render(<Harness initial={['a', 'b']} onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('suggestion dropdown filters by startsWith on the normalized input', () => {
    render(<Harness suggestions={['breakout', 'fade', 'fomc']} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'f' } });
    expect(screen.getByRole('option', { name: 'fade' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'fomc' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'breakout' })).toBeNull();
  });

  it('ArrowDown + Enter picks the highlighted suggestion', () => {
    const onChange = vi.fn();
    render(<Harness suggestions={['breakout', 'fomc']} onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'f' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['fomc']);
  });

  it('blur commits any pending text and fires onBlur', () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();
    render(<Harness onChange={onChange} onBlur={onBlur} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'late' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(['late']);
    expect(onBlur).toHaveBeenCalled();
  });
});
