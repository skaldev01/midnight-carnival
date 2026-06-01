"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentProject } from "@/hooks/useProjects";
import { useChatStore } from "@/store/chatStore";
import { useProjectStore } from "@/store/projectStore";
import {
  buildSuggestionsFromRaw,
  type RawSuggestion,
} from "@/services/screenplay/suggestionFilter";
import {
  classifyIntent,
  augmentPromptForEditing,
} from "@/services/ai/intentClassifier";
import { referenceToFeedback } from "@/services/feedback/feedbackTransformer";
import type { ChatMessage, Provider } from "@/types/chat";
import type { Suggestion } from "@/types/suggestion";

function makeMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function appendChat(projectId: string, message: ChatMessage) {
  const state = useProjectStore.getState();
  const existing = state.getProjectById(projectId)?.chats ?? [];
  state.updateProject(projectId, { chats: [...existing, message] });
}

function appendSuggestions(projectId: string, suggestions: Suggestion[]) {
  if (suggestions.length === 0) return;
  const state = useProjectStore.getState();
  const existing = state.getProjectById(projectId)?.suggestions ?? [];
  state.updateProject(projectId, {
    suggestions: [...existing, ...suggestions],
  });
}

type ApiResponse = {
  content?: string;
  provider?: Provider;
  suggestions?: RawSuggestion[];
  error?: string;
  code?: string;
};

export function useChat() {
  const project = useCurrentProject();
  const provider = useChatStore((s) => s.provider);
  const setProvider = useChatStore((s) => s.setProvider);
  const [isResponding, setIsResponding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const currentPid = project?.id ?? null;

  const messages = project?.chats ?? [];

  const clearError = useCallback(() => setError(null), []);

  // Cancel any in-flight AI request when the project changes or the
  // component unmounts. The server completes regardless, but the client
  // stops waiting and won't try to write into a stale project.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [currentPid]);

  const sendMessage = useCallback(
    async (rawContent: string) => {
      const content = rawContent.trim();
      if (!content) return;

      const pid = useProjectStore.getState().currentProjectId;
      if (!pid) return;

      // ── 1. Classify intent before doing anything else ─────────────────────
      const intentResult = classifyIntent(content);
      console.info(
        `[useChat] prompt="${content.slice(0, 80)}" ` +
          `intent=${intentResult.intent} ` +
          `sceneRef=${intentResult.sceneNumber ?? "none"} ` +
          `elementTypes=[${intentResult.elementTypes.join(",")}]`
      );

      // Cancel any previous in-flight request before starting a new one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const projectAtSend = useProjectStore.getState().getProjectById(pid);

      // ── 2. Augment the prompt when editing is detected ────────────────────
      // Pass reference names so the augmentor can name them in the directive,
      // and so prompts like "apply the reference changes" always produce edits.
      const refNames = (projectAtSend?.references ?? [])
        .filter((r) => r.content)
        .map((r) => r.name);
      const promptForApi = augmentPromptForEditing(content, intentResult, refNames);
      const userMsg: ChatMessage = {
        id: makeMessageId(),
        role: "user",
        content,              // store the original, unaugmented message
        timestamp: nowIso(),
      };
      appendChat(pid, userMsg);

      setError(null);
      setIsResponding(true);

      try {
        console.info(
          `[useChat] → /api/ai  provider=${provider}  ` +
            `script=${projectAtSend?.script?.scenes.length ?? 0} elements  ` +
            `promptLen=${promptForApi.length}`
        );

        // Build lightweight reference objects — only name + content, no id/uploadedAt.
        const refsForApi = (projectAtSend?.references ?? [])
          .filter((r) => r.content)
          .map((r) => ({ name: r.name, content: r.content }));

        const isReferenceEditRequest =
          refsForApi.length > 0 &&
          (intentResult.intent === "edit" || refNames.length > 0);

        if (refsForApi.length > 0) {
          console.info(
            `[useChat] attaching ${refsForApi.length} reference(s): ` +
              refsForApi.map((r) => r.name).join(", ") +
              (isReferenceEditRequest ? " [routing to apply-feedback]" : "")
          );
        }

        let response: Response;

        if (isReferenceEditRequest && projectAtSend?.script) {
          // ── Reference edit path ────────────────────────────────────────────
          // Merge all attached references into a single synthetic Feedback so
          // transformFeedbackToInstructions can build a focused element table.
          // This avoids sending the full 3,975-element script to the chat
          // endpoint where verbatim oldText copying is unreliable.
          const combinedContent = refsForApi
            .map((r) => `=== ${r.name} ===\n${r.content}`)
            .join("\n\n");
          const syntheticFeedback = referenceToFeedback(
            refsForApi.map((r) => r.name).join(", "),
            combinedContent,
            provider
          );

          console.info(
            `[useChat] synthetic feedback: ` +
              `${syntheticFeedback.sections.suggestions.length} suggestions, ` +
              `${syntheticFeedback.sections.issues.length} issues`
          );

          response = await fetch("/api/ai/apply-feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider,
              feedback: syntheticFeedback,
              script: projectAtSend.script,
              instructions: projectAtSend?.instructions ?? "",
            }),
            signal: controller.signal,
          });
        } else {
          // ── Standard chat path ─────────────────────────────────────────────
          response = await fetch("/api/ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider,
              prompt: promptForApi,
              script: projectAtSend?.script ?? null,
              instructions: projectAtSend?.instructions ?? "",
              references: refsForApi,
            }),
            signal: controller.signal,
          });
        }

        const data = (await response.json().catch(() => ({}))) as ApiResponse;

        console.info(
          `[useChat] ← /api/ai  status=${response.status}  ` +
            `rawSuggestions=${data.suggestions?.length ?? 0}`
        );

        if (!response.ok || !data.content) {
          throw new Error(
            data.error || `Request failed (${response.status})`
          );
        }

        // Guard: project may have switched during the request.
        if (useProjectStore.getState().currentProjectId !== pid) return;

        // ── 3. Validate suggestions against the current script ────────────
        // Re-read the script at this exact moment — the user may have
        // edited it since we sent the request.
        const currentScript = useProjectStore
          .getState()
          .getProjectById(pid)?.script;
        const validated = buildSuggestionsFromRaw(
          data.suggestions,
          currentScript ?? null,
          data.provider ?? provider
        );

        console.info(
          `[useChat] suggestions: ${data.suggestions?.length ?? 0} raw → ` +
            `${validated.length} validated`
        );

        // ── 4. Store the assistant reply with suggestion count ────────────
        const replyProvider = data.provider ?? provider;
        const assistantMsg: ChatMessage = {
          id: makeMessageId(),
          role: "assistant",
          content: data.content,
          provider: replyProvider,
          timestamp: nowIso(),
          // Attach count so ChatMessages can render a badge.
          suggestionCount: validated.length > 0 ? validated.length : undefined,
        };
        appendChat(pid, assistantMsg);
        appendSuggestions(pid, validated);
      } catch (err) {
        // Abort is not an error — it's a deliberate cancellation.
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message =
          err instanceof Error ? err.message : "Could not reach the AI.";
        console.error("[useChat] error:", message);
        setError(message);
      } finally {
        // Only clear the responding flag if this request is still the
        // active one (a newer send may have replaced abortRef).
        if (abortRef.current === controller) {
          setIsResponding(false);
          abortRef.current = null;
        }
      }
    },
    [provider]
  );

  const clearMessages = useCallback(() => {
    const pid = useProjectStore.getState().currentProjectId;
    if (!pid) return;
    useProjectStore.getState().updateProject(pid, { chats: [] });
  }, []);

  return {
    messages,
    provider,
    setProvider,
    sendMessage,
    clearMessages,
    isResponding,
    error,
    clearError,
  };
}
