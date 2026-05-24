"use client";

import { useState } from "react";
import { useDriveSync } from "@/hooks/useDriveSync";
import { useInitProjects } from "@/hooks/useProjects";
import { useUnloadGuard } from "@/hooks/useUnloadGuard";
import ChatPanel, { type ChatTab } from "./ChatPanel";
import MobileHeader, { type MobileView } from "./MobileHeader";
import ScriptPanel from "./ScriptPanel";
import Sidebar from "./Sidebar";

export default function HomeApp() {
  useInitProjects();
  useDriveSync();
  useUnloadGuard();
  const [tab, setTab] = useState<ChatTab>("editor");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("chat");
  const [scriptFocused, setScriptFocused] = useState(false);

  return (
    <>
      <MobileHeader
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        mobileView={mobileView}
        onMobileViewChange={(v) => {
          setMobileView(v);
          setSidebarOpen(false);
        }}
      />

      <div
        className={`app${sidebarOpen ? " sidebar-open" : ""}${
          scriptFocused ? " script-focused" : ""
        }`}
        data-mobile-view={mobileView}
      >
        <Sidebar />
        <ChatPanel tab={tab} onTabChange={setTab} />
        <ScriptPanel
          scriptFocused={scriptFocused}
          onToggleFocus={() => setScriptFocused((v) => !v)}
        />
      </div>

      <div
        className={`sidebar-backdrop${sidebarOpen ? " open" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
    </>
  );
}
