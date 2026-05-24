"use client";

import { useToastStore } from "@/store/toastStore";
import { CloseIcon } from "./icons";

export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="toaster" role="region" aria-live="polite" aria-label="Notifications">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role="status">
          <div className="toast-message">{t.message}</div>
          <button
            type="button"
            className="toast-close"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
          >
            <CloseIcon width={12} height={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
