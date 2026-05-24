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

export interface Screenplay {
  id: string;
  scenes: ScreenplayElement[];
}
