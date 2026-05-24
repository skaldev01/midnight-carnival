// PDF text extraction via pdfjs-dist. Browser-only.
// pdfjs-dist is dynamically imported to avoid evaluating its module-level
// code (DOMMatrix, etc.) during Next.js server rendering.
// The worker file is served from /pdf.worker.min.mjs (copied from
// node_modules during postinstall — see package.json).

import type { TextItem } from "pdfjs-dist/types/src/display/api";

export type ExtractProgress = (fraction: number) => void;

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

  const pages: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    try {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      pages.push(reconstructPageText(content.items as TextItem[]));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new PdfExtractError(
        `Failed reading page ${pageNum} of ${pdf.numPages} (${reason}).`
      );
    }
    onProgress?.(pageNum / pdf.numPages);
  }

  const text = pages.join("\n\n");
  if (!text.trim()) {
    throw new PdfExtractError(
      "We couldn't extract any text from this PDF. It may be a scanned image — try OCR first."
    );
  }
  return text;
}

/**
 * Group items by Y coordinate (visual line), sort by X within a line,
 * preserve the leading indent as spaces so character cues remain
 * detectable downstream.
 */
function reconstructPageText(items: TextItem[]): string {
  const lineBuckets = new Map<number, TextItem[]>();

  for (const item of items) {
    if (!item.str) continue;
    const y = Math.round(item.transform[5]);
    const list = lineBuckets.get(y);
    if (list) list.push(item);
    else lineBuckets.set(y, [item]);
  }

  // PDF Y grows upward → sort descending so top-of-page is first.
  const yKeys = [...lineBuckets.keys()].sort((a, b) => b - a);

  const lines: string[] = [];
  for (const y of yKeys) {
    const lineItems = lineBuckets.get(y)!.sort(
      (a, b) => a.transform[4] - b.transform[4]
    );

    const firstX = lineItems[0]?.transform[4] ?? 0;
    const indent = Math.max(0, Math.round(firstX / 6));

    const text = lineItems
      .map((it) => it.str)
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;

    lines.push(" ".repeat(indent) + text);
  }

  return lines.join("\n");
}
