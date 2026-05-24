"use client";

import { useState } from "react";
import {
  useCurrentProject,
  useUpdateProject,
} from "@/hooks/useProjects";
import { useSuggestions } from "@/hooks/useSuggestions";
import type { ScreenplayElementType } from "@/types/screenplay";
import { exportScreenplayToPdf } from "@/services/screenplay/pdfExporter";
import { toast } from "@/store/toastStore";
import { CheckIcon, DownloadIcon, UploadIcon } from "./icons";

import ScriptUploadModal from "./ScriptUploadModal";
import ScriptEditor from "./ScriptEditor";
import SuggestionReview from "./ScriptEditor/SuggestionReview";

type Props = {
  scriptFocused: boolean;
  onToggleFocus: () => void;
};

const COUNTABLE: ScreenplayElementType[] = ["scene"];

function makeScreenplayId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function ScriptPanel({
  scriptFocused,
  onToggleFocus,
}: Props) {
  const project = useCurrentProject();
  const updateProject = useUpdateProject();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { hasPending, pendingCount, acceptAll, rejectAll } = useSuggestions();

  const handleExportPdf = () => {
    if (!project?.script || isExporting) return;
    setIsExporting(true);
    // Yield so the disabled state renders before jsPDF starts blocking
    // the main thread; ensures the user sees "Exporting…" immediately.
    window.setTimeout(() => {
      try {
        exportScreenplayToPdf(project.script!, project.title);
        toast({ kind: "success", message: `Exported ${project.title}.pdf` });
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "PDF export failed.";
        toast({ kind: "error", message });
      } finally {
        setIsExporting(false);
      }
    }, 0);
  };

  const title = project?.title ?? "Untitled";
  const script = project?.script ?? null;
  const sceneCount = script
    ? script.scenes.filter((e) => COUNTABLE.includes(e.type)).length
    : 0;
  const elementCount = script?.scenes.length ?? 0;

  const startBlank = () => {
    if (!project) return;
    updateProject(project.id, {
      script: {
        id: makeScreenplayId(),
        scenes: [{ type: "action", content: "" }],
      },
    });
  };

  return (
    <section className="script-panel">
      <button
        type="button"
        className="resize-toggle"
        onClick={onToggleFocus}
        aria-label={
          scriptFocused ? "Restore chat panel width" : "Expand script panel"
        }
        title={scriptFocused ? "Restore chat" : "Expand script"}
      >
        {scriptFocused ? "›" : "‹"}
      </button>
      <header className="script-header">
        <div>
          <div className="script-title">{title}</div>
          <div className="script-meta">
            <span>
              {script
                ? `${sceneCount} scene${sceneCount === 1 ? "" : "s"} · ${elementCount} elements${
                    hasPending
                      ? ` · ${pendingCount} suggestion${pendingCount === 1 ? "" : "s"} pending`
                      : ""
                  }`
                : "No script yet"}
            </span>
            <span className="script-meta-dot" />
            <span>Saved locally</span>
          </div>
        </div>
        <div className="script-header-right">
          <button
            type="button"
            className="header-btn"
            onClick={() => setUploadOpen(true)}
          >
            <UploadIcon className="header-btn-icon" />
            {script ? "Replace" : "Upload PDF"}
          </button>
          <button
            type="button"
            className="header-btn"
            disabled={!hasPending}
            onClick={acceptAll}
            title="Apply every pending suggestion to the script"
          >
            <CheckIcon className="header-btn-icon" />
            Accept all
          </button>
          <button
            type="button"
            className="header-btn"
            disabled={!hasPending}
            onClick={rejectAll}
            title="Dismiss every pending suggestion"
          >
            Reject all
          </button>
          <button
            type="button"
            className="header-btn primary"
            disabled={!script || isExporting}
            onClick={handleExportPdf}
          >
            <DownloadIcon className="header-btn-icon" />
            {isExporting ? "Exporting…" : "Export PDF"}
          </button>
        </div>
      </header>

      <div className="script-scroll">
        {script ? (
          hasPending ? (
            <SuggestionReview />
          ) : (
            <ScriptEditor />
          )
        ) : (
          <EmptyState
            onUploadClick={() => setUploadOpen(true)}
            onStartBlank={startBlank}
          />
        )}
      </div>

      <ScriptUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
      />
    </section>
  );
}

function EmptyState({
  onUploadClick,
  onStartBlank,
}: {
  onUploadClick: () => void;
  onStartBlank: () => void;
}) {
  return (
    <div className="script-empty">
      <UploadIcon className="script-empty-icon" width={32} height={32} />
      <div className="script-empty-title">No script in this project yet</div>
      <div className="script-empty-sub">
        Upload a screenplay PDF, or start writing from scratch. Use Tab to cycle
        between scene, action, character, parenthetical, and dialogue.
      </div>
      <div className="script-empty-actions">
        <button
          type="button"
          className="header-btn primary"
          onClick={onUploadClick}
        >
          <UploadIcon className="header-btn-icon" />
          Upload PDF
        </button>
        <button
          type="button"
          className="header-btn"
          onClick={onStartBlank}
        >
          Start blank
        </button>
      </div>
    </div>
  );
}
