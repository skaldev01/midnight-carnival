import type { Screenplay } from "@/types/screenplay";
import type { Provider } from "@/types/chat";

export type AICode =
  | "invalid_key"
  | "rate_limit"
  | "network"
  | "context_too_long"
  | "unknown";

export class AIError extends Error {
  readonly code: AICode;
  readonly status: number;

  constructor(code: AICode, message: string, status = 500) {
    super(message);
    this.name = "AIError";
    this.code = code;
    this.status = status;
  }
}

export type AISuggestion = {
  oldText: string;
  newText: string;
  type: "rewrite";
};

export type ReferenceDoc = {
  name: string;
  content: string;
};

export type GenerateInput = {
  prompt: string;
  script: Screenplay | null;
  instructions: string;
  /** Reference documents attached to this project (coverage notes, producer PDFs, etc.). */
  references?: ReferenceDoc[];
  /**
   * When set, replaces the output of buildSystemPrompt entirely.
   * Used by the apply-feedback route to inject a specialised system prompt
   * that contains the full numbered element index.
   */
  _systemPromptOverride?: string;
};

export type GenerateResult = {
  content: string;
  provider: Provider;
  suggestions: AISuggestion[];
};

export interface AIService {
  generate(input: GenerateInput): Promise<GenerateResult>;
}

/**
 * System prompt sent to both providers. Instructs the model to ALWAYS
 * respond in a strict JSON envelope containing a `content` string (the
 * conversational reply) and a `suggestions` array (zero or more edits).
 *
 * The `oldText` field must be an EXACT match against one of the script
 * elements provided in context — client-side validation will drop any
 * suggestion that doesn't match.
 */
export function buildSystemPrompt(
  instructions: string,
  script: Screenplay | null,
  references?: ReferenceDoc[]
): string {
  const parts: string[] = [
    `You are a screenwriting editor inside Midnight Carnival. Your primary job is to make concrete edits to screenplays when asked.

══════════════════════════════════════════════
MOST IMPORTANT RULE — READ THIS FIRST
══════════════════════════════════════════════

When the user's message is an EDITING REQUEST, you MUST populate the suggestions[] array with the actual rewritten text. You MUST NOT write the rewrite inside "content". "content" is only for a one-sentence confirmation like "Tightened Amir's opening line."

An EDITING REQUEST is any message containing words or phrases such as:
  rewrite, reword, rephrase, punch up, tighten, tighten up, trim, cut, shorten,
  lengthen, expand, fix, change, update, improve, strengthen, sharpen, polish,
  refine, edit, make (more|less|better|stronger|clearer|shorter|longer|punchier),
  give (a voice|a tone|an edge|more weight), apply, use these notes, apply feedback,
  make it more, make it less, speed up, slow down, remove, delete, add a line,
  replace, swap, reorder, restructure, adjust, rework.

If the user message begins with [EDIT REQUEST], it is ALWAYS an editing request.

A CONVERSATIONAL REQUEST is a question or analytical request:
  "What do you think of…", "Is this working?", "Explain…", "Give me feedback on…",
  "Summarize…", "What's wrong with…", "Analyze…"
  For these, return suggestions: [].

══════════════════════════════════════════════
RESPONSE FORMAT — strictly enforced
══════════════════════════════════════════════

Respond ONLY with a JSON object of this exact shape — no markdown fences, no text outside the JSON:

{
  "content": "One sentence confirming what changed. For questions: your full answer here.",
  "suggestions": [
    {
      "oldText": "<EXACT content of one screenplay element, copied character-for-character>",
      "newText": "<your improved replacement>",
      "type": "rewrite"
    }
  ]
}

══════════════════════════════════════════════
EXACT-MATCH RULE FOR oldText
══════════════════════════════════════════════

The script is given as one element per line, each prefixed with its type label:
  DIALOGUE: Come on... just one bar.
  ACTION: John slams the door.

The text after the label and one space is the element's exact content string.
Your oldText MUST be that exact string — character-for-character, no extra spaces,
no changed punctuation, no paraphrasing, no combining multiple lines into one.

If you cannot find an exact element to rewrite, skip that suggestion.

══════════════════════════════════════════════
WORKED EXAMPLE
══════════════════════════════════════════════

Script given:
  DIALOGUE: Come on... just one bar.

User asks: "Make Amir's first line more desperate."

Correct response:
{
  "content": "Sharpened to raw urgency.",
  "suggestions": [
    {
      "oldText": "Come on... just one bar.",
      "newText": "One bar. That's all I'm asking. Please.",
      "type": "rewrite"
    }
  ]
}

Wrong response (never do this):
{
  "content": "I'd rewrite it as: 'One bar. That's all I'm asking. Please.' This feels more desperate.",
  "suggestions": []
}

══════════════════════════════════════════════
SELECTIVITY
══════════════════════════════════════════════
Prefer 1–5 high-craft, high-impact rewrites over many small ones.
When a scene number is mentioned (e.g. "Scene 3"), focus suggestions on elements
that appear after the corresponding SCENE heading in the script list below.`,
  ];

  if (instructions && instructions.trim()) {
    parts.push(`Project-specific instructions:\n${instructions.trim()}`);
  }

  // Reference documents come BEFORE the screenplay so the AI reads the
  // editorial brief first and uses it to select which script elements to target.
  if (references && references.length > 0) {
    const refBlock = references
      .map(
        (r, i) =>
          `--- Reference Document ${i + 1}: ${r.name} ---\n${r.content}\n--- End of ${r.name} ---`
      )
      .join("\n\n");
    parts.push(
      `REFERENCE DOCUMENTS (editorial briefs — use these to decide WHAT to change):\n\n` +
        `The writer has attached the following documents. Treat them as authoritative ` +
        `script coverage notes. When applying their notes, find the matching screenplay ` +
        `elements below and produce oldText/newText suggestions for each actionable note.\n\n` +
        refBlock
    );
  }

  if (script && script.scenes.length > 0) {
    parts.push(`Current script (one element per row, prefixed with type label):\n\n${screenplayToText(script)}`);
  } else {
    parts.push(
      "Current script: (none yet — the user hasn't uploaded or written one)"
    );
  }

  return parts.join("\n\n");
}

function screenplayToText(script: Screenplay): string {
  // Skip elements before the first scene heading — they are title-page
  // bleed-through that must not be targeted by AI edit suggestions.
  const firstScene = script.scenes.findIndex((s) => s.type === "scene");
  const body = firstScene >= 0 ? script.scenes.slice(firstScene) : script.scenes;
  return body
    .map((s) => {
      const label = s.type.toUpperCase();
      return `${label}: ${s.content}`;
    })
    .join("\n");
}

/**
 * Parse an LLM response into our structured GenerateResult. Handles three
 * shapes models actually produce:
 *   1. Pure JSON (the contract).
 *   2. JSON wrapped in ```json fences.
 *   3. JSON surrounded by narration ("Here are some rewrites... {...}").
 *
 * Falls back to plain-text content with empty suggestions only when no
 * parseable JSON object can be located. In that case the user still sees
 * the reply; they just don't get inline edits.
 */
export function parseAIResponse(
  raw: string,
  provider: Provider
): GenerateResult {
  const trimmed = raw.trim();

  // Strip markdown fence wrappers if a model adds one
  // despite instructions to the contrary.
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  const parsed = tryParseJson(candidate) ?? extractFirstJsonObject(candidate);

  if (!isObject(parsed)) {
    return { content: raw, provider, suggestions: [] };
  }

  const content =
    typeof parsed.content === "string" && parsed.content.trim()
      ? parsed.content.trim()
      : raw;

  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions.filter(isValidSuggestion).map(normalizeSuggestion)
    : [];

  return { content, provider, suggestions };
}

function tryParseJson(s: string): unknown | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Walk the string, tracking brace depth while ignoring braces inside
 * strings (so `{ "foo": "}" }` parses correctly), and return the first
 * balanced top-level `{...}` substring parsed as JSON. Returns null if
 * none parses cleanly.
 */
function extractFirstJsonObject(s: string): unknown | null {
  const start = s.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return tryParseJson(s.slice(start, i + 1));
      }
    }
  }
  return null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isValidSuggestion(s: unknown): s is Record<string, unknown> {
  if (!isObject(s)) return false;
  const oldText = s.oldText;
  const newText = s.newText;
  return (
    typeof oldText === "string" &&
    typeof newText === "string" &&
    oldText.trim().length > 0 &&
    newText.trim().length > 0
  );
}

function normalizeSuggestion(s: Record<string, unknown>): AISuggestion {
  return {
    oldText: String(s.oldText),
    newText: String(s.newText),
    type: "rewrite",
  };
}
