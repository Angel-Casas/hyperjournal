import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createWalletsRepo } from '@lib/storage/wallets-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import type { Wallet, WalletAddress } from '@entities/wallet';

const KEY = ['saved-wallets'] as const;

type Options = { db?: HyperJournalDb };

export function useSavedWallets({ db = defaultDb }: Options = {}) {
  const repo = createWalletsRepo(db);
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: KEY,
    queryFn: () => repo.list(),
  });

  const save = useMutation({
    mutationFn: (wallet: Wallet) => repo.save(wallet),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const remove = useMutation({
    mutationFn: (address: WalletAddress) => repo.remove(address),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return { list, save, remove };
}
