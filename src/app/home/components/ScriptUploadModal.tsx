"use client";

import { useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useScriptUpload } from "@/hooks/useScriptUpload";
import { UploadIcon } from "./icons";

type Props = {
  open: boolean;
  onClose: () => void;
};

function bytesToReadable(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ScriptUploadModal({ open, onClose }: Props) {
  const {
    status,
    error,
    progress,
    fileName,
    sceneCount,
    uploadPdf,
    reset,
  } = useScriptUpload();

  const onDrop = useCallback(
    (accepted: File[]) => {
      const file = accepted[0];
      if (file) uploadPdf(file);
    },
    [uploadPdf]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept: { "application/pdf": [".pdf"] },
      multiple: false,
      disabled: status === "reading" || status === "parsing",
    });

  // Reset the inner state every time the modal opens.
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  if (!open) return null;

  const busy = status === "reading" || status === "parsing";
  const progressPct = Math.round(progress * 100);

  return (
    <div
      className="upload-overlay active"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="upload-card">
        <div className="upload-card-header">
          <div className="upload-card-title">Upload screenplay PDF</div>
          <button
            type="button"
            className="upload-card-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {status === "success" ? (
          <div className="upload-success">
            <div className="upload-success-title">Script imported</div>
            <div className="upload-success-meta">
              {fileName} · {sceneCount} elements parsed
            </div>
            <button
              type="button"
              className="header-btn primary"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        ) : (
          <div
            {...getRootProps({
              className: `upload-dropzone${
                isDragActive ? " is-active" : ""
              }${isDragReject ? " is-reject" : ""}${busy ? " is-busy" : ""}`,
            })}
          >
            <input {...getInputProps()} />
            <UploadIcon className="upload-icon" width={28} height={28} />

            {busy ? (
              <>
                <div className="upload-prompt">
                  {status === "reading"
                    ? "Reading PDF…"
                    : "Parsing screenplay…"}
                </div>
                <div className="upload-progress">
                  <div
                    className="upload-progress-bar"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="upload-sub">
                  {fileName} · {progressPct}%
                </div>
              </>
            ) : (
              <>
                <div className="upload-prompt">
                  {isDragActive
                    ? "Drop the PDF to start"
                    : "Drag a screenplay PDF here, or click to browse"}
                </div>
                <div className="upload-sub">PDF only · single file</div>
              </>
            )}
          </div>
        )}

        {error && status === "error" && (
          <div className="upload-error">
            {fileName ? `${fileName}: ` : ""}
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export function formatFileSize(b: number) {
  return bytesToReadable(b);
}
