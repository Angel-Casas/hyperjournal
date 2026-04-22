import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ImportPanel } from './ImportPanel';
import { HyperJournalDb } from '@lib/storage/db';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let db: HyperJournalDb;

beforeEach(async () => {
  db = new HyperJournalDb(`import-panel-test-${Math.random().toString(36).slice(2)}`);
  await db.open();
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ImportPanel db={db} />
    </QueryClientProvider>,
  );
}

const validFile = {
  app: 'HyperJournal',
  formatVersion: 1,
  exportedAt: 1714000000000,
  data: {
    wallets: [
      { address: '0x0000000000000000000000000000000000000001', label: null, addedAt: 1 },
    ],
    userSettings: null,
  },
};

function fileFrom(obj: unknown): File {
  return new File([JSON.stringify(obj)], 'export.json', { type: 'application/json' });
}

describe('ImportPanel', () => {
  it('renders a file input labelled Import', () => {
    renderPanel();
    expect(screen.getByLabelText(/import/i)).toBeInTheDocument();
  });

  it('shows a summary after selecting a valid file', async () => {
    renderPanel();
    const input = screen.getByLabelText(/import/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileFrom(validFile)] } });
    await waitFor(() => {
      expect(screen.getByText(/will import/i)).toBeInTheDocument();
      expect(screen.getByText(/1 wallet/i)).toBeInTheDocument();
    });
  });

  it('commits the import when Confirm is clicked', async () => {
    renderPanel();
    const input = screen.getByLabelText(/import/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileFrom(validFile)] } });
    await waitFor(() => expect(screen.getByText(/will import/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^confirm import$/i }));
    await waitFor(() => expect(screen.getByText(/import complete/i)).toBeInTheDocument());
    const rows = await db.wallets.toArray();
    expect(rows).toHaveLength(1);
  });

  it('Cancel discards the staged import without writing', async () => {
    renderPanel();
    const input = screen.getByLabelText(/import/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileFrom(validFile)] } });
    await waitFor(() => expect(screen.getByText(/will import/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() =>
      expect(screen.queryByText(/will import/i)).not.toBeInTheDocument(),
    );
    expect(await db.wallets.count()).toBe(0);
  });

  it('shows JSON-parse copy for a malformed file', async () => {
    renderPanel();
    const bad = new File(['not-json'], 'bad.json', { type: 'application/json' });
    const input = screen.getByLabelText(/import/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [bad] } });
    await waitFor(() => expect(screen.getByText(/valid JSON/i)).toBeInTheDocument());
  });

  it('shows the newer-version copy for a formatVersion-2 file', async () => {
    renderPanel();
    const input = screen.getByLabelText(/import/i) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [fileFrom({ ...validFile, formatVersion: 2 })] },
    });
    await waitFor(() => expect(screen.getByText(/newer version/i)).toBeInTheDocument());
  });
});
