import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TagChipList } from './TagChipList';

afterEach(() => cleanup());

describe('TagChipList', () => {
  it('renders null when the tags array is empty', () => {
    const { container } = render(<TagChipList tags={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders each tag as a chip', () => {
    render(<TagChipList tags={['breakout', 'fomc']} />);
    expect(screen.getByText('breakout')).toBeInTheDocument();
    expect(screen.getByText('fomc')).toBeInTheDocument();
  });

  it('shows +N more when there are more tags than max', () => {
    render(<TagChipList tags={['a', 'b', 'c', 'd', 'e']} max={3} />);
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('c')).toBeInTheDocument();
    expect(screen.queryByText('d')).toBeNull();
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });
});
