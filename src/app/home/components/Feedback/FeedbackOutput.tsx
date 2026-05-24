"use client";

import type { Feedback } from "@/types/feedback";
import { CheckClipboardIcon, FeedbackIcon } from "../icons";

const SECTION_ORDER: {
  key: keyof Feedback["sections"];
  label: string;
}[] = [
  { key: "working", label: "What's Working" },
  { key: "issues", label: "What's Not Working" },
  { key: "characterNotes", label: "Character Notes" },
  { key: "suggestions", label: "Suggestions" },
];

function providerLabel(provider: Feedback["provider"]): string {
  return provider === "claude" ? "Claude" : "ChatGPT";
}

function relativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const diff = Math.max(0, Date.now() - then);
    const min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} hr ago`;
    const day = Math.floor(hr / 24);
    return `${day} day${day === 1 ? "" : "s"} ago`;
  } catch {
    return "";
  }
}

type Props = {
  feedback: Feedback;
  isApplying: boolean;
  canApply: boolean;
  onApply: () => void;
};

export default function FeedbackOutput({
  feedback,
  isApplying,
  canApply,
  onApply,
}: Props) {
  const sourceLine = `${providerLabel(feedback.provider)} · ${relativeTime(
    feedback.createdAt
  )}`;

  return (
    <div className="feedback-output">
      <div className="feedback-output-header">
        <div className="feedback-output-title">
          <FeedbackIcon width={14} height={14} />
          {feedback.title}
        </div>
        <div className="feedback-output-source">{sourceLine}</div>
      </div>

      {SECTION_ORDER.map(({ key, label }) => {
        const items = feedback.sections[key];
        if (!items || items.length === 0) return null;
        return (
          <div key={key} className="feedback-block">
            <div className="feedback-block-title">{label}</div>
            <div className="feedback-block-body">
              {items.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        );
      })}

      <div className="feedback-actions">
        <button
          type="button"
          className="apply-btn"
          onClick={onApply}
          disabled={isApplying || !canApply}
          title={
            !canApply
              ? "This feedback has no actionable suggestions to apply"
              : undefined
          }
        >
          <CheckClipboardIcon width={11} height={11} />
          {isApplying ? "Applying…" : "Apply Feedback"}
        </button>
        <button type="button" className="save-btn" disabled>
          Saved
        </button>
      </div>
    </div>
  );
}
