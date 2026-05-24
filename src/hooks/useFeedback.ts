"use client";

import { useCallback } from "react";
import { useCurrentProject } from "@/hooks/useProjects";
import { useChatStore } from "@/store/chatStore";
import { useFeedbackStore } from "@/store/feedbackStore";
import { useProjectStore } from "@/store/projectStore";
import { buildSuggestionsFromRaw } from "@/services/screenplay/suggestionFilter";
import type { Feedback } from "@/types/feedback";
import type { Provider } from "@/types/chat";

function makeFeedbackId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

type FeedbackApiResponse = {
  title?: string;
  sections?: {
    working?: string[];
    issues?: string[];
    characterNotes?: string[];
    suggestions?: string[];
  };
  provider?: Provider;
  error?: string;
};

type SuggestionApiResponse = {
  content?: string;
  provider?: Provider;
  suggestions?: { oldText?: unknown; newText?: unknown; type?: unknown }[];
  error?: string;
};

export function useFeedback() {
  const project = useCurrentProject();
  const provider = useChatStore((s) => s.provider);
  const setProvider = useChatStore((s) => s.setProvider);
  const {
    isGenerating,
    isApplying,
    error,
    setGenerating,
    setApplying,
    setError,
    clearError,
  } = useFeedbackStore();

  const history = project?.feedback ?? [];
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const canGenerate = Boolean(project?.script && project.script.scenes.length > 0);

  /**
   * Generate fresh feedback for the current project's script.
   * Persists the result to currentProject.feedback automatically.
   */
  const generate = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;

      const state = useProjectStore.getState();
      const pid = state.currentProjectId;
      if (!pid) {
        setError("Select a project first.");
        return;
      }
      const proj = state.getProjectById(pid);
      if (!proj?.script || proj.script.scenes.length === 0) {
        setError("Upload or write a script before requesting feedback.");
        return;
      }

      setError(null);
      setGenerating(true);

      try {
        const response = await fetch("/api/ai/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            prompt: trimmed,
            script: proj.script,
            instructions: proj.instructions ?? "",
          }),
        });

        const data = (await response
          .json()
          .catch(() => ({}))) as FeedbackApiResponse;

        if (!response.ok || !data.sections) {
          throw new Error(
            data.error || `Request failed (${response.status})`
          );
        }

        // Guard: project may have switched during the request.
        if (useProjectStore.getState().currentProjectId !== pid) return;

        const newFeedback: Feedback = {
          id: makeFeedbackId(),
          title: data.title?.trim() || "AI feedback",
          prompt: trimmed,
          provider: data.provider ?? provider,
          createdAt: nowIso(),
          sections: {
            working: data.sections.working ?? [],
            issues: data.sections.issues ?? [],
            characterNotes: data.sections.characterNotes ?? [],
            suggestions: data.sections.suggestions ?? [],
          },
        };

        const after = useProjectStore.getState().getProjectById(pid);
        const existing = after?.feedback ?? [];
        useProjectStore.getState().updateProject(pid, {
          feedback: [...existing, newFeedback],
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not generate feedback.";
        setError(message);
      } finally {
        setGenerating(false);
      }
    },
    [provider, setError, setGenerating]
  );

  /**
   * Apply Feedback: convert the latest feedback's suggestion bullets into
   * concrete script edits via the regular /api/ai suggestion engine.
   * Resulting suggestions land in currentProject.suggestions and trigger
   * review mode in the script panel.
   */
  const apply = useCallback(async () => {
    const state = useProjectStore.getState();
    const pid = state.currentProjectId;
    if (!pid) return;
    const proj = state.getProjectById(pid);
    if (!proj) return;

    const lastFeedback = proj.feedback[proj.feedback.length - 1];
    if (!lastFeedback) {
      setError("No feedback to apply. Generate feedback first.");
      return;
    }
    const notes = lastFeedback.sections.suggestions;
    if (notes.length === 0) {
      setError("This feedback has no actionable suggestions to apply.");
      return;
    }
    if (!proj.script || proj.script.scenes.length === 0) {
      setError("No script to apply feedback to.");
      return;
    }

    setError(null);
    setApplying(true);

    const applyPrompt = [
      "Convert each of these feedback notes into a concrete script rewrite.",
      "For each note, find the most relevant element in the script and produce an oldText/newText suggestion.",
      "Only include suggestions where the oldText is an exact match of a real element.",
      "",
      "Feedback notes:",
      ...notes.map((n, i) => `${i + 1}. ${n}`),
    ].join("\n");

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          prompt: applyPrompt,
          script: proj.script,
          instructions: proj.instructions ?? "",
        }),
      });

      const data = (await response
        .json()
        .catch(() => ({}))) as SuggestionApiResponse;

      if (!response.ok) {
        throw new Error(
          data.error || `Request failed (${response.status})`
        );
      }

      if (useProjectStore.getState().currentProjectId !== pid) return;

      const currentScript = useProjectStore
        .getState()
        .getProjectById(pid)?.script;
      const newSuggestions = buildSuggestionsFromRaw(
        data.suggestions,
        currentScript ?? null,
        data.provider ?? provider
      );

      if (newSuggestions.length === 0) {
        setError(
          "AI could not produce concrete edits from these notes. Try rewording the prompt."
        );
        return;
      }

      const after = useProjectStore.getState().getProjectById(pid);
      const existing = after?.suggestions ?? [];
      useProjectStore.getState().updateProject(pid, {
        suggestions: [...existing, ...newSuggestions],
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not apply feedback.";
      setError(message);
    } finally {
      setApplying(false);
    }
  }, [provider, setApplying, setError]);

  return {
    history,
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
  };
}
