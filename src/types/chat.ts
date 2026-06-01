export type ChatRole = "user" | "assistant";

export type Provider = "claude" | "gpt";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  /** Present on assistant messages; identifies which provider produced the reply. */
  provider?: Provider;
  /**
   * Number of screenplay suggestions this assistant message created.
   * Undefined on user messages and on assistant messages that produced none.
   * Used by ChatMessages to render an inline "N suggestions created" badge.
   */
  suggestionCount?: number;
}
