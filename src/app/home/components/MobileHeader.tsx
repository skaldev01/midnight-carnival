"use client";

import { CloseIcon, MenuIcon } from "./icons";

export type MobileView = "chat" | "script";

type Props = {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  mobileView: MobileView;
  onMobileViewChange: (v: MobileView) => void;
};

const tabs: { id: MobileView; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "script", label: "Script" },
];

export default function MobileHeader({
  sidebarOpen,
  onToggleSidebar,
  mobileView,
  onMobileViewChange,
}: Props) {
  return (
    <header className="mobile-header">
      <button
        type="button"
        className="mobile-hamburger"
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? "Close menu" : "Open menu"}
      >
        {sidebarOpen ? (
          <CloseIcon width={16} height={16} />
        ) : (
          <MenuIcon width={16} height={16} />
        )}
      </button>

      <div className="mobile-brand">
        <div className="brand-mark">M</div>
        <span className="mobile-brand-name">Midnight Carnival</span>
      </div>

      <div className="mobile-view-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={mobileView === t.id}
            className={`mobile-view-tab${mobileView === t.id ? " active" : ""}`}
            onClick={() => onMobileViewChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </header>
  );
}
