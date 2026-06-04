export type ScreenplayElementType =
  | "scene"
  | "action"
  | "character"
  | "dialogue"
  | "parenthetical"
  | "transition";

export interface ScreenplayElement {
  type: ScreenplayElementType;
  content: string;
  /**
   * When true, this element starts a new page in the original source PDF.
   * Purely presentational — used to render a visual page break in the editor
   * and a real page break on export. Optional so it never affects the
   * suggestion-matching pipeline (which only reads `type`/`content`).
   */
  pageBreakBefore?: boolean;
}

/**
 * Structured representation of a screenplay title page.
 * All fields are optional — real PDFs may omit any of them.
 */
export interface TitlePage {
  title: string;
  authors: string[];   // "Written by / John Smith" → ["John Smith"]
  contact: string;     // everything in the contact block, newline-joined
  draft: string;       // e.g. "First Draft", "Revised Draft – 2024"
  extra: string[];     // any additional lines that don't fit above buckets
}

export interface Screenplay {
  id: string;
  titlePage: TitlePage | null;
  scenes: ScreenplayElement[];
}
