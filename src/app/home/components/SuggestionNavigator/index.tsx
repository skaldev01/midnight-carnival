"use client";

import type { SuggestionNavigatorHandle } from "@/hooks/useSuggestionNavigator";
import { ChevronUpIcon, ChevronDownIcon } from "../icons";

type Props = {
  nav: SuggestionNavigatorHandle;
  total: number;
};

/**
 * Floating pill that lives inside .script-scroll (position: sticky at bottom).
 * Shows "3 / 18 changes" and Prev / Next buttons.
 * Keyboard hint: Alt ↑ / Alt ↓.
 */
export default function SuggestionNavigator({ nav, total }: Props) {
  if (total === 0) return null;

  const current = nav.focusedIndex + 1;

  return (
    <div className="sugg-nav" role="navigation" aria-label="Suggestion navigation">
      <button
        type="button"
        className="sugg-nav-btn"
        onClick={nav.prev}
        disabled={!nav.hasPrev}
        aria-label="Previous suggestion (Alt + Up)"
        title="Previous suggestion (Alt + ↑)"
      >
        <ChevronUpIcon width={13} height={13} />
      </button>

      <span className="sugg-nav-counter" aria-live="polite" aria-atomic="true">
        <span className="sugg-nav-current">{current}</span>
        <span className="sugg-nav-sep"> / </span>
        <span className="sugg-nav-total">{total}</span>
        <span className="sugg-nav-label"> changes</span>
      </span>

      <button
        type="button"
        className="sugg-nav-btn"
        onClick={nav.next}
        disabled={!nav.hasNext}
        aria-label="Next suggestion (Alt + Down)"
        title="Next suggestion (Alt + ↓)"
      >
        <ChevronDownIcon width={13} height={13} />
      </button>
    </div>
  );
}
