import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SplitHome } from './SplitHome';

describe('SplitHome', () => {
  it('renders the analytics and journal panels side by side', () => {
    render(<SplitHome />);
    expect(
      screen.getByRole('heading', { name: /trading analytics/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /journal & coaching/i }),
    ).toBeInTheDocument();
  });
});
