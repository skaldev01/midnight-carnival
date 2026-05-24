"use client";

import { create } from "zustand";

export type ToastKind = "success" | "error" | "warning";

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  /** Optional stable key — pushes with the same key replace each other
   * instead of stacking. Use for repeating background events like Drive sync. */
  key?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (input: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 4000,
  warning: 6000,
  error: 7000,
};

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (input) => {
    const id = makeId();
    set((state) => {
      const filtered = input.key
        ? state.toasts.filter((t) => t.key !== input.key)
        : state.toasts;
      return { toasts: [...filtered, { ...input, id }] };
    });

    if (typeof window !== "undefined") {
      window.setTimeout(() => get().dismiss(id), DEFAULT_DURATION[input.kind]);
    }
  },

  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

export function toast(input: Omit<Toast, "id">) {
  useToastStore.getState().push(input);
}
