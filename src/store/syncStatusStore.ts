"use client";

import { create } from "zustand";

interface SyncStatusState {
  /** Number of pending (debounced) + in-flight Drive pushes. */
  pending: number;
  setPending: (n: number) => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  pending: 0,
  setPending: (n) => set({ pending: Math.max(0, n) }),
}));
