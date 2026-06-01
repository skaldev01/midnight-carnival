/**
 * Client-side intent classifier for chat prompts.
 *
 * Purpose: distinguish "editing requests" (which must produce suggestions[])
 * from "conversational requests" (which return a plain chat reply).
 *
 * This runs in the browser before the API call so we can:
 *   1. Log the detected intent for debugging.
 *   2. Attach a stronger edit directive to the prompt when editing is detected.
 *   3. Surface a UI hint to the user ("suggestions were created") after the
 *      reply comes back.
 *
 * The classifier is intentionally permissive — a false positive (treating a
 * question as an edit) costs nothing because the AI will return suggestions:[]
 * if it can't find anything to change. A false negative (treating an edit as a
 * question) silently drops the rewrite, which is the bug we are fixing.
 */

export type PromptIntent = "edit" | "conversational";

export type IntentResult = {
  intent: PromptIntent;
  // True when the prompt references a specific scene number ("scene 3").
  hasSceneRef: boolean;
  // The 1-based scene number if a specific scene is referenced, else null.
  sceneNumber: number | null;
  // The element types mentioned (dialogue, action, character, etc.).
  elementTypes: string[];
};

// ---------------------------------------------------------------------------
// Edit-verb patterns
// ---------------------------------------------------------------------------
// Ordered by specificity — more specific phrases first so they take priority
// over shorter overlapping patterns.

const EDIT_VERBS = [
  // Explicit rewrite commands
  /\brewrite\b/i,
  /\bpunch\s+up\b/i,
  /\btighten\s+up\b/i,
  /\bclean\s+up\b/i,
  /\bspeed\s+up\b/i,
  /\bcut\s+down\b/i,
  // Single-word edit verbs
  /\btighten\b/i,
  /\bsharpen\b/i,
  /\bshorten\b/i,
  /\blengthen\b/i,
  /\bexpand\b/i,
  /\btrim\b/i,
  /\bfix\b/i,
  /\bchange\b/i,
  /\bupdate\b/i,
  /\bimprove\b/i,
  /\bstrengthen\b/i,
  /\bweaken\b/i,
  /\bsoften\b/i,
  /\bintensify\b/i,
  /\breplace\b/i,
  /\bswap\b/i,
  /\badd\b/i,
  /\bremove\b/i,
  /\bdelete\b/i,
  /\bcut\b/i,
  /\bpace\b/i,
  /\breword\b/i,
  /\brephrase\b/i,
  /\bpolish\b/i,
  /\brefine\b/i,
  /\bedit\b/i,
  /\bapply\b/i,
  /\buse\b/i,
  // "make X more/less Y"
  /\bmake\b.{0,60}\b(more|less|stronger|weaker|better|worse|clearer|shorter|longer)\b/i,
  // "give X a Y voice / feel"
  /\bgive\b.{0,60}\b(voice|feel|tone|edge|weight)\b/i,
] as const;

// ---------------------------------------------------------------------------
// Conversational-only patterns (override edit verbs when matched)
// These are prompts that contain edit-sounding words but are questions.
// ---------------------------------------------------------------------------

const CONVERSATIONAL_OVERRIDES = [
  /^what\b/i,
  /^(how|why|who|where|when)\b/i,
  /^(do|does|did|is|are|was|were|can|could|should|would)\b/i,
  /\?$/,                          // ends with a question mark
  /\bexplain\b/i,
  /\bwhat do you think\b/i,
  /\bgive (me\s+)?(feedback|notes|your thoughts|an overview|a summary)\b/i,
  /\banalyze\b/i,
  /\banalysis\b/i,
  /\btell me\b/i,
  /\bsummar(ize|ise|y)\b/i,
  /\bdescribe\b/i,
  /\bidentify\b/i,
  /\blist\b/i,
  /\bwhat('s| is) (wrong|working|not working|missing|the problem)\b/i,
] as const;

// ---------------------------------------------------------------------------
// Scene reference patterns
// ---------------------------------------------------------------------------

const SCENE_NUMBER_RE =
  /\bscene\s+(\d+)\b|\bsc\.?\s*(\d+)\b/i;

// ---------------------------------------------------------------------------
// Element type patterns
// ---------------------------------------------------------------------------

const ELEMENT_PATTERNS: [string, RegExp][] = [
  ["dialogue", /\bdialogue\b|\blines?\b|\bwhat\s+\w+\s+says\b/i],
  ["action", /\baction\b|\baction\s+lines?\b|\bdescription\b/i],
  ["character", /\bcharacter\b|\bperson\b|\bprotagonist\b|\bantagonist\b/i],
  ["scene", /\bscene\b|\bheading\b|\blocation\b/i],
  ["pacing", /\bpacing\b|\brhythm\b|\bmomentum\b|\btension\b/i],
];

// ---------------------------------------------------------------------------
// Public classifier
// ---------------------------------------------------------------------------

export function classifyIntent(prompt: string): IntentResult {
  const p = prompt.trim();

  // Check conversational overrides first — a question ending in "?" is never
  // an edit even if it contains the word "rewrite".
  const isConversational = CONVERSATIONAL_OVERRIDES.some((re) => re.test(p));

  // Check for any edit verb.
  const hasEditVerb = EDIT_VERBS.some((re) => re.test(p));

  const intent: PromptIntent =
    hasEditVerb && !isConversational ? "edit" : "conversational";

  // Scene reference extraction.
  const sceneMatch = p.match(SCENE_NUMBER_RE);
  const sceneNumber = sceneMatch
    ? parseInt(sceneMatch[1] ?? sceneMatch[2] ?? "", 10)
    : null;

  // Element type detection.
  const elementTypes = ELEMENT_PATTERNS.filter(([, re]) => re.test(p)).map(
    ([name]) => name
  );

  return {
    intent,
    hasSceneRef: sceneNumber !== null,
    sceneNumber: isNaN(sceneNumber ?? NaN) ? null : sceneNumber,
    elementTypes,
  };
}

// ---------------------------------------------------------------------------
// Prompt augmentation
// ---------------------------------------------------------------------------
// When we detect an edit intent, we prepend a short directive to the user
// message that the API receives. This reinforces the system-prompt contract
// right next to the actual request, making it far harder for the model to
// slide into conversational mode.

export function augmentPromptForEditing(
  originalPrompt: string,
  result: IntentResult,
  attachedReferenceNames: string[] = []
): string {
  // Always treat as edit when references are attached, even if the prompt
  // looks conversational — "apply the reference changes" must produce edits.
  const isEdit = result.intent === "edit" || attachedReferenceNames.length > 0;
  if (!isEdit) return originalPrompt;

  const sceneHint = result.hasSceneRef && result.sceneNumber !== null
    ? ` focusing on Scene ${result.sceneNumber}`
    : "";

  const typeHint = result.elementTypes.length > 0
    ? ` (targeting ${result.elementTypes.join(", ")} elements)`
    : "";

  const refHint = attachedReferenceNames.length > 0
    ? ` USE THE ATTACHED REFERENCE DOCUMENTS (${attachedReferenceNames.join(", ")}) as the source of editing instructions.`
    : "";

  const directive =
    `[EDIT REQUEST${sceneHint}${typeHint}]:${refHint} ` +
    `Produce oldText/newText suggestions in the suggestions[] array. ` +
    `Do NOT describe the changes in "content" — put the actual rewritten text in newText. ` +
    `"content" should be one short sentence confirming what you changed.\n\n`;

  return directive + originalPrompt;
}
