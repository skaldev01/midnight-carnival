"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import ProviderToggle, {
  type Provider,
} from "@/components/shared/ProviderToggle";
import { useSuggestions } from "@/hooks/useSuggestions";
import { ArrowUpIcon, PaperclipIcon } from "../icons";

type Props = {
  provider: Provider;
  onProviderChange: (p: Provider) => void;
  onSend: (content: string) => void;
  isResponding: boolean;
  disabled?: boolean;
};

export default function ChatInput({
  provider,
  onProviderChange,
  onSend,
  isResponding,
  disabled = false,
}: Props) {
  const { pendingCount } = useSuggestions();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow up to a max height.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  }, [value]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || isResponding || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const sendDisabled = isResponding || disabled || !value.trim();

  return (
    <div className="chat-input-area">
      <div className="provider-row">
        <ProviderToggle value={provider} onChange={onProviderChange} />
        {pendingCount > 0 && (
          <div className="suggestion-count">
            {pendingCount} suggestion{pendingCount === 1 ? "" : "s"} pending
          </div>
        )}
      </div>
      <div className="chat-input">
        <button type="button" className="icon-btn" title="Attach file" disabled>
          <PaperclipIcon width={16} height={16} />
        </button>
        <textarea
          ref={textareaRef}
          placeholder={
            disabled
              ? "Select a project to start chatting"
              : 'Edit the script in plain English — "rewrite scene 3," "apply these notes," etc.'
          }
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          disabled={disabled}
        />
        <button
          type="button"
          className="send-btn"
          title="Send"
          onClick={submit}
          disabled={sendDisabled}
          aria-label="Send message"
        >
          <ArrowUpIcon width={14} height={14} />
        </button>
      </div>
    </div>
  );
}
