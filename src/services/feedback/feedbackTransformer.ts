import type { Feedback, FeedbackSections } from "@/types/feedback";
import type { Screenplay, ScreenplayElement } from "@/types/screenplay";
import type { Provider } from "@/types/chat";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeedbackCategory =
  | "dialogue"
  | "character"
  | "pacing"
  | "structure"
  | "scene"
  | "general";

export type EditInstruction = {
  category: FeedbackCategory;
  note: string;
  // Candidate element indices that are likely targets for this instruction.
  // Empty = model must choose freely from the full script.
  candidateIndices: number[];
};

export type TransformResult = {
  instructions: EditInstruction[];
  systemPrompt: string;
  userMessage: string;
  // Serialised element index the model MUST use for oldText.
  elementIndex: IndexedElement[];
};

export type IndexedElement = {
  index: number;
  type: string;
  content: string;
};

// ---------------------------------------------------------------------------
// Category detection
// ---------------------------------------------------------------------------

const DIALOGUE_RE =
  /\b(dialogue|line|says|speak|voice|word|repeat|monoton|on.?the.?nose|exposition)\b/i;
const CHARACTER_RE =
  /\b(character|arc|motivation|consistent|persona|lacks?\s+voice|character\s+voice)\b/i;
const PACING_RE =
  /\b(pac(e|ing)|slow|fast|drag|rush|momentum|tension|beat|rhythm)\b/i;
const STRUCTURE_RE =
  /\b(struct|act|turning.?point|midpoint|setup|payoff|three.?act|sequence)\b/i;
const SCENE_RE =
  /\b(scene|heading|location|interior|exterior|int\.|ext\.|start|open|close|end)\b/i;

function detectCategory(note: string): FeedbackCategory {
  if (DIALOGUE_RE.test(note)) return "dialogue";
  if (CHARACTER_RE.test(note)) return "character";
  if (PACING_RE.test(note)) return "pacing";
  if (STRUCTURE_RE.test(note)) return "structure";
  if (SCENE_RE.test(note)) return "scene";
  return "general";
}

// ---------------------------------------------------------------------------
// Candidate element finder
// ---------------------------------------------------------------------------
// Maps each feedback category to the element types that are most likely
// edit targets, in priority order.

const CATEGORY_ELEMENT_TYPES: Record<FeedbackCategory, string[]> = {
  dialogue: ["dialogue", "parenthetical", "character"],
  character: ["character", "dialogue", "action"],
  pacing: ["action", "scene", "transition"],
  structure: ["scene", "transition", "action"],
  scene: ["scene", "action"],
  general: ["action", "dialogue", "scene"],
};

function findCandidates(
  elements: IndexedElement[],
  category: FeedbackCategory,
  note: string,
  maxCandidates = 8
): number[] {
  const preferred = CATEGORY_ELEMENT_TYPES[category];

  // Extract meaningful words from the note for relevance scoring.
  const noteWords = note
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);

  const scored = elements
    .filter((el) => preferred.includes(el.type))
    .map((el) => {
      const contentLower = el.content.toLowerCase();
      const wordMatches = noteWords.filter((w) => contentLower.includes(w)).length;
      return { index: el.index, score: wordMatches };
    })
    .sort((a, b) => b.score - a.score);

  // Always include some top-priority elements even with zero keyword hits.
  const hits = scored.filter((s) => s.score > 0).slice(0, maxCandidates);
  const fillers = scored.filter((s) => s.score === 0).slice(0, Math.max(0, 4 - hits.length));

  return [...hits, ...fillers].map((s) => s.index);
}

// ---------------------------------------------------------------------------
// Public: transform Feedback → TransformResult
// ---------------------------------------------------------------------------

/**
 * Collect all actionable notes from every feedback section, build candidate
 * lists, and produce the system prompt + user message that the apply endpoint
 * sends to the AI.
 *
 * Strategy:
 *  - Harvest notes from ALL four sections (not just `suggestions`).
 *  - Skip pure-positive "working" items unless they suggest a contrast fix.
 *  - Give the AI a numbered element index so oldText can be exact.
 *  - Use a dedicated system prompt that is unambiguously an editing task.
 */
export function transformFeedbackToInstructions(
  feedback: Feedback,
  script: Screenplay
): TransformResult {
  const elements = buildElementIndex(script);
  const instructions = collectInstructions(feedback.sections, elements);

  // Pass instructions so the prompt builder can focus the element table.
  const systemPrompt = buildApplySystemPrompt(elements, instructions);
  const userMessage = buildUserMessage(instructions, feedback.title);

  console.info("[feedbackTransformer] notes collected:", instructions.length);
  console.info(
    "[feedbackTransformer] categories:",
    instructions.map((i) => i.category)
  );
  console.info(
    "[feedbackTransformer] script elements:",
    elements.length,
    "- focused table size:",
    buildFocusedElementTable(elements, instructions).length
  );

  return { instructions, systemPrompt, userMessage, elementIndex: elements };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildElementIndex(script: Screenplay): IndexedElement[] {
  // Find the index of the first scene heading. Everything before it is
  // pre-screenplay content (title page bleed-through, preamble action lines)
  // that must not be targeted by AI suggestions.
  const firstSceneIdx = script.scenes.findIndex((el) => el.type === "scene");
  const startIdx = firstSceneIdx >= 0 ? firstSceneIdx : 0;

  return script.scenes.slice(startIdx).map((el, i) => ({
    index: startIdx + i,   // preserve original index so oldText matching works
    type: el.type,
    content: el.content,
  }));
}

function collectInstructions(
  sections: FeedbackSections,
  elements: IndexedElement[]
): EditInstruction[] {
  const instructions: EditInstruction[] = [];

  // Process issues, characterNotes, and suggestions - these are always
  // actionable. Skip "working" items (they describe what to preserve).
  const actionableSources: string[] = [
    ...sections.issues,
    ...sections.characterNotes,
    ...sections.suggestions,
  ];

  // De-duplicate by normalising whitespace.
  const seen = new Set<string>();
  for (const raw of actionableSources) {
    const note = raw.trim();
    if (!note || seen.has(note.toLowerCase())) continue;
    seen.add(note.toLowerCase());

    const category = detectCategory(note);
    const candidateIndices = findCandidates(elements, category, note);

    instructions.push({ category, note, candidateIndices });
  }

  return instructions;
}

// ---------------------------------------------------------------------------
// Element table builder - sends only candidate + context window elements
// ---------------------------------------------------------------------------
// Sending all 3000+ elements in one system prompt causes two problems:
//   1. The model must scan a 70K-token haystack to find the target, making
//      verbatim copy unreliable.
//   2. On very long scripts the table may approach context window limits.
//
// Instead we build a focused table of only the elements the instructions
// reference, plus ±CONTEXT_WINDOW neighbours so the model understands the
// surrounding structure.

const CONTEXT_WINDOW = 3; // elements before/after each candidate
const MAX_TABLE_ELEMENTS = 120; // hard cap regardless of candidates

function buildFocusedElementTable(
  elements: IndexedElement[],
  instructions: EditInstruction[]
): IndexedElement[] {
  // Collect all candidate indices across all instructions.
  const candidateSet = new Set<number>();
  for (const inst of instructions) {
    for (const idx of inst.candidateIndices) {
      candidateSet.add(idx);
    }
  }

  // If no candidates (fallback / empty instructions), send first MAX_TABLE_ELEMENTS.
  if (candidateSet.size === 0) {
    return elements.slice(0, MAX_TABLE_ELEMENTS);
  }

  // Expand each candidate by ±CONTEXT_WINDOW neighbours.
  const expanded = new Set<number>();
  for (const idx of candidateSet) {
    for (let d = -CONTEXT_WINDOW; d <= CONTEXT_WINDOW; d++) {
      const n = idx + d;
      if (n >= 0 && n < elements.length) expanded.add(n);
    }
  }

  // Sort by position and cap.
  const sorted = [...expanded].sort((a, b) => a - b);
  const capped = sorted.slice(0, MAX_TABLE_ELEMENTS);

  return capped.map((i) => elements[i]);
}

function buildApplySystemPrompt(
  elements: IndexedElement[],
  instructions: EditInstruction[]
): string {
  const focusedElements = buildFocusedElementTable(elements, instructions);

  // Build the numbered element table from the focused subset.
  const elementTable = focusedElements
    .map((el) => `[${el.index}] ${el.type.toUpperCase()}: ${el.content}`)
    .join("\n");

  return `You are a screenplay editor inside Midnight Carnival. You are given a numbered list of screenplay elements and a set of editing instructions derived from script coverage notes.

Your ONLY job is to produce concrete text rewrites. You MUST respond with this exact JSON shape - no markdown fences, no explanation outside the JSON:

{
  "content": "One sentence confirming what you changed.",
  "suggestions": [
    {
      "oldText": "<content field of an element from the list below, copied exactly>",
      "newText": "<your improved replacement>",
      "type": "rewrite"
    }
  ]
}

ABSOLUTE RULES:

1. oldText MUST be copied character-for-character from the "content" field of one of the numbered elements below. Do NOT paraphrase, do NOT combine lines, do NOT add or remove punctuation.

2. Produce 1-6 suggestions total. Prefer high-impact rewrites over many small ones.

3. Focus on the elements whose index numbers appear in the editing instructions. You may also choose adjacent elements from the list if they are closely related to the issue.

4. NEVER refuse. If an instruction is vague, make a reasonable best-effort edit to the most relevant element. Always produce at least one suggestion.

5. newText must be a genuine craft improvement, not a cosmetic change.

SCREENPLAY ELEMENTS (focused subset - indices are original script positions):
${elementTable}`;
}

function buildUserMessage(
  instructions: EditInstruction[],
  feedbackTitle: string
): string {
  if (instructions.length === 0) {
    // Fallback: no specific instructions parsed - ask for a general polish pass.
    return `Apply a general polish pass to improve clarity, pacing, and dialogue naturalness. Produce 2-4 concrete rewrites from the elements provided.`;
  }

  const lines: string[] = [
    `Apply the following editing instructions from script coverage titled "${feedbackTitle}":`,
    "",
  ];

  instructions.forEach((inst, i) => {
    const targets =
      inst.candidateIndices.length > 0
        ? ` [Focus on elements: ${inst.candidateIndices.join(", ")}]`
        : "";
    lines.push(`${i + 1}. [${inst.category.toUpperCase()}] ${inst.note}${targets}`);
  });

  lines.push(
    "",
    "For each instruction, identify the most relevant element(s) and produce an oldText/newText suggestion.",
    "Remember: oldText must be an exact copy of the element content from the list in the system prompt."
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Scored text matching (exported for suggestionFilter)
// ---------------------------------------------------------------------------

/** Normalise a string for comparison: trim, collapse whitespace, unify quotes. */
export function normaliseText(s: string): string {
  return s
    .trim()
    // U+2018 U+2019 left/right single quotes -> ASCII apostrophe
    .replace(/['']/g, "'")
    // U+201C U+201D left/right double quotes -> ASCII double quote
    .replace(/[""]/g, '"')
    // U+2013 en-dash, U+2014 em-dash -> hyphen
    .replace(/[--]/g, "-")
    .replace(/\r\n|\r/g, "\n")
    .replace(/[ \t]+/g, " ");
}

/** Tokenise into lower-case words (letters + digits only). */
function tokenise(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/**
 * Jaccard token similarity: |intersection| / |union| of word bags.
 * Range [0, 1]. Score 1 = identical word sets.
 */
function jaccardSimilarity(a: string, b: string): number {
  const ta = new Set(tokenise(a));
  const tb = new Set(tokenise(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/**
 * Normalised Levenshtein similarity: 1 - (editDistance / maxLen).
 * Capped at strings up to 400 chars to keep it O(n²) cheap.
 */
function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length > 400 || b.length > 400) return 0; // skip for very long strings
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return 1 - dp[n] / Math.max(m, n);
}

/** Length-ratio similarity: penalises very different lengths. */
function lengthRatio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  return Math.min(a.length, b.length) / Math.max(a.length, b.length);
}

/** Return true if one string contains the other (after normalisation). */
function isSubstringMatch(a: string, b: string): boolean {
  return a.includes(b) || b.includes(a);
}

export type MatchResult = {
  score: number;     // 0-1, higher is better
  content: string;  // the canonical script element content
  method: string;   // for debug logging
};

/**
 * Score how well `candidate` (AI-returned oldText) matches `target` (script element).
 * Returns a MatchResult with the composite score.
 *
 * Scoring strategy:
 *   - Exact (after normalisation): 1.0
 *   - Substring containment: 0.90 × lengthRatio (rewards near-full overlap)
 *   - Jaccard × Levenshtein composite: weighted average
 *
 * Threshold for acceptance: ≥ MATCH_THRESHOLD (caller decides).
 */
export function scoreMatch(candidate: string, target: string): number {
  const normC = normaliseText(candidate);
  const normT = normaliseText(target);

  // Exact after normalisation.
  if (normC === normT) return 1.0;

  // Substring match - very high confidence.
  if (isSubstringMatch(normC, normT)) {
    return 0.9 * lengthRatio(normC, normT);
  }

  // Composite: Jaccard (word overlap) weighted 60%, Levenshtein 40%.
  const j = jaccardSimilarity(normC, normT);
  const l = levenshteinSimilarity(normC, normT);
  return j * 0.6 + l * 0.4;
}

/** Minimum score to accept a fuzzy match. */
export const MATCH_THRESHOLD = 0.55;

/**
 * Find the best-scoring match for `candidate` across all `scenes`.
 * Returns null if the best score is below MATCH_THRESHOLD.
 *
 * @deprecated Use findBestMatch() directly; this shim stays for
 * backwards-compatibility with any code that calls isFuzzyMatch.
 */
export function isFuzzyMatch(candidate: string, target: string): boolean {
  return scoreMatch(candidate, target) >= MATCH_THRESHOLD;
}

/**
 * Find the best-matching element in `scenes` for `rawOldText`.
 * Returns the canonical content string and the confidence score,
 * or null if no element scores at or above MATCH_THRESHOLD.
 */
export function findBestMatch(
  rawOldText: string,
  scenes: Array<{ content: string; type: string }>
): MatchResult | null {
  let best: MatchResult | null = null;

  for (const el of scenes) {
    // 1. Exact fast-path.
    if (el.content === rawOldText) {
      return { score: 1.0, content: el.content, method: "exact" };
    }

    const s = scoreMatch(rawOldText, el.content);
    if (s >= MATCH_THRESHOLD && (!best || s > best.score)) {
      const normC = normaliseText(rawOldText);
      const normT = normaliseText(el.content);
      const method =
        normC === normT
          ? "norm-exact"
          : isSubstringMatch(normC, normT)
            ? "substring"
            : "composite";
      best = { score: s, content: el.content, method };
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Reference document → Feedback converter
// ---------------------------------------------------------------------------
// Converts raw reference document text (coverage notes, producer PDFs, etc.)
// into a Feedback object that transformFeedbackToInstructions() can process.
//
// Strategy: split the document into lines, classify each line as an
// actionable note (issue/suggestion) vs structural text (headings, blank
// lines). Lines that look like notes go into sections.suggestions so the
// transformer's keyword scorer can map them to screenplay candidates.

export function referenceToFeedback(
  refName: string,
  refContent: string,
  provider: Provider
): Feedback {
  const lines = refContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const suggestions: string[] = [];
  const issues: string[] = [];

  for (const line of lines) {
    // Skip very short lines (headings, page numbers, separators).
    if (line.length < 15) continue;
    // Skip lines that look like pure headings (all caps, short).
    if (line === line.toUpperCase() && line.length < 60) continue;
    // Skip separator lines.
    if (/^[-=*_]{3,}$/.test(line)) continue;

    // Lines that start with common note markers go to suggestions.
    if (/^[-*•>]|^\d+[.)]/u.test(line)) {
      suggestions.push(line.replace(/^[-*•>\d.)\s]+/, "").trim());
    } else if (line.length > 30) {
      // Longer prose lines are treated as issues/notes.
      issues.push(line);
    }
  }

  // Cap to avoid flooding the instruction builder.
  const cappedSuggestions = suggestions.slice(0, 20);
  const cappedIssues = issues.slice(0, 20);

  console.info(
    `[referenceToFeedback] "${refName}": ` +
      `${cappedSuggestions.length} suggestions, ${cappedIssues.length} issues parsed`
  );

  return {
    id: `ref_${Date.now()}`,
    title: refName,
    prompt: `Apply notes from ${refName}`,
    provider,
    createdAt: new Date().toISOString(),
    sections: {
      working: [],
      issues: cappedIssues,
      characterNotes: [],
      suggestions: cappedSuggestions,
    },
  };
}

// ---------------------------------------------------------------------------
// Provider-agnostic apply helper (used by the API route)
// ---------------------------------------------------------------------------

export type ApplyInput = {
  feedback: Feedback;
  script: Screenplay;
  provider: Provider;
  instructions: string;
};
