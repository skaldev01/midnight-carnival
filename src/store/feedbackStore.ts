import { create } from "zustand";

// Transient state only — generation/apply flags don't need to persist
// across reloads. The actual feedback content lives on the project
// (currentProject.feedback) and is persisted via projectStore.
type FeedbackStore = {
  isGenerating: boolean;
  isApplying: boolean;
  error: string | null;
  setGenerating: (v: boolean) => void;
  setApplying: (v: boolean) => void;
  setError: (msg: string | null) => void;
  clearError: () => void;
};

export const useFeedbackStore = create<FeedbackStore>((set) => ({
  isGenerating: false,
  isApplying: false,
  error: null,
  setGenerating: (isGenerating) => set({ isGenerating }),
  setApplying: (isApplying) => set({ isApplying }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));
