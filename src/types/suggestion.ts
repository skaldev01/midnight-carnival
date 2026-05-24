import type { Provider } from "./chat";

export type SuggestionStatus = "pending" | "accepted" | "rejected";
export type SuggestionType = "rewrite";

export interface Suggestion {
  id: string;
  oldText: string;
  newText: string;
  type: SuggestionType;
  status: SuggestionStatus;
  createdAt: string;
  /** Which provider produced the suggestion. */
  source?: Provider;
}
