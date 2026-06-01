import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Project, ProjectPatch } from "@/types/project";
import type { Screenplay } from "@/types/screenplay";

const STORAGE_KEY = "midnight-carnival.projects";

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyProject(title: string, script: Screenplay | null = null): Project {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    title,
    script,
    instructions: "",
    references: [],
    feedback: [],
    chats: [],
    suggestions: [],
    createdAt: now,
    updatedAt: now,
  };
}

type ProjectStore = {
  projects: Project[];
  currentProjectId: string | null;
  _hydrated: boolean;

  addProject: (title?: string) => Project;
  deleteProject: (id: string) => void;
  renameProject: (id: string, title: string) => void;
  setCurrentProject: (id: string | null) => void;
  getProjectById: (id: string) => Project | undefined;
  updateProject: (id: string, patch: ProjectPatch) => void;

  seedInitialIfEmpty: () => void;
};

type PersistedV1 = {
  projects?: Array<Omit<Project, "script"> & { script?: unknown }>;
  currentProjectId?: string | null;
};

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProjectId: null,
      _hydrated: false,

      addProject: (title = "Untitled") => {
        const project = emptyProject(title);
        set((state) => ({
          projects: [project, ...state.projects],
          currentProjectId: project.id,
        }));
        return project;
      },

      deleteProject: (id) => {
        set((state) => {
          const projects = state.projects.filter((p) => p.id !== id);
          const wasCurrent = state.currentProjectId === id;
          return {
            projects,
            currentProjectId: wasCurrent
              ? projects[0]?.id ?? null
              : state.currentProjectId,
          };
        });
      },

      renameProject: (id, title) => {
        const trimmed = title.trim();
        if (!trimmed) return;
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id
              ? { ...p, title: trimmed, updatedAt: new Date().toISOString() }
              : p
          ),
        }));
      },

      setCurrentProject: (id) => set({ currentProjectId: id }),

      getProjectById: (id) => get().projects.find((p) => p.id === id),

      updateProject: (id, patch) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id
              ? { ...p, ...patch, updatedAt: new Date().toISOString() }
              : p
          ),
        }));
      },

      seedInitialIfEmpty: () => {
        const { projects, currentProjectId } = get();
        if (projects.length === 0) {
          const first = emptyProject("Untitled");
          set({ projects: [first], currentProjectId: first.id });
          return;
        }
        if (!currentProjectId) {
          set({ currentProjectId: projects[0].id });
        }
      },
    }),
    {
      name: STORAGE_KEY,
      version: 5,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        projects: state.projects,
        currentProjectId: state.currentProjectId,
      }),
      migrate: (persisted, version) => {
        // v1: script was a plain string. Drop it (forces upload path).
        if (version < 2 && persisted && typeof persisted === "object") {
          const old = persisted as PersistedV1;
          const projects = (old.projects ?? []).map((p) => ({
            ...p,
            script: null,
          })) as Project[];
          persisted = {
            projects,
            currentProjectId: old.currentProjectId ?? null,
          };
        }
        // v2 → v3: Drive layout changed from 5-files-per-project to
        // 1-file-per-project. The legacy `cloud.files` map is no longer
        // read; the next sync will write the new layout and the service
        // trashes the old subfolder. We strip `cloud.files` so the type
        // matches the new DriveMetadata shape — `folderId` still points
        // at the legacy subfolder, which is the signal the service uses
        // to know cleanup is needed on first sync.
        if (version < 3 && persisted && typeof persisted === "object") {
          const data = persisted as {
            projects?: Array<{
              cloud?: { folderId?: string; files?: unknown; lastSyncedAt?: string };
            }>;
          };
          for (const p of data.projects ?? []) {
            if (p.cloud && "files" in p.cloud) delete p.cloud.files;
          }
        }
        // v3 → v4: Screenplay gained a `titlePage` field. Patch any stored
        // script objects that pre-date this change so they satisfy the type.
        if (version < 4 && persisted && typeof persisted === "object") {
          const data = persisted as {
            projects?: Array<{
              script?: { titlePage?: unknown; scenes?: unknown[] } | null;
            }>;
          };
          for (const p of data.projects ?? []) {
            if (p.script && !("titlePage" in p.script)) {
              p.script.titlePage = null;
            }
          }
        }
        // v4 → v5: ProjectReference gained type/content/uploadedAt fields.
        // Existing references only had {id, name} — backfill with safe defaults
        // so the type constraint is satisfied. Content is empty; the user will
        // need to re-upload if they had any references stored (unlikely since
        // the feature was never implemented).
        if (version < 5 && persisted && typeof persisted === "object") {
          const data = persisted as {
            projects?: Array<{ references?: Array<Record<string, unknown>> }>;
          };
          for (const p of data.projects ?? []) {
            p.references = (p.references ?? []).map((r) => ({
              ...r,
              type: r.type ?? "txt",
              content: r.content ?? "",
              uploadedAt: r.uploadedAt ?? new Date().toISOString(),
            }));
          }
        }
        return persisted as ProjectStore;
      },
      onRehydrateStorage: () => (state) => {
        if (state) state._hydrated = true;
      },
    }
  )
);
