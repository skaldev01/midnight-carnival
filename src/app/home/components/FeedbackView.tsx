"use client";

import { useFeedback } from "@/hooks/useFeedback";
import FeedbackForm from "./Feedback/FeedbackForm";
import FeedbackOutput from "./Feedback/FeedbackOutput";

type Props = {
  active: boolean;
  onApplyToEditor: () => void;
};

export default function FeedbackView({ active, onApplyToEditor }: Props) {
  const {
    latest,
    provider,
    setProvider,
    isGenerating,
    isApplying,
    error,
    clearError,
    canGenerate,
    generate,
    apply,
  } = useFeedback();

  const canApply = Boolean(latest && latest.sections.suggestions.length > 0);

  const handleApply = async () => {
    await apply();
    // Switch to the Editor tab so the user sees the inline review pane
    // populated with the new suggestions.
    onApplyToEditor();
  };

  return (
    <div className={`feedback-view${active ? " active" : ""}`}>
      <FeedbackForm
        provider={provider}
        onProviderChange={setProvider}
        isGenerating={isGenerating}
        canGenerate={canGenerate}
        onGenerate={generate}
      />

      {error && (
        <div className="feedback-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="feedback-error-dismiss"
            onClick={clearError}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {isGenerating && !latest && (
        <div className="feedback-placeholder">
          <span className="typing-indicator" aria-label="Generating feedback">
            <span />
            <span />
            <span />
          </span>
          <span>Generating feedback…</span>
        </div>
      )}

      {latest && (
        <FeedbackOutput
          feedback={latest}
          isApplying={isApplying}
          canApply={canApply}
          onApply={handleApply}
        />
      )}
    </div>
  );
}
