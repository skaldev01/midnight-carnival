import type { Screenplay } from "@/types/screenplay";
import type { Suggestion } from "@/types/suggestion";

/**
 * Find the first scene element whose content exactly matches `oldText`.
 * Returns -1 if not found.
 */
export function findMatchIndex(
  screenplay: Screenplay | null,
  oldText: string
): number {
  if (!screenplay) return -1;
  return screenplay.scenes.findIndex((el) => el.content === oldText);
}

/**
 * Replace the first matching element's content with `newText`. Returns
 * `null` if no match is found (caller decides what to do — typically
 * mark the suggestion rejected/orphaned).
 */
export function applySuggestion(
  screenplay: Screenplay,
  suggestion: Suggestion
): Screenplay | null {
  const idx = findMatchIndex(screenplay, suggestion.oldText);
  if (idx < 0) return null;
  const scenes = screenplay.scenes.slice();
  scenes[idx] = { ...scenes[idx], content: suggestion.newText };
  return { ...screenplay, scenes };
}
