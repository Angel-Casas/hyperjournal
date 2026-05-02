import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MultiBucketControl } from './multi-bucket-control';

const BUCKETS = [
  { id: 'a' as const, label: 'Alpha' },
  { id: 'b' as const, label: 'Beta' },
  { id: 'c' as const, label: 'Gamma' },
];

describe('MultiBucketControl', () => {
  it('renders every bucket label', () => {
    render(
      <MultiBucketControl
        label="Test"
        buckets={BUCKETS}
        selected={[]}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('aria-pressed reflects selection', () => {
    render(
      <MultiBucketControl
        label="Test"
        buckets={BUCKETS}
        selected={['b']}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText('Alpha').closest('button')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByText('Beta').closest('button')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('fires onToggle with the bucket id when clicked', () => {
    const onToggle = vi.fn();
    render(
      <MultiBucketControl
        label="Test"
        buckets={BUCKETS}
        selected={[]}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByText('Beta'));
    expect(onToggle).toHaveBeenCalledWith('b');
  });

  it('renders the section label as a heading', () => {
    render(
      <MultiBucketControl
        label="Hold duration"
        buckets={BUCKETS}
        selected={[]}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText('Hold duration')).toBeInTheDocument();
  });

  it('exposes the group via accessible name', () => {
    render(
      <MultiBucketControl
        label="Hold"
        buckets={BUCKETS}
        selected={[]}
        onToggle={() => {}}
      />,
    );
    const group = screen.getByRole('group', { name: /hold/i });
    expect(group).toBeInTheDocument();
  });
});
