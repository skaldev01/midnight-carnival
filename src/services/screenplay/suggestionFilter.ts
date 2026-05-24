import type { Screenplay } from "@/types/screenplay";
import type { Suggestion } from "@/types/suggestion";
import type { Provider } from "@/types/chat";

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
 * Drop raw suggestions whose oldText doesn't exactly match any current
 * scene element. Orphans (LLM hallucinations or stale-relative-to-edits)
 * never enter the store, so the review UI only shows applicable changes.
 *
 * Shared by useChat (chat-driven suggestions) and useFeedback (Apply
 * Feedback flow).
 */
export function buildSuggestionsFromRaw(
  rawSuggestions: RawSuggestion[] | undefined,
  script: Screenplay | null | undefined,
  source: Provider
): Suggestion[] {
  if (!rawSuggestions || !Array.isArray(rawSuggestions) || !script) return [];

  const sceneSet = new Set(script.scenes.map((el) => el.content));
  const out: Suggestion[] = [];
  const createdAt = new Date().toISOString();

  for (const raw of rawSuggestions) {
    if (
      typeof raw?.oldText !== "string" ||
      typeof raw?.newText !== "string"
    )
      continue;
    if (!sceneSet.has(raw.oldText)) continue;
    out.push({
      id: makeSuggestionId(),
      oldText: raw.oldText,
      newText: raw.newText,
      type: "rewrite",
      status: "pending",
      createdAt,
      source,
    });
  }

  return out;
}
