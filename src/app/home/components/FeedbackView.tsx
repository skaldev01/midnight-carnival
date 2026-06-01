"use client";

import { useFeedback } from "@/hooks/useFeedback";
import { useFeedbackStore } from "@/store/feedbackStore";
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

  // Apply is possible as long as any actionable section has content —
  // issues and characterNotes are equally actionable, not just suggestions[].
  const canApply = Boolean(
    latest &&
      (latest.sections.issues.length > 0 ||
        latest.sections.characterNotes.length > 0 ||
        latest.sections.suggestions.length > 0)
  );

  const handleApply = async () => {
    await apply();
    // Only switch to the Editor tab when apply() succeeded (no error set).
    // If it failed, keep the user on the Feedback tab so they can see the error.
    const hasError = useFeedbackStore.getState().error !== null;
    if (!hasError) {
      onApplyToEditor();
    }
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
