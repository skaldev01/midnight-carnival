"use client";

import { useCallback, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { extractPdfText } from "@/services/pdf/pdfParser";
import { parseScreenplay } from "@/services/screenplay/screenplayParser";
import { toast } from "@/store/toastStore";

const MAX_PDF_BYTES = 25 * 1024 * 1024;

export type UploadStatus =
  | "idle"
  | "reading"
  | "parsing"
  | "success"
  | "error";

export type UploadState = {
  status: UploadStatus;
  error: string | null;
  progress: number;
  fileName: string | null;
  sceneCount: number | null;
};

const INITIAL: UploadState = {
  status: "idle",
  error: null,
  progress: 0,
  fileName: null,
  sceneCount: null,
};

export function useScriptUpload() {
  const [state, setState] = useState<UploadState>(INITIAL);

  const reset = useCallback(() => setState(INITIAL), []);

  const uploadPdf = useCallback(async (file: File) => {
    const projectId = useProjectStore.getState().currentProjectId;

    if (!projectId) {
      setState({
        ...INITIAL,
        status: "error",
        error: "No project selected.",
      });
      return;
    }

    const isPdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      const msg = "Only PDF files are accepted.";
      setState({ ...INITIAL, status: "error", error: msg, fileName: file.name });
      toast({ kind: "error", message: msg });
      return;
    }

    if (file.size === 0) {
      const msg = "This file is empty.";
      setState({ ...INITIAL, status: "error", error: msg, fileName: file.name });
      toast({ kind: "error", message: msg });
      return;
    }

    if (file.size > MAX_PDF_BYTES) {
      const msg = `PDF is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 25 MB.`;
      setState({ ...INITIAL, status: "error", error: msg, fileName: file.name });
      toast({ kind: "error", message: msg });
      return;
    }

    setState({
      status: "reading",
      error: null,
      progress: 0,
      fileName: file.name,
      sceneCount: null,
    });

    try {
      const text = await extractPdfText(file, (fraction) => {
        setState((s) => ({ ...s, progress: fraction }));
      });

      setState((s) => ({ ...s, status: "parsing", progress: 1 }));

      const screenplay = parseScreenplay(text);

      if (screenplay.scenes.length === 0) {
        const msg =
          "We couldn't find any screenplay elements in this PDF. Make sure it's a screenplay, not a document.";
        setState((s) => ({ ...s, status: "error", error: msg }));
        toast({ kind: "warning", message: msg });
        return;
      }

      useProjectStore
        .getState()
        .updateProject(projectId, { script: screenplay });

      setState((s) => ({
        ...s,
        status: "success",
        sceneCount: screenplay.scenes.length,
      }));
      toast({
        kind: "success",
        message: `Imported ${screenplay.scenes.length} elements from ${file.name}.`,
      });
    } catch (e) {
      console.error("[useScriptUpload] failed:", e);
      const message =
        e instanceof Error
          ? e.message
          : "Could not process this PDF. Try another file.";
      setState((s) => ({ ...s, status: "error", error: message }));
      toast({ kind: "error", message });
    }
  }, []);

  return { ...state, uploadPdf, reset };
}
