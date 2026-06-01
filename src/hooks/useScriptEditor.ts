"use client";

import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScreenplayElement } from "@/app/home/components/ScriptEditor/extensions";
import { useCurrentProject } from "@/hooks/useProjects";
import { useProjectStore } from "@/store/projectStore";
import {
  scenesToTiptapDoc,
  tiptapDocToScenes,
} from "@/services/screenplay/scenesSerializer";
import type { ScreenplayElementType } from "@/types/screenplay";

const SAVE_DEBOUNCE_MS = 400;

function makeScreenplayId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export type ScriptEditorHandle = {
  editor: Editor | null;
  elementType: ScreenplayElementType;
  setElementType: (type: ScreenplayElementType) => void;
};

export function useScriptEditor(): ScriptEditorHandle {
  const project = useCurrentProject();
  const scriptId = project?.script?.id ?? null;

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadedScriptId = useRef<string | null>(null);
  const [elementType, setElementTypeState] = useState<ScreenplayElementType>(
    "action"
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, ScreenplayElement],
    onUpdate: ({ editor }) => {
      const pid = useProjectStore.getState().currentProjectId;
      if (!pid) return;

      const existingScript = useProjectStore
        .getState()
        .getProjectById(pid)?.script ?? null;
      const sid = existingScript?.id ?? makeScreenplayId();
      // Preserve the title page that lives outside the TipTap document.
      const titlePage = existingScript?.titlePage ?? null;
      const scenes = tiptapDocToScenes(editor.getJSON());

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        useProjectStore
          .getState()
          .updateProject(pid, { script: { id: sid, titlePage, scenes } });
      }, SAVE_DEBOUNCE_MS);
    },
    onSelectionUpdate: ({ editor }) => {
      const t = editor.state.selection.$from.parent.attrs
        .elementType as ScreenplayElementType | undefined;
      setElementTypeState(t || "action");
    },
  });

  // Reload editor content when the active script.id changes.
  // We deliberately key on script.id (not scenes) so the editor's own
  // saves don't trigger a reload that would clobber the user's cursor.
  useEffect(() => {
    if (!editor) return;
    if (lastLoadedScriptId.current === scriptId) return;
    lastLoadedScriptId.current = scriptId;

    const scenes = project?.script?.scenes ?? [];
    editor.commands.setContent(scenesToTiptapDoc(scenes), { emitUpdate: false });
  }, [editor, scriptId, project]);

  // Flush any pending save on unmount (project switch, navigate away).
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const setElementType = useCallback(
    (type: ScreenplayElementType) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .updateAttributes("paragraph", { elementType: type })
        .run();
    },
    [editor]
  );

  return { editor, elementType, setElementType };
}
