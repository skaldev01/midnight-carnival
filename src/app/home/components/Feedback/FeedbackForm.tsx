"use client";

import { useState } from "react";
import ProviderToggle from "@/components/shared/ProviderToggle";
import { useCurrentProject } from "@/hooks/useProjects";
import type { Provider } from "@/types/chat";
import {
  BoltIcon,
  ChevronDownIcon,
  ScriptFileIcon,
} from "../icons";

const FEEDBACK_PROMPT_PLACEHOLDER =
  "Ask for notes — e.g., \"Give me overall notes on Act 1\" or \"Flag any dialogue that feels on the nose.\"";

type Props = {
  provider: Provider;
  onProviderChange: (p: Provider) => void;
  isGenerating: boolean;
  canGenerate: boolean;
  onGenerate: (prompt: string) => void;
};

export default function FeedbackForm({
  provider,
  onProviderChange,
  isGenerating,
  canGenerate,
  onGenerate,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const project = useCurrentProject();
  const title = project?.title ?? "Untitled";
  const elementCount = project?.script?.scenes.length ?? 0;
  const pickerMeta = elementCount
    ? `${elementCount} elements · From this project`
    : "No script loaded";

  const handleGenerate = () => {
    const trimmed = prompt.trim();
    if (!trimmed || isGenerating || !canGenerate) return;
    onGenerate(trimmed);
  };

  return (
    <>
      <div className="feedback-section">
        <div className="feedback-section-label">Script</div>
        <div className="feedback-script-picker">
          <ScriptFileIcon className="picker-icon" />
          <div className="picker-info">
            <div className="picker-name">{title}</div>
            <div className="picker-meta">{pickerMeta}</div>
          </div>
          <ChevronDownIcon className="picker-chevron" width={14} height={14} />
        </div>
      </div>

      <div className="feedback-section">
        <div className="feedback-section-label">What feedback do you want?</div>
        <textarea
          className="feedback-prompt"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isGenerating}
          placeholder={FEEDBACK_PROMPT_PLACEHOLDER}
        />
      </div>

      <div className="feedback-controls">
        <ProviderToggle value={provider} onChange={onProviderChange} />
        <button
          type="button"
          className="generate-btn"
          onClick={handleGenerate}
          disabled={isGenerating || !canGenerate || !prompt.trim()}
          title={
            !canGenerate
              ? "Add a script to this project before requesting feedback"
              : undefined
          }
        >
          <BoltIcon width={13} height={13} />
          {isGenerating ? "Generating…" : "Generate feedback"}
        </button>
      </div>
    </>
  );
}
