import { Fountain, type Token } from "fountain-js";
import type {
  Screenplay,
  ScreenplayElement,
  ScreenplayElementType,
  TitlePage,
} from "@/types/screenplay";

const SCENE_PREFIX = /^(INT\.?|EXT\.?|EST\.?|I\/E\.?|INT\.?\/EXT\.?)[\s.]/i;
const TRANSITION_SUFFIX = /\b(?:TO:|FADE\s+OUT\.?|FADE\s+IN:?|CUT\s+TO:|DISSOLVE\s+TO:)$/i;

// Column thresholds (in Courier characters from left body edge).
// Standard US screenplay spec at 12pt Courier, 1.5" left margin:
//   Action/Scene:   col  0–4
//   Dialogue:       col ~10–18
//   Parenthetical:  col ~17–23
//   Character:      col ~22–28
// We use generous bands because real PDFs vary ±3 cols.
const COL_ACTION_MAX = 8;       // ≤8  → scene or action
const COL_DIALOGUE_MIN = 8;     // ≥8  and < character min → dialogue
const COL_DIALOGUE_MAX = 22;
const COL_CHARACTER_MIN = 18;   // ≥18 → character or parenthetical

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

// ---------------------------------------------------------------------------
// Title page extraction
// ---------------------------------------------------------------------------
// A screenplay title page precedes page 1 and contains no scene headings.
// We detect it by finding the text before the first scene heading, then
// classify each line into title / author / contact / draft buckets.
//
// Patterns handled:
//   Title:      Any prominent non-label line before "Written by" / "By"
//   Authors:    Lines immediately after "Written by" / "by" label
//   Contact:    Lines that follow "Contact" or contain email / phone / address
//   Draft info: Lines matching "draft", "revision", "revised", year patterns
// ---------------------------------------------------------------------------

const WRITTEN_BY_RE = /^(?:written\s+by|by)\s*[:–—]?\s*/i;
const CONTACT_LABEL_RE = /^contact\s*[:–—]?\s*/i;
const DRAFT_RE = /\b(?:draft|revision|revised|shooting\s+script)\b|\b(?:19|20)\d{2}\b/i;
const EMAIL_RE = /\S+@\S+\.\S+/;
const PHONE_RE = /[\d()\-+\s]{7,}/;

/**
 * Split the raw extracted text into two parts at the first scene heading:
 *   [titlePageText, screenplayBodyText]
 * If no scene heading is found the title page is empty.
 */
// Patterns that unambiguously mark the start of the screenplay body,
// regardless of whether a scene heading has appeared yet.
const BODY_START_RE =
  /^(?:FADE\s+IN\s*[:.]|OVER\s+BLACK\s*[:.:]|SMASH\s+CUT\s*[:.:]|BLACK\s*[:.:]|COLD\s+OPEN\s*[:.:])/i;

function splitTitlePageFromBody(text: string): [string, string] {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = stripColPrefix(raw);

    // First scene heading — hard split here.
    if (SCENE_PREFIX.test(stripped)) {
      return [lines.slice(0, i).join("\n"), lines.slice(i).join("\n")];
    }

    // Cinematic body-start directives — everything from here is body.
    if (BODY_START_RE.test(stripped)) {
      return [lines.slice(0, i).join("\n"), lines.slice(i).join("\n")];
    }
  }
  return [text, ""];
}

function stripColPrefix(raw: string): string {
  const pipeIdx = raw.indexOf("|");
  if (pipeIdx > 0 && pipeIdx <= 4 && !isNaN(parseInt(raw.slice(0, pipeIdx), 10))) {
    return raw.slice(pipeIdx + 1).trim();
  }
  return raw.trim();
}

/**
 * Parse title-page text into a structured TitlePage.
 * Uses a simple state machine: once we see "Written by" we accumulate
 * author names, once we see "Contact" we accumulate contact lines, etc.
 */
function parseTitlePageText(raw: string): TitlePage | null {
  const lines = raw
    .split("\n")
    .map(stripColPrefix)
    .filter(Boolean);

  if (lines.length === 0) return null;

  let title = "";
  const authors: string[] = [];
  const contactLines: string[] = [];
  const draftLines: string[] = [];
  const extra: string[] = [];

  type State = "preamble" | "title" | "authors" | "contact" | "extra";
  let state: State = "preamble";
  // Track whether we've assigned a title yet (first substantial line wins).
  let titleAssigned = false;

  for (const line of lines) {
    // Skip page-separator artefacts from the PDF extractor.
    if (/^\s*-\s*\d+\s*-\s*$/.test(line)) continue;

    // "Written by" / "By" label — switch to author-collection mode.
    if (WRITTEN_BY_RE.test(line)) {
      state = "authors";
      // The author name may appear inline: "Written by John Smith"
      const rest = line.replace(WRITTEN_BY_RE, "").trim();
      if (rest) authors.push(rest);
      continue;
    }

    // "Contact:" label — switch to contact-collection mode.
    if (CONTACT_LABEL_RE.test(line)) {
      state = "contact";
      const rest = line.replace(CONTACT_LABEL_RE, "").trim();
      if (rest) contactLines.push(rest);
      continue;
    }

    // Draft / revision lines.
    if (DRAFT_RE.test(line) && line.length < 60) {
      draftLines.push(line);
      continue;
    }

    switch (state) {
      case "preamble":
        // First non-empty line before any label is treated as the title.
        if (!titleAssigned) {
          title = line;
          titleAssigned = true;
          state = "title";
        } else {
          extra.push(line);
        }
        break;

      case "title":
        // Lines immediately after the title but before "Written by" are
        // often a subtitle or secondary title component.
        if (!WRITTEN_BY_RE.test(line) && !CONTACT_LABEL_RE.test(line)) {
          // If it looks like another title fragment (all-caps or short), append.
          if (line === line.toUpperCase() || line.length < 40) {
            // Could be subtitle — keep in extra rather than clobbering title.
            extra.push(line);
          } else {
            extra.push(line);
          }
        }
        break;

      case "authors":
        // Continue collecting author names until a blank-equivalent or label.
        if (line.length > 0 && line.length < 60) {
          authors.push(line);
        } else {
          state = "extra";
          extra.push(line);
        }
        break;

      case "contact":
        // Email, phone, or address lines belong to contact.
        if (EMAIL_RE.test(line) || PHONE_RE.test(line) || line.length < 80) {
          contactLines.push(line);
        } else {
          state = "extra";
          extra.push(line);
        }
        break;

      case "extra":
        extra.push(line);
        break;
    }
  }

  // Nothing meaningful found — return null so we don't create an empty title page.
  if (!title && authors.length === 0 && contactLines.length === 0) return null;

  return {
    title,
    authors,
    contact: contactLines.join("\n"),
    draft: draftLines.join(" | "),
    extra,
  };
}

// ---------------------------------------------------------------------------
// Column-aware heuristic parser
// ---------------------------------------------------------------------------
// The PDF extractor emits lines in the format:  "<col>|<text>"
// where <col> is the Courier-character offset from the leftmost body text.
// We use horizontal position as the primary classification signal, because
// that is exactly how a typist positions screenplay elements on the page.
// All-caps and punctuation checks are secondary tiebreakers.
//
// For legacy plain-text input (no "|" prefix) we fall back to the old
// all-caps heuristic so the parser stays usable with non-PDF sources.
// ---------------------------------------------------------------------------

interface ParsedLine {
  col: number;
  text: string;
  isColumnar: boolean; // came from the col|text format
}

function parseLine(raw: string): ParsedLine {
  const pipeIdx = raw.indexOf("|");
  if (pipeIdx > 0 && pipeIdx <= 4) {
    const colStr = raw.slice(0, pipeIdx);
    const col = parseInt(colStr, 10);
    if (!isNaN(col)) {
      return { col, text: raw.slice(pipeIdx + 1).trim(), isColumnar: true };
    }
  }
  // Plain text fallback: estimate column from leading spaces.
  const trimmed = raw.trimStart();
  const col = Math.round((raw.length - trimmed.length) / 1);
  return { col, text: trimmed.trim(), isColumnar: false };
}

function heuristicParse(text: string): ScreenplayElement[] {
  const rawLines = text.split("\n");
  const out: ScreenplayElement[] = [];

  // Detect whether input uses the columnar format from pdfParser.
  const columnarLines = rawLines.filter((l) => {
    const p = l.indexOf("|");
    return p > 0 && p <= 4 && !isNaN(parseInt(l.slice(0, p), 10));
  });
  const isColumnar = columnarLines.length > rawLines.filter(Boolean).length * 0.6;

  // Collect all column values from non-empty lines to compute adaptive thresholds.
  // Real PDFs vary: some typists use 3.5" character indent, others 4.2".
  // We cluster the distribution to find the modal column for character cues.
  let charColMedian = COL_CHARACTER_MIN;
  if (isColumnar) {
    const cols: number[] = [];
    for (const raw of rawLines) {
      const { col, text } = parseLine(raw);
      if (!text) continue;
      const isAllCaps = text === text.toUpperCase() && /[A-Z]/.test(text) && text.length <= 50;
      if (isAllCaps && col >= COL_DIALOGUE_MIN) cols.push(col);
    }
    if (cols.length > 0) {
      cols.sort((a, b) => a - b);
      charColMedian = cols[Math.floor(cols.length / 2)];
    }
  }

  // Adaptive bands derived from median character column.
  const adaptiveCharMin = Math.max(COL_CHARACTER_MIN, charColMedian - 6);
  const adaptiveDialogueMin = Math.max(COL_DIALOGUE_MIN, charColMedian - 16);
  const adaptiveDialogueMax = charColMedian - 1;

  let inDialogue = false;
  let lastType: ScreenplayElementType = "action";

  for (const raw of rawLines) {
    const { col, text } = parseLine(raw);

    if (!text) {
      inDialogue = false;
      continue;
    }

    // Scene headings are unambiguous regardless of column.
    if (SCENE_PREFIX.test(text)) {
      out.push({ type: "scene", content: text });
      inDialogue = false;
      lastType = "scene";
      continue;
    }

    // Transitions: right-side all-caps line.
    if (TRANSITION_SUFFIX.test(text) && text === text.toUpperCase()) {
      out.push({ type: "transition", content: text });
      inDialogue = false;
      lastType = "transition";
      continue;
    }

    // Parentheticals inside dialogue block.
    if (text.startsWith("(") && text.endsWith(")")) {
      out.push({ type: "parenthetical", content: text });
      // parenthetical keeps inDialogue true — next line is still dialogue.
      lastType = "parenthetical";
      continue;
    }

    const isAllCaps =
      text === text.toUpperCase() && /[A-Z]/.test(text) && text.length <= 50;

    if (isColumnar) {
      // --- Column-primary classification ---
      if (col <= COL_ACTION_MAX) {
        // Left column: scene (handled above) or action.
        out.push({ type: "action", content: text });
        inDialogue = false;
        lastType = "action";
      } else if (col >= adaptiveCharMin && isAllCaps) {
        // Character cue zone: all-caps at the character column.
        out.push({ type: "character", content: text });
        inDialogue = true;
        lastType = "character";
      } else if (col >= adaptiveDialogueMin && col <= adaptiveDialogueMax) {
        // Dialogue zone: between action and character columns.
        if (inDialogue) {
          out.push({ type: "dialogue", content: text });
          lastType = "dialogue";
        } else {
          // Could be action that happens to indent (e.g. dual-column action).
          out.push({ type: "action", content: text });
          lastType = "action";
        }
      } else {
        // Fallback based on dialogue context.
        if (inDialogue) {
          out.push({ type: "dialogue", content: text });
          lastType = "dialogue";
        } else {
          out.push({ type: "action", content: text });
          lastType = "action";
        }
      }
    } else {
      // --- Legacy plain-text path: all-caps heuristic ---
      if (isAllCaps && text.length <= 45 && !/[.!?]$/.test(text)) {
        out.push({ type: "character", content: text });
        inDialogue = true;
        lastType = "character";
      } else if (inDialogue) {
        out.push({ type: "dialogue", content: text });
        lastType = "dialogue";
      } else {
        out.push({ type: "action", content: text });
        lastType = "action";
      }
    }
  }

  // Suppress unused-variable warning for lastType (kept for future use).
  void lastType;
  return out;
}

// ---------------------------------------------------------------------------
// Fountain-js path: strip the col| prefix before feeding to fountain parser,
// since fountain-js expects clean screenplay text.
// ---------------------------------------------------------------------------
function stripColumnPrefixes(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const pipeIdx = line.indexOf("|");
      if (pipeIdx > 0 && pipeIdx <= 4 && !isNaN(parseInt(line.slice(0, pipeIdx), 10))) {
        return line.slice(pipeIdx + 1);
      }
      return line;
    })
    .join("\n");
}

/**
 * Try fountain-js first (works well for .fountain / Fade In exports).
 * For real studio PDFs, fall back to the column-aware heuristic parser.
 *
 * Title page text (everything before the first scene heading) is extracted
 * and stored separately; it is never passed through the screenplay element
 * classifier so it cannot contaminate scenes[].
 */
export function parseScreenplay(text: string): Screenplay {
  const id = makeId();

  // ── 1. Separate title page from screenplay body ─────────────────────────
  const [titlePageRaw, bodyText] = splitTitlePageFromBody(text);
  const titlePage = parseTitlePageText(titlePageRaw);

  // Use bodyText for all subsequent parsing (body only, no title page noise).
  const bodyClean = stripColumnPrefixes(bodyText);

  // ── 2. Try fountain-js on clean body text ────────────────────────────────
  let fountainElements: ScreenplayElement[] = [];
  try {
    const fountain = new Fountain();
    // Prepend a minimal fountain title block so fountain-js doesn't eat the
    // first scene heading as a title token.
    const fountainInput = `Title: (imported)\n\n${bodyClean}`;
    const result = fountain.parse(fountainInput, true);
    if (result?.tokens?.length) {
      fountainElements = tokensToElements(result.tokens);
    }
  } catch {
    // ignore — fall through to heuristic
  }

  // ── 3. Heuristic parse on original col-prefixed body text ────────────────
  const heuristicElements = heuristicParse(bodyText);

  // ── 4. Pick the better parse ─────────────────────────────────────────────
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

  return { id, titlePage, scenes };
}
