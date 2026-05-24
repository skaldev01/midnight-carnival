import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Provider } from "@/types/chat";

type ChatStore = {
  provider: Provider;
  setProvider: (p: Provider) => void;
};

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      provider: "claude",
      setProvider: (provider) => set({ provider }),
    }),
    {
      name: "midnight-carnival.chat",
      version: 1,
      storage: createJSONStorage(() => localStorage),
    }
  )
);
