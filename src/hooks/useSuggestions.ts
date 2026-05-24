"use client";

import { useCallback } from "react";
import { useCurrentProject } from "@/hooks/useProjects";
import { useProjectStore } from "@/store/projectStore";
import { applySuggestion } from "@/services/screenplay/suggestionApplier";
import type { Suggestion } from "@/types/suggestion";

export function useSuggestions() {
  const project = useCurrentProject();
  const all: Suggestion[] = project?.suggestions ?? [];
  const pending = all.filter((s) => s.status === "pending");
  const hasPending = pending.length > 0;

  const accept = useCallback((id: string) => {
    const state = useProjectStore.getState();
    const pid = state.currentProjectId;
    if (!pid) return;
    const proj = state.getProjectById(pid);
    if (!proj) return;
    const target = proj.suggestions.find((s) => s.id === id);
    if (!target || target.status !== "pending") return;

    if (proj.script) {
      const nextScript = applySuggestion(proj.script, target);
      if (nextScript) {
        state.updateProject(pid, {
          script: nextScript,
          suggestions: proj.suggestions.map((s) =>
            s.id === id ? { ...s, status: "accepted" } : s
          ),
        });
        return;
      }
    }
    // Orphan (oldText no longer matches) — mark rejected so it stops blocking.
    state.updateProject(pid, {
      suggestions: proj.suggestions.map((s) =>
        s.id === id ? { ...s, status: "rejected" } : s
      ),
    });
  }, []);

  const reject = useCallback((id: string) => {
    const state = useProjectStore.getState();
    const pid = state.currentProjectId;
    if (!pid) return;
    const proj = state.getProjectById(pid);
    if (!proj) return;
    if (!proj.suggestions.some((s) => s.id === id && s.status === "pending"))
      return;
    state.updateProject(pid, {
      suggestions: proj.suggestions.map((s) =>
        s.id === id ? { ...s, status: "rejected" } : s
      ),
    });
  }, []);

  const acceptAll = useCallback(() => {
    const state = useProjectStore.getState();
    const pid = state.currentProjectId;
    if (!pid) return;
    const proj = state.getProjectById(pid);
    if (!proj) return;

    let nextScript = proj.script;
    const nextSuggestions = proj.suggestions.map((s) => {
      if (s.status !== "pending") return s;
      if (!nextScript) return { ...s, status: "rejected" as const };
      const applied = applySuggestion(nextScript, s);
      if (applied) {
        nextScript = applied;
        return { ...s, status: "accepted" as const };
      }
      // Orphan after earlier accepts (its oldText was clobbered).
      return { ...s, status: "rejected" as const };
    });

    state.updateProject(pid, {
      script: nextScript,
      suggestions: nextSuggestions,
    });
  }, []);

  const rejectAll = useCallback(() => {
    const state = useProjectStore.getState();
    const pid = state.currentProjectId;
    if (!pid) return;
    const proj = state.getProjectById(pid);
    if (!proj) return;
    state.updateProject(pid, {
      suggestions: proj.suggestions.map((s) =>
        s.status === "pending" ? { ...s, status: "rejected" } : s
      ),
    });
  }, []);

  return {
    all,
    pending,
    pendingCount: pending.length,
    hasPending,
    accept,
    reject,
    acceptAll,
    rejectAll,
  };
}
