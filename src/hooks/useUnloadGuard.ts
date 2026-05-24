"use client";

import { useEffect } from "react";
import { useSyncStatusStore } from "@/store/syncStatusStore";

/**
 * Warns the user before closing the tab if Drive sync still has pushes
 * pending or in flight. The browser shows its standard "Leave site?" dialog;
 * the returned string is ignored by modern browsers but is conventional.
 */
export function useUnloadGuard() {
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const pending = useSyncStatusStore.getState().pending;
      if (pending <= 0) return;
      e.preventDefault();
      // Older browsers honored returnValue; modern ones display a generic
      // dialog. We set both for compatibility.
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
}
