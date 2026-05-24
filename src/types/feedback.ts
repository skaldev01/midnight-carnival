import type { Provider } from "./chat";

export interface FeedbackSections {
  working: string[];
  issues: string[];
  characterNotes: string[];
  suggestions: string[];
}

export interface Feedback {
  id: string;
  title: string;
  prompt: string;
  provider: Provider;
  createdAt: string;
  sections: FeedbackSections;
}

export function emptyFeedbackSections(): FeedbackSections {
  return { working: [], issues: [], characterNotes: [], suggestions: [] };
}
