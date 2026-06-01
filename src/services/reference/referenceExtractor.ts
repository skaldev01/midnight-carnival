/**
 * Browser-side text extraction for reference documents.
 * Supports PDF (via pdfjs-dist), DOCX (via mammoth), and plain text.
 *
 * The extracted text is stored verbatim on ProjectReference.content and
 * injected into the AI system prompt so the model can read and apply it.
 */

import type { ReferenceFileType } from "@/types/project";

export class ReferenceExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceExtractError";
  }
}

// ---------------------------------------------------------------------------
// File type detection
// ---------------------------------------------------------------------------

export function detectFileType(file: File): ReferenceFileType {
  const name = file.name.toLowerCase();
  if (
    file.type === "application/pdf" ||
    name.endsWith(".pdf")
  )
    return "pdf";
  if (
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  )
    return "docx";
  return "txt";
}

export function isAcceptedFileType(file: File): boolean {
  const t = detectFileType(file);
  return t === "pdf" || t === "docx" || t === "txt";
}

// ---------------------------------------------------------------------------
// PDF extraction — reuses the existing pdfjs loader from the screenplay parser.
// We import extractPdfText but strip the col-prefix format it adds for the
// screenplay heuristic parser; reference docs just need clean plain text.
// ---------------------------------------------------------------------------

async function extractPdf(file: File): Promise<string> {
  // Dynamic import keeps pdfjs out of the server bundle.
  const { extractPdfText } = await import("@/services/pdf/pdfParser");
  const colPrefixed = await extractPdfText(file);

  // Strip the "N|" column prefix the screenplay extractor adds.
  return colPrefixed
    .split("\n")
    .map((line) => {
      const pipeIdx = line.indexOf("|");
      if (
        pipeIdx > 0 &&
        pipeIdx <= 4 &&
        !isNaN(parseInt(line.slice(0, pipeIdx), 10))
      ) {
        return line.slice(pipeIdx + 1);
      }
      return line;
    })
    .join("\n")
    .trim();
}

// ---------------------------------------------------------------------------
// DOCX extraction via mammoth
// ---------------------------------------------------------------------------

async function extractDocx(file: File): Promise<string> {
  // mammoth is a Node/browser dual package; dynamic import keeps bundle lean.
  let mammoth: typeof import("mammoth");
  try {
    mammoth = await import("mammoth");
  } catch {
    throw new ReferenceExtractError(
      "DOCX support is not available. Please convert your document to PDF or TXT."
    );
  }

  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });

  if (!result.value.trim()) {
    throw new ReferenceExtractError(
      "Could not extract text from this DOCX file. It may be empty or contain only images."
    );
  }

  return result.value.trim();
}

// ---------------------------------------------------------------------------
// Plain text extraction
// ---------------------------------------------------------------------------

async function extractTxt(file: File): Promise<string> {
  const text = await file.text();
  if (!text.trim()) {
    throw new ReferenceExtractError("This text file appears to be empty.");
  }
  return text.trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const MAX_REFERENCE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Extract plain text from a PDF, DOCX, or TXT reference document.
 * Returns the extracted text ready to be stored on ProjectReference.content.
 */
export async function extractReferenceText(file: File): Promise<string> {
  if (file.size === 0) {
    throw new ReferenceExtractError("This file is empty.");
  }
  if (file.size > MAX_REFERENCE_BYTES) {
    throw new ReferenceExtractError(
      `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`
    );
  }

  const type = detectFileType(file);

  switch (type) {
    case "pdf":
      return extractPdf(file);
    case "docx":
      return extractDocx(file);
    case "txt":
      return extractTxt(file);
  }
}

/**
 * Cap reference content before storing — very long documents slow the AI
 * and inflate localStorage. We keep the first MAX_CHARS characters which
 * is comfortably within model context budgets.
 */
const MAX_CONTENT_CHARS = 40_000;

export function truncateReferenceContent(content: string): string {
  if (content.length <= MAX_CONTENT_CHARS) return content;
  return (
    content.slice(0, MAX_CONTENT_CHARS) +
    "\n\n[Document truncated to 40,000 characters for AI context]"
  );
}
