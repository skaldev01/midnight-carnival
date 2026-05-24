"use client";

import EditorView from "./EditorView";
import FeedbackView from "./FeedbackView";
import { EditorIcon, FeedbackIcon } from "./icons";

export type ChatTab = "editor" | "feedback";

type Props = {
  tab: ChatTab;
  onTabChange: (tab: ChatTab) => void;
};

const tabs: { id: ChatTab; label: string; Icon: typeof EditorIcon }[] = [
  { id: "editor", label: "Editor", Icon: EditorIcon },
  { id: "feedback", label: "Feedback", Icon: FeedbackIcon },
];

export default function ChatPanel({ tab, onTabChange }: Props) {
  return (
    <section className="chat-panel">
      <div className="tab-bar">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`tab${tab === id ? " active" : ""}`}
            onClick={() => onTabChange(id)}
          >
            <Icon className="tab-icon" />
            {label}
          </button>
        ))}
      </div>

      <EditorView active={tab === "editor"} />
      <FeedbackView
        active={tab === "feedback"}
        onApplyToEditor={() => onTabChange("editor")}
      />
    </section>
  );
}
