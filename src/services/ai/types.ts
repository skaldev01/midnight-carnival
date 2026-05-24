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

export type GenerateInput = {
  prompt: string;
  script: Screenplay | null;
  instructions: string;
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
  script: Screenplay | null
): string {
  const parts: string[] = [
    "You are a screenwriting assistant inside Midnight Carnival, an app that helps writers refine their screenplays.",
    `Respond ONLY with a JSON object of this exact shape — no markdown fences, no commentary outside the JSON:

{
  "content": "Brief 1-2 sentence conversational reply. Do NOT include the rewritten text here.",
  "suggestions": [
    {
      "oldText": "<EXACT content of one screenplay element>",
      "newText": "<replacement>",
      "type": "rewrite"
    }
  ]
}

CRITICAL RULES:

1. WHEN TO PRODUCE SUGGESTIONS
   If the user asks for an edit using verbs like "rewrite", "make X more Y", "sharpen", "shorten", "tighten", "change", "fix", "punch up", "trim", "expand", "swap", "replace" — you MUST populate suggestions[]. Do NOT just describe the change in 'content'. The rewrite itself goes in newText.

   For pure questions ("what do you think", "is this working", "explain"), return suggestions: [].

2. EXACT-MATCH oldText
   The script below is given as one element per line, each prefixed with its type label like "DIALOGUE: ...". The text after the colon and one space is the element's exact content. Your oldText MUST equal that exact content — no leading spaces, no trailing period changes, no paraphrasing, no combining lines.

3. WORKED EXAMPLE

   Script row given to you:
       DIALOGUE: Come on... just one bar.

   User asks: "Make Amir's first line more desperate. Keep it short."

   You return:
   {
     "content": "Sharpened to raw urgency.",
     "suggestions": [
       {
         "oldText": "Come on... just one bar.",
         "newText": "One bar. Please.",
         "type": "rewrite"
       }
     ]
   }

   Notice: oldText is the text after "DIALOGUE: " exactly, with no leading whitespace. The rewrite is in newText, NOT in content.

4. SELECTIVITY
   Prefer 1-5 high-craft suggestions over many small ones.`,
  ];

  if (instructions && instructions.trim()) {
    parts.push(`Project-specific instructions:\n${instructions.trim()}`);
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
  return script.scenes
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
