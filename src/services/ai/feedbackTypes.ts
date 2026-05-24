import type { Screenplay } from "@/types/screenplay";
import type { Provider } from "@/types/chat";
import type { FeedbackSections } from "@/types/feedback";
import { emptyFeedbackSections } from "@/types/feedback";

export type AIFeedbackResult = {
  title: string;
  sections: FeedbackSections;
  provider: Provider;
};

/**
 * Build the system prompt for feedback generation. The LLM is instructed
 * to return a strict JSON envelope with `title` and four sections.
 */
export function buildFeedbackSystemPrompt(
  instructions: string,
  script: Screenplay | null
): string {
  const parts: string[] = [
    "You are a screenwriting consultant inside Midnight Carnival. Your job is to give craft-focused feedback on screenplays.",
    `Respond ONLY with a JSON object of this exact shape — no markdown fences, no commentary outside the JSON:

{
  "title": "Brief title for this round of feedback (e.g., 'Feedback on Act 1', 'Notes on Dialogue').",
  "sections": {
    "working": ["1-4 bullets on what's working in the script — be specific, name scenes and characters."],
    "issues": ["1-4 bullets on what's not working — pacing, structure, exposition, etc."],
    "characterNotes": ["1-4 bullets on character voice, arc, or consistency."],
    "suggestions": ["1-4 high-level, actionable suggestions for revisions. Each should be a concrete craft note."]
  }
}

Rules:
- All four section keys MUST be present, even if empty (use []).
- Bullets are plain text (no markdown, no inline HTML).
- The user's prompt may ask you to focus on a specific aspect — honor that, but still return all four section keys.
- Be specific. Reference scenes/characters/lines from the script when relevant.
- Quality over quantity — better 2 sharp notes than 4 generic ones.`,
  ];

  if (instructions && instructions.trim()) {
    parts.push(`Project-specific instructions:\n${instructions.trim()}`);
  }

  if (script && script.scenes.length > 0) {
    parts.push(`Current script:\n\n${screenplayToText(script)}`);
  } else {
    parts.push(
      "Current script: (none yet — feedback should note that no script is loaded)"
    );
  }

  return parts.join("\n\n");
}

function screenplayToText(script: Screenplay): string {
  return script.scenes
    .map((s) => {
      switch (s.type) {
        case "scene":
          return `\n${s.content}\n`;
        case "action":
          return s.content;
        case "character":
          return `\n${s.content}`;
        case "dialogue":
          return `    ${s.content}`;
        case "parenthetical":
          return `    ${s.content}`;
        case "transition":
          return `\n${s.content}\n`;
        default:
          return s.content;
      }
    })
    .join("\n");
}

/**
 * Parse LLM feedback response. Falls back gracefully — if the JSON is
 * malformed, returns a single-bullet "issues" entry with the raw output
 * so the user still sees what the model said.
 */
export function parseFeedbackResponse(
  raw: string,
  provider: Provider
): AIFeedbackResult {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return {
      title: "AI feedback (unparsed)",
      sections: {
        ...emptyFeedbackSections(),
        issues: [
          `The model returned unparseable output. Raw response: ${raw.slice(0, 500)}`,
        ],
      },
      provider,
    };
  }

  if (!isObject(parsed)) {
    return {
      title: "AI feedback",
      sections: emptyFeedbackSections(),
      provider,
    };
  }

  const title =
    typeof parsed.title === "string" && parsed.title.trim()
      ? parsed.title.trim()
      : "AI feedback";

  const rawSections = isObject(parsed.sections) ? parsed.sections : {};
  const sections: FeedbackSections = {
    working: toStringArray(rawSections.working),
    issues: toStringArray(rawSections.issues),
    characterNotes: toStringArray(rawSections.characterNotes),
    suggestions: toStringArray(rawSections.suggestions),
  };

  return { title, sections, provider };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((s) => s.trim());
}
