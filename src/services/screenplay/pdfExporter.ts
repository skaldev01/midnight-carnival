import { jsPDF } from "jspdf";
import type {
  Screenplay,
  ScreenplayElement,
  ScreenplayElementType,
  TitlePage,
} from "@/types/screenplay";

// Industry-standard screenplay layout. Units in inches; Courier 12pt at
// 10 cpi gives ~6 lines/inch. Indents are measured from the left page edge.
const PAGE_WIDTH = 8.5;
const PAGE_HEIGHT = 11;
const MARGIN_TOP = 1;
const MARGIN_BOTTOM = 1;
const MARGIN_LEFT = 1.5;
const MARGIN_RIGHT = 1;
const LINE_HEIGHT = 1 / 6;

// Offsets from the left page edge (industry standard for spec scripts).
const INDENT_DIALOGUE = 2.5;
const INDENT_PARENTHETICAL = 3.1;
const INDENT_CHARACTER = 3.7;

const WIDTH_ACTION = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const WIDTH_DIALOGUE = 3.5;
const WIDTH_PARENTHETICAL = 2.0;
const WIDTH_CHARACTER = 3.5;

type Block = {
  x: number;
  text: string;
  width: number;
  blankLineBefore: boolean;
  align?: "left" | "right";
};

function uppercase(s: string): string {
  return s.toUpperCase();
}

function wrapInParens(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) return trimmed;
  return `(${trimmed})`;
}

function elementToBlock(el: ScreenplayElement): Block | null {
  const text = el.content.trim();
  if (!text) return null;

  switch (el.type) {
    case "scene":
      return {
        x: MARGIN_LEFT,
        text: uppercase(text),
        width: WIDTH_ACTION,
        blankLineBefore: true,
      };
    case "action":
      return {
        x: MARGIN_LEFT,
        text,
        width: WIDTH_ACTION,
        blankLineBefore: true,
      };
    case "character":
      return {
        x: INDENT_CHARACTER,
        text: uppercase(text),
        width: WIDTH_CHARACTER,
        blankLineBefore: true,
      };
    case "parenthetical":
      return {
        x: INDENT_PARENTHETICAL,
        text: wrapInParens(text),
        width: WIDTH_PARENTHETICAL,
        blankLineBefore: false,
      };
    case "dialogue":
      return {
        x: INDENT_DIALOGUE,
        text,
        width: WIDTH_DIALOGUE,
        blankLineBefore: false,
      };
    case "transition":
      return {
        x: PAGE_WIDTH - MARGIN_RIGHT,
        text: uppercase(text),
        width: WIDTH_ACTION,
        blankLineBefore: true,
        align: "right",
      };
    default: {
      const _exhaustive: never = el.type;
      void _exhaustive;
      return null;
    }
  }
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
  return cleaned || "screenplay";
}

// ---------------------------------------------------------------------------
// Title page renderer
// ---------------------------------------------------------------------------
// Industry-standard title page:
//   - Title: centred vertically in the upper-middle third of the page
//   - "Written by" + author names: centred just below the title
//   - Draft info: centred below authors
//   - Contact: bottom-left corner
// ---------------------------------------------------------------------------
function writeTitlePage(doc: jsPDF, tp: TitlePage): void {
  const centerX = PAGE_WIDTH / 2;

  // Title — start at roughly 1/3 down the page.
  let y = PAGE_HEIGHT / 3;

  if (tp.title) {
    doc.setFont("courier", "bold");
    doc.setFontSize(14);
    const titleLines: string[] = doc.splitTextToSize(
      tp.title.toUpperCase(),
      PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
    );
    for (const line of titleLines) {
      doc.text(line, centerX, y, { align: "center" });
      y += LINE_HEIGHT * 1.5;
    }
    y += LINE_HEIGHT; // gap before "Written by"
  }

  doc.setFont("courier", "normal");
  doc.setFontSize(12);

  if (tp.authors.length > 0) {
    doc.text("Written by", centerX, y, { align: "center" });
    y += LINE_HEIGHT * 1.4;
    for (const author of tp.authors) {
      doc.text(author, centerX, y, { align: "center" });
      y += LINE_HEIGHT * 1.4;
    }
  }

  if (tp.draft) {
    y += LINE_HEIGHT * 0.5;
    doc.text(tp.draft, centerX, y, { align: "center" });
    y += LINE_HEIGHT;
  }

  // Contact — bottom-left corner, grows upward from the bottom margin.
  if (tp.contact) {
    const contactLines: string[] = doc.splitTextToSize(
      tp.contact,
      PAGE_WIDTH / 2
    );
    // Anchor the last line just above the bottom margin; draw lines upward.
    const bottomAnchor = PAGE_HEIGHT - MARGIN_BOTTOM - LINE_HEIGHT * 0.5;
    const blockHeight = contactLines.length * LINE_HEIGHT * 1.2;
    let cy = bottomAnchor - blockHeight + LINE_HEIGHT * 1.2;
    for (const line of contactLines) {
      doc.text(line, MARGIN_LEFT, cy);
      cy += LINE_HEIGHT * 1.2;
    }
  }
}

export function exportScreenplayToPdf(
  script: Screenplay,
  projectTitle: string,
): void {
  const doc = new jsPDF({ unit: "in", format: "letter", orientation: "portrait" });
  doc.setFont("courier", "normal");
  doc.setFontSize(12);

  // ── Title page (page 1 if present) ────────────────────────────────────
  if (script.titlePage) {
    writeTitlePage(doc, script.titlePage);
    doc.addPage();
  }

  // ── Screenplay body ────────────────────────────────────────────────────
  const usableBottom = PAGE_HEIGHT - MARGIN_BOTTOM;
  let y = MARGIN_TOP;
  let firstOnPage = true;

  const newPage = () => {
    doc.addPage();
    y = MARGIN_TOP;
    firstOnPage = true;
  };

  for (const element of script.scenes) {
    const block = elementToBlock(element);
    if (!block) continue;

    if (block.blankLineBefore && !firstOnPage) {
      y += LINE_HEIGHT;
      if (y > usableBottom) {
        newPage();
      }
    }

    const lines: string[] = doc.splitTextToSize(block.text, block.width);
    for (const line of lines) {
      if (y + LINE_HEIGHT > usableBottom) {
        newPage();
      }
      const options =
        block.align === "right" ? { align: "right" as const } : undefined;
      doc.text(line, block.x, y + LINE_HEIGHT * 0.8, options);
      y += LINE_HEIGHT;
      firstOnPage = false;
    }
  }

  doc.save(`${sanitizeFilename(projectTitle)}.pdf`);
}
