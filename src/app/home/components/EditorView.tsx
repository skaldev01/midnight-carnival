"use client";

import { useCallback, useRef } from "react";
import { useCurrentProject } from "@/hooks/useProjects";
import { useChat } from "@/hooks/useChat";
import { useReferenceUpload } from "@/hooks/useReferenceUpload";
import { FileIcon, CloseIcon } from "./icons";
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

  const { isUploading, upload, remove } = useReferenceUpload();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        upload(file);
      }
      // Reset so the same file can be re-uploaded after removal.
      e.target.value = "";
    },
    [upload]
  );

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
            <span key={ref.id} className="context-chip context-chip--ref">
              <FileIcon className="chip-icon" />
              <span className="chip-name" title={ref.name}>
                {ref.name}
              </span>
              <button
                type="button"
                className="chip-remove"
                onClick={() => remove(ref.id)}
                aria-label={`Remove ${ref.name}`}
                title="Remove reference"
              >
                <CloseIcon width={9} height={9} />
              </button>
            </span>
          ))}

          {/* Hidden file input — triggered by the button below */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          <button
            type="button"
            className={`context-add${isUploading ? " context-add--busy" : ""}`}
            onClick={handleAddClick}
            disabled={isUploading}
            title="Attach a PDF, DOCX, or TXT file as context for the AI"
          >
            {isUploading ? "Reading…" : "+ Add reference"}
          </button>
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
