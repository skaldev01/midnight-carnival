import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Project, ProjectPatch } from "@/types/project";
import type { Screenplay, ScreenplayElement } from "@/types/screenplay";
import { scriptItems } from "@/app/home/services/mockData";

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

// Convert the existing mock scriptItems (the wireframe demo content) into a
// real Screenplay so the seeded "Midnight Carnival" project isn't blank.
// Suggestion entries are intentionally dropped — AI suggestions arrive later.
function buildDemoScreenplay(): Screenplay {
  const elements: ScreenplayElement[] = [];
  for (const item of scriptItems) {
    if (item.kind === "scene") {
      elements.push({ type: "scene", content: item.text });
    } else if (item.kind === "action") {
      elements.push({ type: "action", content: item.text });
    } else if (item.kind === "dialogue") {
      elements.push({ type: "character", content: item.character });
      elements.push({ type: "dialogue", content: item.line });
    }
  }
  return { id: makeId(), scenes: elements };
}

type SeedSpec = { title: string; script: Screenplay | null };

function makeSeed(): SeedSpec[] {
  return [
    { title: "Midnight Carnival", script: buildDemoScreenplay() },
    { title: "Static Bloom", script: null },
    { title: "Untitled 03", script: null },
  ];
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
          const seeded = makeSeed().map((s) => emptyProject(s.title, s.script));
          set({
            projects: seeded,
            currentProjectId: seeded[0].id,
          });
          return;
        }
        if (!currentProjectId) {
          set({ currentProjectId: projects[0].id });
        }
      },
    }),
    {
      name: STORAGE_KEY,
      version: 2,
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
          return {
            projects,
            currentProjectId: old.currentProjectId ?? null,
          };
        }
        return persisted as ProjectStore;
      },
      onRehydrateStorage: () => (state) => {
        if (state) state._hydrated = true;
      },
    }
  )
);
