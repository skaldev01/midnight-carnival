// PDF text extraction via pdfjs-dist. Browser-only.
// pdfjs-dist is dynamically imported to avoid evaluating its module-level
// code (DOMMatrix, etc.) during Next.js server rendering.
// The worker file is served from /pdf.worker.min.mjs (copied from
// node_modules during postinstall — see package.json).

import type { TextItem } from "pdfjs-dist/types/src/display/api";

export type ExtractProgress = (fraction: number) => void;

// Sentinel line emitted between pages so downstream parsers can tell where
// one PDF page ends and the next begins. A real screenplay title page is
// exactly the first page; anything after the first page break is body
// content (foreword, intro, "Let's call it 1981", etc.).
export const PAGE_BREAK_MARKER = "\f"; // form-feed — won't collide with text

let pdfjsModule: typeof import("pdfjs-dist") | null = null;

async function loadPdfjs() {
  if (pdfjsModule) return pdfjsModule;
  if (typeof window === "undefined") {
    throw new Error("pdfjs-dist can only be loaded in the browser.");
  }
  const mod = await import("pdfjs-dist");
  mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  pdfjsModule = mod;
  return mod;
}

/**
 * Extract text from a PDF file, preserving line breaks and approximate
 * left-indent so downstream parsers can detect character cues / dialogue
 * indentation.
 */
export class PdfExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfExtractError";
  }
}

export async function extractPdfText(
  file: File,
  onProgress?: ExtractProgress
): Promise<string> {
  const pdfjsLib = await loadPdfjs();

  let pdf: Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>;
  try {
    const buffer = await file.arrayBuffer();
    pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new PdfExtractError(
      `This file isn't a valid PDF or it's corrupted (${reason}).`
    );
  }

  if (pdf.numPages === 0) {
    throw new PdfExtractError("This PDF has no pages.");
  }

  // First pass: pull every page's text items. We hold them so the line-height
  // baseline can be computed across the WHOLE document, not per page. A single
  // page may be all short one-line elements (e.g. a rapid dialogue exchange)
  // and so carry no within-paragraph gap to measure; a document-wide baseline
  // borrows that measurement from the content-rich pages.
  const pageItems: TextItem[][] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    try {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      pageItems.push(content.items as TextItem[]);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new PdfExtractError(
        `Failed reading page ${pageNum} of ${pdf.numPages} (${reason}).`
      );
    }
    onProgress?.(pageNum / pdf.numPages);
  }

  // Compute the single-line height once, from gaps pooled across all pages.
  const lineGap = computeLineGap(pageItems.flatMap(pageLineGaps));

  // Second pass: format each page using the shared baseline.
  const pages = pageItems.map((items) => reconstructPageText(items, lineGap));

  // Join with an explicit page-break marker on its own line so the title-page
  // splitter can stop at the first page boundary rather than swallowing later
  // intro/foreword pages.
  const text = pages.join(`\n${PAGE_BREAK_MARKER}\n`);
  if (!text.trim()) {
    throw new PdfExtractError(
      "We couldn't extract any text from this PDF. It may be a scanned image — try OCR first."
    );
  }
  return text;
}

// Standard screenplay PDFs are 8.5" wide (612pt). The left body margin
// sits at ~1.5" (108pt) and Courier 12pt glyphs are ~7.2pt wide, giving
// 10 characters per inch. We record raw X in points so downstream
// classification can use real measurements rather than fragile space counts.
const POINTS_PER_CHAR = 7.2; // Courier 12pt at 72dpi
const PAGE_LEFT_MARGIN_PT = 72; // ~1 inch minimum left margin in most PDFs

// Group a page's items into visual lines (Y rounded to 2pt) and return the
// line keys top-to-bottom (PDF Y grows upward, so descending).
function groupIntoLines(
  items: TextItem[]
): { yKeys: number[]; lineBuckets: Map<number, TextItem[]> } {
  const lineBuckets = new Map<number, TextItem[]>();
  for (const item of items) {
    if (!item.str) continue;
    const y = Math.round(item.transform[5] / 2) * 2;
    const list = lineBuckets.get(y);
    if (list) list.push(item);
    else lineBuckets.set(y, [item]);
  }
  const yKeys = [...lineBuckets.keys()].sort((a, b) => b - a);
  return { yKeys, lineBuckets };
}

// Positive vertical gaps between consecutive visual lines on one page.
function pageLineGaps(items: TextItem[]): number[] {
  const { yKeys } = groupIntoLines(items);
  const gaps: number[] = [];
  for (let i = 1; i < yKeys.length; i++) {
    const g = yKeys[i - 1] - yKeys[i]; // descending Y → positive gap
    if (g > 0) gaps.push(g);
  }
  return gaps;
}

// Determine the typical single-line vertical gap so we can detect paragraph
// breaks. PDFs don't emit blank lines — a paragraph break is just a larger
// vertical gap between two text lines. A gap in the paragraph-break RANGE
// (≥1.6× and ≤3× this height, see callers) is treated as a blank line.
//
// The baseline is the SMALLEST recurring gap, not the median. Within a
// paragraph, lines sit one line-height apart; paragraph breaks are integer
// multiples (2×, 3×). The median fails on pages full of short (1–3 line)
// paragraphs: there the larger between-paragraph gaps outnumber the single-line
// gaps and drag the median up onto the paragraph gap itself, so every real
// break falls below the threshold and the whole page merges into one block.
// The smallest gap that recurs often enough to be a real cluster (not a one-off
// tight pair) is the true single-line spacing.
//
// We pass the gaps pooled across ALL pages (see extractPdfText) so a page made
// up entirely of one-line elements — which has no within-paragraph gap of its
// own — still gets the document's real line height rather than mistaking its
// element spacing for the baseline.
function computeLineGap(gaps: number[]): number {
  let lineGap = 12; // sensible Courier-12 default
  if (gaps.length > 0) {
    const counts = new Map<number, number>();
    for (const g of gaps) counts.set(g, (counts.get(g) ?? 0) + 1);
    const maxCount = Math.max(...counts.values());
    // A real line-height cluster recurs; require ≥25% of the most common gap's
    // frequency (and at least twice) so a stray tight pair can't win.
    const minCount = Math.max(2, maxCount * 0.25);
    const candidates = [...counts.keys()].filter((g) => counts.get(g)! >= minCount);
    if (candidates.length > 0) {
      lineGap = Math.min(...candidates);
    } else {
      const sorted = [...gaps].sort((a, b) => a - b);
      lineGap = sorted[Math.floor(sorted.length / 2)] || lineGap;
    }
  }
  return lineGap;
}

/**
 * Reconstruct one page's text. Each output line is prefixed with its column
 * offset (in Courier characters from the page left edge) so the heuristic
 * parser can classify elements by horizontal position rather than by space
 * count, which is unreliable across different PDF producers. `lineGap` is the
 * document-wide single-line height used to detect paragraph breaks.
 *
 * Output format per line:  "<col>|<text>"
 * e.g. "0|INT. BEDROOM - NIGHT" or "25|JOHN" or "15|Where are you going?"
 */
function reconstructPageText(items: TextItem[], lineGap: number): string {
  const { yKeys, lineBuckets } = groupIntoLines(items);

  // Find the minimum X across substantive lines to use as the left baseline.
  // We exclude very short items (page numbers, single-letter artefacts) which
  // can appear further left than the body margin and skew column computation.
  let minX = Infinity;
  for (const y of yKeys) {
    const lineItems = lineBuckets.get(y)!;
    const lineText = lineItems.map((it) => it.str).join("").trim();
    // Only use lines with ≥4 characters as baseline candidates.
    if (lineText.length < 4) continue;
    const first = lineItems.sort((a, b) => a.transform[4] - b.transform[4])[0];
    if (first) minX = Math.min(minX, first.transform[4]);
  }
  if (!isFinite(minX)) minX = PAGE_LEFT_MARGIN_PT;

  // A single blank line is ~2× line height; a header/footer (or page-number)
  // separation is many line-heights. Capping the range at 3× avoids emitting a
  // spurious blank that would split a paragraph wrapping across a page.
  const paragraphGapMin = lineGap * 1.6;
  const paragraphGapMax = lineGap * 3;

  const lines: string[] = [];
  let prevY: number | null = null;
  for (const y of yKeys) {
    const lineItems = lineBuckets.get(y)!.sort(
      (a, b) => a.transform[4] - b.transform[4]
    );

    const firstX = lineItems[0]?.transform[4] ?? minX;
    // Column offset in Courier characters from the leftmost body text.
    const col = Math.max(0, Math.round((firstX - minX) / POINTS_PER_CHAR));

    const text = lineItems
      .map((it) => it.str)
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;

    // Emit a blank line when the vertical gap from the previous line falls in
    // the paragraph-break range. Gaps larger than the range are header/footer
    // separation, not paragraph breaks, and must not insert a blank line.
    if (prevY !== null) {
      const gap = prevY - y;
      if (gap >= paragraphGapMin && gap <= paragraphGapMax) {
        lines.push("");
      }
    }
    prevY = y;

    lines.push(`${col}|${text}`);
  }

  return lines.join("\n");
}
