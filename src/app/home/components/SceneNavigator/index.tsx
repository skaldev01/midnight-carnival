"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SceneEntry } from "@/hooks/useSceneIndex";
import { ChevronDownIcon } from "../icons";

// ─────────────────────────────────────────────────────────────────────────────
// Jump-to-scene implementation
// ─────────────────────────────────────────────────────────────────────────────
// We query the live DOM for scene paragraphs using the data-element attribute
// that the TipTap ScreenplayElement extension renders. The Nth paragraph with
// data-element="scene" corresponds exactly to sceneEntries[N-1] (1-based).
//
// Scrolling targets the .script-scroll container (the overflowing div) rather
// than calling scrollIntoView() on the element itself, so we can place the
// target scene at a comfortable reading position instead of flush-at-top.
// ─────────────────────────────────────────────────────────────────────────────

function jumpToScene(sceneNumber: number): void {
  // sceneNumber is 1-based.
  const allSceneNodes = document.querySelectorAll<HTMLElement>(
    '.script-editor .ProseMirror p[data-element="scene"]'
  );
  const target = allSceneNodes[sceneNumber - 1];
  if (!target) return;

  // Walk up to find the scrollable ancestor (.script-scroll).
  let scrollEl: HTMLElement | null = target.parentElement;
  while (scrollEl && !scrollEl.classList.contains("script-scroll")) {
    scrollEl = scrollEl.parentElement;
  }

  if (scrollEl) {
    // Offset the target so it lands ~80px below the sticky format-bar.
    const OFFSET = 88;
    const containerTop = scrollEl.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top;
    const relativeTop = targetTop - containerTop + scrollEl.scrollTop - OFFSET;
    scrollEl.scrollTo({ top: relativeTop, behavior: "smooth" });
  } else {
    // Fallback for unexpected layouts.
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  scenes: SceneEntry[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Search / filter helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter scenes by query. Supports:
 *   - "25"       → jump directly to scene 25
 *   - "OFFICE"   → filter by heading substring (case-insensitive)
 *   - "ext park" → all words must appear in the heading
 */
function filterScenes(scenes: SceneEntry[], query: string): SceneEntry[] {
  const q = query.trim();
  if (!q) return scenes;

  // Pure number → filter to that scene number only.
  const asNum = parseInt(q, 10);
  if (!isNaN(asNum) && String(asNum) === q) {
    return scenes.filter((s) => s.sceneNumber === asNum);
  }

  // Text → every word must appear in the title.
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return scenes.filter((s) =>
    words.every((w) => s.title.toLowerCase().includes(w))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function SceneNavigator({ scenes }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => filterScenes(scenes, query), [scenes, query]);

  // ── Reset active index when filter changes ────────────────────────────────
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // ── Focus search input when dropdown opens ────────────────────────────────
  useEffect(() => {
    if (open) {
      // rAF so the element is visible before focus.
      requestAnimationFrame(() => searchRef.current?.focus());
    } else {
      setQuery("");
    }
  }, [open]);

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // ── Close on Escape ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // ── Select a scene entry ──────────────────────────────────────────────────
  const select = useCallback((entry: SceneEntry) => {
    setOpen(false);
    setQuery("");
    jumpToScene(entry.sceneNumber);
  }, []);

  // ── Keyboard navigation inside the list ──────────────────────────────────
  const onSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
        scrollActiveIntoView(listRef.current, Math.min(activeIdx + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        scrollActiveIntoView(listRef.current, Math.max(activeIdx - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const entry = filtered[activeIdx];
        if (entry) select(entry);
      }
    },
    [filtered, activeIdx, select]
  );

  // Nothing to show when there are no scenes.
  if (scenes.length === 0) return null;

  const label =
    scenes.length === 1
      ? "1 scene"
      : `${scenes.length} scenes`;

  return (
    <div className="scene-nav" ref={containerRef}>
      <button
        type="button"
        className={`scene-nav-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Scene navigator"
        title="Jump to scene"
      >
        <span className="scene-nav-label">Scenes</span>
        <span className="scene-nav-count">{label}</span>
        <ChevronDownIcon
          className={`scene-nav-chevron${open ? " flipped" : ""}`}
          width={11}
          height={11}
        />
      </button>

      {open && (
        <div className="scene-nav-panel" role="dialog" aria-label="Scene list">
          {/* Search / go-to input */}
          <div className="scene-nav-search-wrap">
            <input
              ref={searchRef}
              className="scene-nav-search"
              type="text"
              placeholder="Search or go to scene #…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              autoComplete="off"
              spellCheck={false}
              aria-label="Search scenes"
            />
          </div>

          {/* Scene list */}
          <ul
            ref={listRef}
            className="scene-nav-list"
            role="listbox"
            aria-label="Scenes"
          >
            {filtered.length === 0 ? (
              <li className="scene-nav-empty">No scenes match</li>
            ) : (
              filtered.map((entry, i) => (
                <li
                  key={entry.elementIndex}
                  role="option"
                  aria-selected={i === activeIdx}
                  className={`scene-nav-item${i === activeIdx ? " active" : ""}`}
                  onPointerEnter={() => setActiveIdx(i)}
                  onClick={() => select(entry)}
                >
                  <span className="scene-nav-num">{entry.sceneNumber}</span>
                  <span className="scene-nav-title">{entry.title}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function scrollActiveIntoView(list: HTMLUListElement | null, idx: number) {
  if (!list) return;
  const item = list.children[idx] as HTMLElement | undefined;
  item?.scrollIntoView({ block: "nearest" });
}
