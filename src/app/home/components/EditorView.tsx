"use client";

import { useCurrentProject } from "@/hooks/useProjects";
import { useChat } from "@/hooks/useChat";
import { FileIcon } from "./icons";
import ChatMessages from "./Chat/ChatMessages";
import ChatInput from "./Chat/ChatInput";

type Props = {
  active: boolean;
};

export default function EditorView({ active }: Props) {
  const project = useCurrentProject();
  const title = project?.title ?? "Untitled";
  const instructions = project?.instructions?.trim() ?? "";
  const references = project?.references ?? [];

  const {
    messages,
    provider,
    setProvider,
    sendMessage,
    isResponding,
    error,
    clearError,
  } = useChat();

  return (
    <div className={`editor-view${active ? " active" : ""}`}>
      <header className="chat-header">
        <div className="chat-title">{title}</div>
        <div className="chat-context">
          {references.map((ref) => (
            <span key={ref.id} className="context-chip">
              <FileIcon className="chip-icon" />
              {ref.name}
            </span>
          ))}
          <button type="button" className="context-add">+ Add reference</button>
        </div>
      </header>

      {instructions && (
        <div className="instructions-bar">
          <div className="instructions-label">Custom Instructions</div>
          <div className="instructions-text">{instructions}</div>
        </div>
      )}

      <ChatMessages
        messages={messages}
        isResponding={isResponding}
        provider={provider}
        error={error}
        onDismissError={clearError}
      />

      <ChatInput
        provider={provider}
        onProviderChange={setProvider}
        onSend={sendMessage}
        isResponding={isResponding}
        disabled={!project}
      />
    </div>
  );
}
