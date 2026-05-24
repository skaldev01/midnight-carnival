import { useEffect } from "react";
import { useProjectStore } from "@/store/projectStore";
import type { Project } from "@/types/project";

export function useProjects(): Project[] {
  return useProjectStore((s) => s.projects);
}

export function useCurrentProject(): Project | null {
  return useProjectStore((s) => {
    if (!s.currentProjectId) return null;
    return s.projects.find((p) => p.id === s.currentProjectId) ?? null;
  });
}

export function useCurrentProjectId(): string | null {
  return useProjectStore((s) => s.currentProjectId);
}

export function useAddProject() {
  return useProjectStore((s) => s.addProject);
}

export function useDeleteProject() {
  return useProjectStore((s) => s.deleteProject);
}

export function useRenameProject() {
  return useProjectStore((s) => s.renameProject);
}

export function useSetCurrentProject() {
  return useProjectStore((s) => s.setCurrentProject);
}

export function useUpdateProject() {
  return useProjectStore((s) => s.updateProject);
}

/**
 * Runs once on mount to seed initial projects when localStorage is empty
 * and to ensure a current project is selected. Call from the top-level
 * client component.
 */
export function useInitProjects() {
  useEffect(() => {
    useProjectStore.getState().seedInitialIfEmpty();
  }, []);
}
