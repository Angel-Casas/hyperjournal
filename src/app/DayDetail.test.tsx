import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DayDetail } from './DayDetail';

afterEach(() => cleanup());

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<div data-testid="home">home</div>} />
          <Route path="/d/:date" element={<DayDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DayDetail', () => {
  it('redirects to / when the date is invalid', async () => {
    renderAt('/d/not-a-date');
    await waitFor(() => expect(screen.getByTestId('home')).toBeInTheDocument());
  });

  it('redirects to / when the date is impossible', async () => {
    renderAt('/d/2025-02-30');
    await waitFor(() => expect(screen.getByTestId('home')).toBeInTheDocument());
  });

  it('renders the date header and SessionJournalForm for a valid date', async () => {
    renderAt('/d/2026-04-22');
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/2026/);
    expect(screen.getByRole('heading', { level: 2, name: /^journal$/i })).toBeInTheDocument();
  });
});
