import type { ChatMessage } from "./chat";
import type { DriveMetadata } from "./drive";
import type { Feedback } from "./feedback";
import type { Screenplay } from "./screenplay";
import type { Suggestion } from "./suggestion";

export type ProjectReference = {
  id: string;
  name: string;
};

export interface Project {
  id: string;
  title: string;
  script: Screenplay | null;
  instructions: string;
  references: ProjectReference[];
  feedback: Feedback[];
  chats: ChatMessage[];
  suggestions: Suggestion[];
  createdAt: string;
  updatedAt: string;
  /** Drive sync metadata. Absent until the project is first pushed to Drive. */
  cloud?: DriveMetadata | null;
}

export type ProjectPatch = Partial<
  Omit<Project, "id" | "createdAt" | "updatedAt">
>;
