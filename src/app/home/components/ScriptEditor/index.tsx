"use client";

import { EditorContent } from "@tiptap/react";
import { useScriptEditor } from "@/hooks/useScriptEditor";
import FormatBar from "./FormatBar";

export default function ScriptEditor() {
  const { editor, elementType, setElementType } = useScriptEditor();

  return (
    <>
      <FormatBar current={elementType} onChange={setElementType} />
      <div className="script-page">
        <div className="page-number">1.</div>
        {editor ? (
          <EditorContent editor={editor} className="script-editor" />
        ) : (
          <div className="script-editor-loading">Loading editor…</div>
        )}
      </div>
    </>
  );
}
