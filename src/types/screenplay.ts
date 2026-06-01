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
