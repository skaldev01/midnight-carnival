"use client";

import { useCallback } from "react";
import { EditorContent } from "@tiptap/react";
import { useScriptEditor } from "@/hooks/useScriptEditor";
import { useCurrentProject } from "@/hooks/useProjects";
import { useUpdateProject } from "@/hooks/useProjects";
import { useProjectStore } from "@/store/projectStore";
import { useSceneIndex } from "@/hooks/useSceneIndex";
import type { TitlePage } from "@/types/screenplay";
import FormatBar from "./FormatBar";
import TitlePageEditor from "./TitlePageEditor";

export default function ScriptEditor() {
  const { editor, elementType, setElementType } = useScriptEditor();
  const project = useCurrentProject();
  const updateProject = useUpdateProject();

  const handleTitlePageChange = useCallback(
    (updated: TitlePage) => {
      if (!project?.script) return;
      const pid = useProjectStore.getState().currentProjectId;
      if (!pid) return;
      updateProject(pid, {
        script: { ...project.script, titlePage: updated },
      });
    },
    [project, updateProject]
  );

  const titlePage = project?.script?.titlePage ?? null;
  const scenes = useSceneIndex(project?.script ?? null);

  return (
    <>
      <FormatBar current={elementType} onChange={setElementType} scenes={scenes} />
      {titlePage && (
        <TitlePageEditor
          titlePage={titlePage}
          onChange={handleTitlePageChange}
        />
      )}
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
