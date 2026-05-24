import { Fountain, type Token } from "fountain-js";
import type {
  Screenplay,
  ScreenplayElement,
  ScreenplayElementType,
} from "@/types/screenplay";

const SCENE_PREFIX = /^(INT\.?|EXT\.?|EST\.?|I\/E\.?|INT\.?\/EXT\.?)[\s.]/i;
const TRANSITION_SUFFIX = /^[A-Z0-9 ]+(?:TO:|FADE OUT\.?|FADE IN:?)$/;

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const TOKEN_TO_ELEMENT: Record<string, ScreenplayElementType> = {
  scene_heading: "scene",
  action: "action",
  character: "character",
  dialogue: "dialogue",
  parenthetical: "parenthetical",
  transition: "transition",
};

function tokensToElements(tokens: Token[]): ScreenplayElement[] {
  const out: ScreenplayElement[] = [];
  for (const t of tokens) {
    const type = TOKEN_TO_ELEMENT[t.type];
    if (!type) continue;
    const content = (t.text ?? "").trim();
    if (!content) continue;
    out.push({ type, content });
  }
  return out;
}

/**
 * Heuristic line-by-line fallback for PDFs whose text doesn't pass
 * fountain-js' strict rules (most studio PDFs).
 *
 * Rules:
 * - Lines starting with INT./EXT./EST./I/E. → scene
 * - All-caps short lines (<= 45 chars) → character cue
 * - Lines wrapped in (...) → parenthetical
 * - Lines ending in TO: → transition
 * - Lines immediately after a character cue (until blank) → dialogue
 * - Everything else → action
 */
function heuristicParse(text: string): ScreenplayElement[] {
  const lines = text.split("\n");
  const out: ScreenplayElement[] = [];
  let inDialogue = false;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      inDialogue = false;
      continue;
    }

    if (SCENE_PREFIX.test(trimmed)) {
      out.push({ type: "scene", content: trimmed });
      inDialogue = false;
      continue;
    }

    if (TRANSITION_SUFFIX.test(trimmed)) {
      out.push({ type: "transition", content: trimmed });
      inDialogue = false;
      continue;
    }

    if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
      out.push({ type: "parenthetical", content: trimmed });
      continue;
    }

    // Character cue: short, all caps, has at least one letter.
    const isAllCaps =
      trimmed === trimmed.toUpperCase() &&
      /[A-Z]/.test(trimmed) &&
      trimmed.length <= 45 &&
      !/[.!?]$/.test(trimmed);

    if (isAllCaps) {
      out.push({ type: "character", content: trimmed });
      inDialogue = true;
      continue;
    }

    if (inDialogue) {
      out.push({ type: "dialogue", content: trimmed });
      continue;
    }

    out.push({ type: "action", content: trimmed });
  }

  return out;
}

/**
 * Try fountain-js first; if it yields too few elements (PDF text rarely
 * matches strict fountain), fall back to the heuristic parser.
 */
export function parseScreenplay(text: string): Screenplay {
  const id = makeId();

  let fountainElements: ScreenplayElement[] = [];
  try {
    const fountain = new Fountain();
    const result = fountain.parse(text, true);
    if (result?.tokens?.length) {
      fountainElements = tokensToElements(result.tokens);
    }
  } catch {
    // ignore — fall through to heuristic
  }

  const heuristicElements = heuristicParse(text);

  // Pick whichever produced more structured detail (more scene/character
  // markers usually means a better parse). Ties go to fountain.
  const fountainScore = fountainElements.filter(
    (e) => e.type === "scene" || e.type === "character"
  ).length;
  const heuristicScore = heuristicElements.filter(
    (e) => e.type === "scene" || e.type === "character"
  ).length;

  const scenes =
    fountainScore >= heuristicScore && fountainElements.length > 0
      ? fountainElements
      : heuristicElements;

  return { id, scenes };
}
