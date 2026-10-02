import { create } from "zustand";

const MAX_COMPARE = 4;

interface CompareState {
  selectedIds: string[];
  /** Returns 'added' | 'removed' | 'full' so callers can show the appropriate toast. */
  toggle: (id: string) => "added" | "removed" | "full";
  remove: (id: string) => void;
  clear: () => void;
  isSelected: (id: string) => boolean;
}

export const useCompareStore = create<CompareState>((set, get) => ({
  selectedIds: [],

  toggle: (id) => {
    const { selectedIds } = get();
    if (selectedIds.includes(id)) {
      set({ selectedIds: selectedIds.filter((s) => s !== id) });
      return "removed";
    }
    if (selectedIds.length >= MAX_COMPARE) {
      return "full";
    }
    set({ selectedIds: [...selectedIds, id] });
    return "added";
  },

  remove: (id) => set((s) => ({ selectedIds: s.selectedIds.filter((x) => x !== id) })),

  clear: () => set({ selectedIds: [] }),

  isSelected: (id) => get().selectedIds.includes(id),
}));
