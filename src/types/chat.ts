export type ChatRole = "user" | "assistant";

export type Provider = "claude" | "gpt";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  /** Present on assistant messages; identifies which provider produced the reply. */
  provider?: Provider;
}
