"use client";

import type { ScreenplayElementType } from "@/types/screenplay";

const OPTIONS: { id: ScreenplayElementType; label: string }[] = [
  { id: "scene", label: "Scene" },
  { id: "action", label: "Action" },
  { id: "character", label: "Character" },
  { id: "parenthetical", label: "Parenthetical" },
  { id: "dialogue", label: "Dialogue" },
];

type Props = {
  current: ScreenplayElementType;
  onChange: (type: ScreenplayElementType) => void;
};

export default function FormatBar({ current, onChange }: Props) {
  return (
    <div className="format-bar" role="toolbar" aria-label="Screenplay element type">
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`format-btn${current === opt.id ? " active" : ""}`}
          onClick={() => onChange(opt.id)}
          aria-pressed={current === opt.id}
        >
          {opt.label}
        </button>
      ))}
      <span className="format-hint">Tab / Shift+Tab to cycle</span>
    </div>
  );
}
