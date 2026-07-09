import { createStore } from 'zustand/vanilla';

export type Route =
  | 'overview'
  | 'snapshots'
  | 'leaks'
  | 'detached'
  | 'react'
  | 'listeners'
  | 'observers'
  | 'caches'
  | 'timeline'
  | 'insights'
  | 'settings';

export interface UiSlice {
  route: Route;
  selectedCandidateId: string | null;
  paletteOpen: boolean;
  navigate: (route: Route) => void;
  selectCandidate: (id: string | null) => void;
  setPaletteOpen: (open: boolean) => void;
}

export function createUiStore() {
  return createStore<UiSlice>()((set) => ({
    route: 'overview',
    selectedCandidateId: null,
    paletteOpen: false,
    navigate: (route) => set({ route }),
    selectCandidate: (selectedCandidateId) => set({ selectedCandidateId }),
    setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  }));
}

export type UiStore = ReturnType<typeof createUiStore>;
