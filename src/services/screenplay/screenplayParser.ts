import { Fountain, type Token } from "fountain-js";
import { PAGE_BREAK_MARKER } from "@/services/pdf/pdfParser";
import type {
  Screenplay,
  ScreenplayElement,
  ScreenplayElementType,
  TitlePage,
} from "@/types/screenplay";

const SCENE_PREFIX = /^(INT\.?|EXT\.?|EST\.?|I\/E\.?|INT\.?\/EXT\.?)[\s.]/i;
const TRANSITION_SUFFIX = /\b(?:TO:|FADE\s+OUT\.?|FADE\s+IN:?|CUT\s+TO:|DISSOLVE\s+TO:)$/i;

// Page-furniture artefacts that print at the top/bottom of every screenplay
// page and must never become screenplay elements:
//   - Page numbers: "1.", "23.", "ii", "iii" (arabic or roman, optional dot)
//   - Revision/footer codes: a short slash-joined token like "TP/SS"
// These are matched against the already-trimmed line text.
const PAGE_NUMBER_RE = /^(?:\d{1,4}\.?|[ivxlcdm]{1,6}\.?)$/i;
// Require ≥2 letters on at least one side so a stray "A/C" (air-con) in action
// isn't mistaken for an initials footer, while "TP/SS" still matches.
const FOOTER_CODE_RE = /^(?:[A-Z]{2,4}\/[A-Z]{1,4}|[A-Z]{1,4}\/[A-Z]{2,4})\.?$/;

function isPageFurniture(text: string): boolean {
  return PAGE_NUMBER_RE.test(text) || FOOTER_CODE_RE.test(text);
}

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

    // First page break — the title page is exactly the first PDF page, so
    // anything from the next page onward is body (foreword / intro pages,
    // e.g. JOKER's "This story takes place in its own universe…" on page ii).
    if (raw.includes(PAGE_BREAK_MARKER)) {
      return [lines.slice(0, i).join("\n"), lines.slice(i + 1).join("\n")];
    }

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
    .filter((l) => !l.includes(PAGE_BREAK_MARKER))
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

function heuristicParse(
  text: string,
  runningHeader?: string | null
): ScreenplayElement[] {
  const rawLines = text.split("\n");
  const out: ScreenplayElement[] = [];

  // A running header is the script title (or a short slug) reprinted at the top
  // of every page. Normalise it so we can drop it wherever it reappears.
  const headerNorm = runningHeader
    ? runningHeader.trim().toUpperCase().replace(/\s+/g, " ")
    : null;
  const isRunningHeader = (t: string): boolean =>
    !!headerNorm && t.toUpperCase().replace(/\s+/g, " ") === headerNorm;

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

  // A PDF emits one element per *visual* line, so a single action paragraph or
  // a multi-line speech arrives as several lines. We MERGE consecutive lines of
  // the same wrap-able type (action / dialogue) into one element — otherwise a
  // wrapped sentence like "…smudged on the sides / of his face." becomes two
  // elements.
  //
  // A blank line ends the current paragraph (sets `breakRun`), so the next
  // same-type line starts a fresh element rather than continuing the old one.
  // Scene / character / transition / parenthetical are always standalone.
  const MERGEABLE = new Set<ScreenplayElementType>(["action", "dialogue"]);
  let breakRun = true; // force a new element on the first emit

  // When we cross a page-break marker, an element starts a new source page —
  // but only if the break falls at a real paragraph boundary. A mid-paragraph
  // break is dropped so a wrapped sentence is never stranded on a new page.
  let pendingPageBreak = false;
  // True between a page-break marker and the first body line of the next page,
  // so header-gap blank lines in that window don't break the paragraph run.
  let afterPageBreak = false;

  const emit = (type: ScreenplayElementType, lineText: string) => {
    const prev = out[out.length - 1];
    const canMerge =
      prev && !breakRun && prev.type === type && MERGEABLE.has(type);

    if (canMerge) {
      // Continuation of the same paragraph — join with a space.
      prev.content = `${prev.content} ${lineText}`.replace(/\s+/g, " ").trim();
    } else {
      const el: ScreenplayElement = { type, content: lineText };
      if (pendingPageBreak) {
        el.pageBreakBefore = true;
      }
      out.push(el);
    }
    // A page break only takes effect when it coincides with a real paragraph
    // start (a new, non-merged element). Once we've processed the first content
    // line after the marker, clear it either way — we never split a paragraph
    // mid-wrap (which would strand a fragment on a near-empty page).
    pendingPageBreak = false;
    breakRun = false;
  };

  for (const raw of rawLines) {
    // Page-break sentinel between PDF pages. We only honor it if the previous
    // paragraph has already ended (breakRun true → the next element is a fresh
    // paragraph). If it falls mid-paragraph, we DROP it: the line continues the
    // current paragraph and no break is recorded, so a sentence that merely
    // wrapped across the page boundary never strands a fragment on a new page.
    if (raw.includes(PAGE_BREAK_MARKER)) {
      if (breakRun) pendingPageBreak = true;
      afterPageBreak = true;
      continue;
    }

    const { col, text } = parseLine(raw);

    if (!text) {
      // Blank line — paragraph boundary. End the current merge run. BUT ignore
      // blank lines that sit between a page break and the first body line: at
      // the top of a page the large gap to the running header would otherwise
      // insert a spurious blank that strands a wrapped sentence on a new page.
      if (afterPageBreak) continue;
      inDialogue = false;
      breakRun = true;
      continue;
    }

    // Drop page numbers / footer codes (e.g. "ii", "1.", "TP/SS") and the
    // running header (the script title reprinted atop every page) — they are
    // page furniture, not screenplay content. A dropped line shouldn't itself
    // break a paragraph run, so a sentence wrapping across a page boundary
    // ("…on the sides" / [JOKER header] / "of his face.") stays one paragraph.
    if (isPageFurniture(text) || isRunningHeader(text)) {
      continue;
    }

    // First real content line after a page break — stop suppressing blanks.
    afterPageBreak = false;

    // Scene headings are unambiguous regardless of column.
    if (SCENE_PREFIX.test(text)) {
      breakRun = true;
      emit("scene", text);
      breakRun = true;
      inDialogue = false;
      continue;
    }

    // Transitions: right-side all-caps line.
    if (TRANSITION_SUFFIX.test(text) && text === text.toUpperCase()) {
      breakRun = true;
      emit("transition", text);
      breakRun = true;
      inDialogue = false;
      continue;
    }

    // Parentheticals inside dialogue block — always their own element.
    if (text.startsWith("(") && text.endsWith(")")) {
      breakRun = true;
      emit("parenthetical", text);
      breakRun = true;
      // parenthetical keeps inDialogue true — next line is still dialogue.
      continue;
    }

    const isAllCaps =
      text === text.toUpperCase() && /[A-Z]/.test(text) && text.length <= 50;

    if (isColumnar) {
      // --- Column-primary classification ---
      if (col <= COL_ACTION_MAX) {
        // Left column: scene (handled above) or action.
        emit("action", text);
        inDialogue = false;
      } else if (col >= adaptiveCharMin && isAllCaps) {
        // Character cue zone: all-caps at the character column. Standalone.
        breakRun = true;
        emit("character", text);
        breakRun = true;
        inDialogue = true;
      } else if (col >= adaptiveDialogueMin && col <= adaptiveDialogueMax) {
        // Dialogue zone: between action and character columns.
        if (inDialogue) {
          emit("dialogue", text);
        } else {
          // Could be action that happens to indent (e.g. dual-column action).
          emit("action", text);
        }
      } else {
        // Fallback based on dialogue context.
        if (inDialogue) {
          emit("dialogue", text);
        } else {
          emit("action", text);
        }
      }
    } else {
      // --- Legacy plain-text path: all-caps heuristic ---
      if (isAllCaps && text.length <= 45 && !/[.!?]$/.test(text)) {
        breakRun = true;
        emit("character", text);
        breakRun = true;
        inDialogue = true;
      } else if (inDialogue) {
        emit("dialogue", text);
      } else {
        emit("action", text);
      }
    }
  }

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

  // Drop page-break markers from the body before parsing — they're structural
  // sentinels, not screenplay text, and would otherwise become stray elements.
  const bodyNoBreaks = bodyText
    .split("\n")
    .filter((l) => !l.includes(PAGE_BREAK_MARKER))
    .join("\n");

  // Use bodyText for all subsequent parsing (body only, no title page noise).
  const bodyClean = stripColumnPrefixes(bodyNoBreaks);

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
  // Pass the body WITH page-break markers so the parser can flag the element
  // that starts each new source page (rendered as a visual page break), plus
  // the title so the running page header can be filtered out.
  const heuristicElements = heuristicParse(bodyText, titlePage?.title ?? null);

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
