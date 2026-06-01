import type { Screenplay } from "@/types/screenplay";
import type { Suggestion } from "@/types/suggestion";
import type { Provider } from "@/types/chat";
import {
  findBestMatch,
  MATCH_THRESHOLD,
} from "@/services/feedback/feedbackTransformer";

export type RawSuggestion = {
  oldText?: unknown;
  newText?: unknown;
  type?: unknown;
};

function makeSuggestionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Resolve a raw oldText to the canonical content string of a scene element.
 *
 * Resolution order:
 *   1. Exact character match — instant accept, no scoring needed.
 *   2. findBestMatch — scored composite (Jaccard + Levenshtein + substring).
 *      Accepts matches scoring ≥ MATCH_THRESHOLD (0.55).
 *
 * Logs the match method and confidence for every resolution so failures are
 * diagnosable in the browser console.
 */
function resolveOldText(
  rawOldText: string,
  scenes: Screenplay["scenes"]
): string | null {
  // 1. Exact match — free, always try first.
  const exactEl = scenes.find((el) => el.content === rawOldText);
  if (exactEl) {
    console.info(
      `[suggestionFilter] exact    100%  "${rawOldText.slice(0, 50)}"`
    );
    return exactEl.content;
  }

  // 2. Scored fuzzy match.
  const best = findBestMatch(rawOldText, scenes);
  if (best) {
    console.info(
      `[suggestionFilter] ${best.method.padEnd(9)} ${Math.round(best.score * 100)}%  ` +
        `"${rawOldText.slice(0, 40)}" → "${best.content.slice(0, 40)}"`
    );
    return best.content;
  }

  console.info(
    `[suggestionFilter] NO MATCH (threshold ${MATCH_THRESHOLD}) ` +
      `"${rawOldText.slice(0, 60)}"`
  );
  return null;
}

/**
 * Convert raw AI suggestions into validated Suggestion objects.
 *
 * Drops suggestions only when the scored match falls below MATCH_THRESHOLD
 * (currently 0.55). Every accepted suggestion uses the *canonical* script
 * element content as oldText, ensuring the suggestionApplier can find it.
 *
 * Shared by useChat (chat-driven suggestions) and useFeedback (Apply Feedback).
 */
export function buildSuggestionsFromRaw(
  rawSuggestions: RawSuggestion[] | undefined,
  script: Screenplay | null | undefined,
  source: Provider
): Suggestion[] {
  if (!rawSuggestions || !Array.isArray(rawSuggestions) || !script) return [];

  const out: Suggestion[] = [];
  const createdAt = new Date().toISOString();
  // Prevent duplicate suggestions targeting the same element.
  const usedContents = new Set<string>();

  for (const raw of rawSuggestions) {
    if (
      typeof raw?.oldText !== "string" ||
      typeof raw?.newText !== "string" ||
      !raw.oldText.trim() ||
      !raw.newText.trim()
    )
      continue;

    const resolvedOldText = resolveOldText(raw.oldText, script.scenes);
    if (!resolvedOldText) continue;
    if (usedContents.has(resolvedOldText)) continue;
    usedContents.add(resolvedOldText);

    out.push({
      id: makeSuggestionId(),
      oldText: resolvedOldText,
      newText: raw.newText,
      type: "rewrite",
      status: "pending",
      createdAt,
      source,
    });
  }

  return out;
}
