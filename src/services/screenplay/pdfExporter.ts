import { jsPDF } from "jspdf";
import type {
  Screenplay,
  ScreenplayElement,
  ScreenplayElementType,
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

export function exportScreenplayToPdf(
  script: Screenplay,
  projectTitle: string,
): void {
  const doc = new jsPDF({ unit: "in", format: "letter", orientation: "portrait" });
  doc.setFont("courier", "normal");
  doc.setFontSize(12);

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
