"use client";

import { useCallback, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import {
  detectFileType,
  extractReferenceText,
  isAcceptedFileType,
  truncateReferenceContent,
  ReferenceExtractError,
} from "@/services/reference/referenceExtractor";
import { toast } from "@/store/toastStore";
import type { ProjectReference } from "@/types/project";

function makeRefId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export type ReferenceUploadState = {
  isUploading: boolean;
  error: string | null;
};

export function useReferenceUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (file: File) => {
    const pid = useProjectStore.getState().currentProjectId;
    if (!pid) {
      setError("No project selected.");
      return;
    }

    if (!isAcceptedFileType(file)) {
      const msg = "Only PDF, DOCX, and TXT files are accepted.";
      setError(msg);
      toast({ kind: "error", message: msg });
      return;
    }

    // Prevent duplicate names in the same project.
    const existing =
      useProjectStore.getState().getProjectById(pid)?.references ?? [];
    if (existing.some((r) => r.name === file.name)) {
      const msg = `"${file.name}" is already attached to this project.`;
      setError(msg);
      toast({ kind: "warning", message: msg });
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      console.info(`[useReferenceUpload] extracting "${file.name}"…`);
      const rawContent = await extractReferenceText(file);
      const content = truncateReferenceContent(rawContent);

      console.info(
        `[useReferenceUpload] extracted ${content.length} chars from "${file.name}"`
      );

      const ref: ProjectReference = {
        id: makeRefId(),
        name: file.name,
        type: detectFileType(file),
        content,
        uploadedAt: new Date().toISOString(),
      };

      // Re-read in case the user added another ref while this one was processing.
      const currentRefs =
        useProjectStore.getState().getProjectById(pid)?.references ?? [];
      useProjectStore.getState().updateProject(pid, {
        references: [...currentRefs, ref],
      });

      toast({
        kind: "success",
        message: `"${file.name}" attached — AI will use it in this chat.`,
      });
    } catch (err) {
      const message =
        err instanceof ReferenceExtractError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not read this file. Try another format.";
      console.error("[useReferenceUpload] failed:", message);
      setError(message);
      toast({ kind: "error", message });
    } finally {
      setIsUploading(false);
    }
  }, []);

  const remove = useCallback((refId: string) => {
    const pid = useProjectStore.getState().currentProjectId;
    if (!pid) return;
    const proj = useProjectStore.getState().getProjectById(pid);
    if (!proj) return;
    const updated = proj.references.filter((r) => r.id !== refId);
    useProjectStore.getState().updateProject(pid, { references: updated });
    toast({ kind: "success", message: "Reference removed." });
  }, []);

  return { isUploading, error, upload, remove };
}
