"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage, Provider } from "@/types/chat";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function providerLabel(provider: Provider): string {
  return provider === "claude" ? "Claude" : "ChatGPT";
}

type Props = {
  messages: ChatMessage[];
  isResponding: boolean;
  provider: Provider;
  error?: string | null;
  onDismissError?: () => void;
};

export default function ChatMessages({
  messages,
  isResponding,
  provider,
  error,
  onDismissError,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom whenever the conversation grows
  // or the typing indicator / error toggles.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, isResponding, error]);

  const showEmptyState = messages.length === 0 && !isResponding && !error;

  return (
    <div className="chat-messages" ref={containerRef}>
      {showEmptyState && (
        <div className="message message-system">
          <div className="message-content">
            Send a message to start the conversation.
          </div>
        </div>
      )}

      {messages.map((m) => {
        const isUser = m.role === "user";
        const label = isUser
          ? "You"
          : providerLabel(m.provider ?? provider);
        return (
          <div
            key={m.id}
            className={`message ${isUser ? "message-user" : "message-ai"}`}
          >
            <div className="message-header">
              <span className="message-author">{label}</span>
              {!isUser && (
                <span className="message-time">{formatTime(m.timestamp)}</span>
              )}
            </div>
            <div className="message-content">{m.content}</div>
            {!isUser && m.suggestionCount !== undefined && m.suggestionCount > 0 && (
              <div className="message-suggestion-badge">
                {m.suggestionCount === 1
                  ? "1 edit suggestion added — review in the script panel"
                  : `${m.suggestionCount} edit suggestions added — review in the script panel`}
              </div>
            )}
          </div>
        );
      })}

      {isResponding && (
        <div className="message message-ai">
          <div className="message-header">
            <span className="message-author">{providerLabel(provider)}</span>
            <span className="message-time">Thinking…</span>
          </div>
          <div className="message-content typing-indicator" aria-label="Thinking">
            <span />
            <span />
            <span />
          </div>
        </div>
      )}

      {error && (
        <div className="message message-error">
          <div className="message-header">
            <span className="message-author">Error</span>
            {onDismissError && (
              <button
                type="button"
                className="message-error-dismiss"
                onClick={onDismissError}
                aria-label="Dismiss error"
              >
                ×
              </button>
            )}
          </div>
          <div className="message-content">{error}</div>
        </div>
      )}
    </div>
  );
}
