"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Suggestion } from "@/types/suggestion";

// ─────────────────────────────────────────────────────────────────────────────
// Scroll helper
// ─────────────────────────────────────────────────────────────────────────────
// Each suggestion block carries `data-suggestion-id="<id>"`.
// We walk up from the block to find the .script-scroll container and scroll
// it so the suggestion lands 80px below the top of the viewport (below the
// sticky header / format-bar).

const SCROLL_OFFSET_PX = 80;

function scrollToSuggestion(id: string): void {
  const el = document.querySelector<HTMLElement>(
    `[data-suggestion-id="${CSS.escape(id)}"]`
  );
  if (!el) return;

  let scrollEl: HTMLElement | null = el.parentElement;
  while (scrollEl && !scrollEl.classList.contains("script-scroll")) {
    scrollEl = scrollEl.parentElement;
  }

  if (scrollEl) {
    const containerTop = scrollEl.getBoundingClientRect().top;
    const elTop = el.getBoundingClientRect().top;
    const target = elTop - containerTop + scrollEl.scrollTop - SCROLL_OFFSET_PX;
    scrollEl.scrollTo({ top: target, behavior: "smooth" });
  } else {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export type SuggestionNavigatorHandle = {
  /** 0-based index into pending[] of the currently focused suggestion. */
  focusedIndex: number;
  focusedId: string | null;
  hasPrev: boolean;
  hasNext: boolean;
  prev: () => void;
  next: () => void;
  /** Jump to a specific suggestion by its store id. */
  jumpTo: (id: string) => void;
  /**
   * Call this right after accepting or rejecting a suggestion.
   * It advances to the next suggestion in the list that will survive
   * after the pending array shrinks by one.
   *
   * @param resolvedId  the id that was just accepted/rejected
   * @param direction   "next" (default) or "prev"
   */
  jumpAfterResolve: (resolvedId: string, direction?: "next" | "prev") => void;
};

export function useSuggestionNavigator(
  pending: Suggestion[]
): SuggestionNavigatorHandle {
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Clamp whenever the pending list shrinks (accept/reject removes an item).
  useEffect(() => {
    if (pending.length === 0) {
      setFocusedIndex(0);
      return;
    }
    setFocusedIndex((prev) => Math.min(prev, pending.length - 1));
  }, [pending.length]);

  // Scroll to the focused suggestion whenever the index or list changes.
  // We use a ref-guarded effect so we only scroll on intentional navigation,
  // not on every store update that happens to keep the same index.
  const lastScrolledId = useRef<string | null>(null);

  useEffect(() => {
    const id = pending[focusedIndex]?.id ?? null;
    if (!id || id === lastScrolledId.current) return;
    lastScrolledId.current = id;
    scrollToSuggestion(id);
  }, [focusedIndex, pending]);

  const focusedId = pending[focusedIndex]?.id ?? null;

  const prev = useCallback(() => {
    setFocusedIndex((i) => {
      const next = Math.max(0, i - 1);
      // Force a scroll even if the index doesn't change (wrap-around at 0).
      lastScrolledId.current = null;
      return next;
    });
  }, []);

  const next = useCallback(() => {
    setFocusedIndex((i) => {
      const n = Math.min(i + 1, pending.length - 1);
      lastScrolledId.current = null;
      return n;
    });
  }, [pending.length]);

  const jumpTo = useCallback(
    (id: string) => {
      const idx = pending.findIndex((s) => s.id === id);
      if (idx < 0) return;
      lastScrolledId.current = null;
      setFocusedIndex(idx);
    },
    [pending]
  );

  const jumpAfterResolve = useCallback(
    (resolvedId: string, direction: "next" | "prev" = "next") => {
      const idx = pending.findIndex((s) => s.id === resolvedId);
      if (idx < 0) return;

      // After the resolved item is removed, the pending array will be one
      // shorter. Compute the next focus in the post-removal list.
      const remaining = pending.length - 1;
      if (remaining === 0) {
        setFocusedIndex(0);
        return;
      }

      if (direction === "next") {
        // Stay at the same index — the next item will slide into this slot.
        // If this was the last item, go back one.
        const nextIdx = idx < remaining ? idx : remaining - 1;
        lastScrolledId.current = null;
        setFocusedIndex(nextIdx);
      } else {
        const prevIdx = Math.max(0, idx - 1);
        lastScrolledId.current = null;
        setFocusedIndex(prevIdx);
      }
    },
    [pending]
  );

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Alt + Down → next suggestion
      if (e.altKey && e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((i) => {
          const n = Math.min(i + 1, pending.length - 1);
          lastScrolledId.current = null;
          return n;
        });
      }
      // Alt + Up → previous suggestion
      if (e.altKey && e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((i) => {
          const n = Math.max(0, i - 1);
          lastScrolledId.current = null;
          return n;
        });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending.length]);

  return {
    focusedIndex,
    focusedId,
    hasPrev: focusedIndex > 0,
    hasNext: focusedIndex < pending.length - 1,
    prev,
    next,
    jumpTo,
    jumpAfterResolve,
  };
}
