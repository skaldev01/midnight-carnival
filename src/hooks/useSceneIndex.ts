"use client";

import { useMemo } from "react";
import type { Screenplay } from "@/types/screenplay";

export type SceneEntry = {
  /** 1-based scene number shown to the user. */
  sceneNumber: number;
  /** The heading text, e.g. "INT. OFFICE - NIGHT". */
  title: string;
  /**
   * Zero-based index of this scene element inside screenplay.scenes[].
   * Used as the key for the data-scene-index DOM attribute so the
   * navigator can scroll directly to the right paragraph.
   */
  elementIndex: number;
};

/**
 * Derive a flat, numbered list of scene-heading entries from the screenplay.
 * Result is memoised on the scenes array reference so it only recomputes when
 * the script is actually edited, not on every render.
 */
export function useSceneIndex(script: Screenplay | null): SceneEntry[] {
  return useMemo(() => {
    if (!script) return [];

    const entries: SceneEntry[] = [];
    let sceneNumber = 0;

    for (let i = 0; i < script.scenes.length; i++) {
      const el = script.scenes[i];
      if (el.type === "scene") {
        sceneNumber++;
        entries.push({
          sceneNumber,
          title: el.content.trim() || `Scene ${sceneNumber}`,
          elementIndex: i,
        });
      }
    }

    return entries;
  }, [script]);
}
