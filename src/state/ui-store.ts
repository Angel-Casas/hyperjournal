import { create } from 'zustand';

type UiState = {
  theme: 'dark';
};

export const useUiStore = create<UiState>(() => ({
  theme: 'dark',
}));
