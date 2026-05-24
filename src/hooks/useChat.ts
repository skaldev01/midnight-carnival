"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentProject } from "@/hooks/useProjects";
import { useChatStore } from "@/store/chatStore";
import { useProjectStore } from "@/store/projectStore";
import {
  buildSuggestionsFromRaw,
  type RawSuggestion,
} from "@/services/screenplay/suggestionFilter";
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

      // Cancel any previous in-flight request before starting a new one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const projectAtSend = useProjectStore.getState().getProjectById(pid);
      const userMsg: ChatMessage = {
        id: makeMessageId(),
        role: "user",
        content,
        timestamp: nowIso(),
      };
      appendChat(pid, userMsg);

      setError(null);
      setIsResponding(true);

      try {
        const response = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            prompt: content,
            script: projectAtSend?.script ?? null,
            instructions: projectAtSend?.instructions ?? "",
          }),
          signal: controller.signal,
        });

        const data = (await response.json().catch(() => ({}))) as ApiResponse;

        if (!response.ok || !data.content) {
          throw new Error(
            data.error || `Request failed (${response.status})`
          );
        }

        // Guard: project may have switched during the request.
        if (useProjectStore.getState().currentProjectId !== pid) return;

        const replyProvider = data.provider ?? provider;
        const assistantMsg: ChatMessage = {
          id: makeMessageId(),
          role: "assistant",
          content: data.content,
          provider: replyProvider,
          timestamp: nowIso(),
        };
        appendChat(pid, assistantMsg);

        // Re-read the script at this exact moment — the user may have
        // edited it since we sent the request.
        const currentScript = useProjectStore
          .getState()
          .getProjectById(pid)?.script;
        const validated = buildSuggestionsFromRaw(
          data.suggestions,
          currentScript ?? null,
          replyProvider
        );
        appendSuggestions(pid, validated);
      } catch (err) {
        // Abort is not an error — it's a deliberate cancellation.
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message =
          err instanceof Error ? err.message : "Could not reach the AI.";
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
