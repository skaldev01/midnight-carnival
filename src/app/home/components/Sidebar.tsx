"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { CloseIcon, SettingsIcon, SignOutIcon } from "./icons";
import {
  useAddProject,
  useCurrentProjectId,
  useDeleteProject,
  useProjects,
  useRenameProject,
  useSetCurrentProject,
} from "@/hooks/useProjects";
import type { Project } from "@/types/project";

const DOT_CLASSES = ["", "dot-2", "dot-3"];

function dotClass(index: number): string {
  const variant = DOT_CLASSES[index % DOT_CLASSES.length];
  return `project-dot${variant ? " " + variant : ""}`;
}

function projectMeta(project: Project): string {
  if (!project.script || project.script.scenes.length === 0) return "Draft";
  const elements = project.script.scenes.length;
  return `Draft · ${elements} element${elements === 1 ? "" : "s"}`;
}

type ItemProps = {
  project: Project;
  index: number;
  isActive: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
};

function ProjectItem({
  project,
  index,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: ItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.title);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== project.title) onRename(next);
    else setDraft(project.title);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(project.title);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commit();
    else if (e.key === "Escape") cancel();
  };

  return (
    <div
      className={`project-item${isActive ? " active" : ""}`}
      onClick={() => {
        if (!editing) onSelect();
      }}
    >
      <div className={dotClass(index)} />
      <div className="project-info">
        {editing ? (
          <input
            className="project-name-input"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKey}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            className="project-name"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setDraft(project.title);
              setEditing(true);
            }}
            title="Double-click to rename"
          >
            {project.title}
          </div>
        )}
        <div className="project-meta">{projectMeta(project)}</div>
      </div>
      <button
        type="button"
        className="project-action"
        aria-label={`Delete ${project.title}`}
        onClick={(e) => {
          e.stopPropagation();
          if (window.confirm(`Delete "${project.title}"?`)) onDelete();
        }}
      >
        <CloseIcon width={12} height={12} />
      </button>
    </div>
  );
}

export default function Sidebar() {
  const projects = useProjects();
  const currentProjectId = useCurrentProjectId();
  const addProject = useAddProject();
  const deleteProject = useDeleteProject();
  const renameProject = useRenameProject();
  const setCurrentProject = useSetCurrentProject();
  const { data: session, status } = useSession();
  const creatingRef = useRef(false);

  const handleNewProject = () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    addProject("Untitled");
    // Release the lock on the next frame so genuine subsequent clicks work,
    // but synchronous double-clicks collapse into one project.
    window.setTimeout(() => {
      creatingRef.current = false;
    }, 400);
  };

  const isAuthed = status === "authenticated" && !session?.error;
  const email = session?.user?.email ?? "";
  const initial = (email || "?").charAt(0).toUpperCase();

  // Show sync status: if any project has a cloud field, we've synced at least once.
  const anyCloud = projects.some((p) => p.cloud);
  const driveStatus = isAuthed
    ? anyCloud
      ? "Synced to Drive"
      : "Connected — syncing…"
    : status === "loading"
      ? "Checking session…"
      : session?.error
        ? "Sign in needed"
        : "Not signed in";

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">M</div>
        <div className="brand-name">Midnight Carnival</div>
      </div>

      <button
        type="button"
        className="new-project"
        onClick={handleNewProject}
      >
        <span className="plus">+</span>
        New Project
      </button>

      <div>
        <div className="projects-label">Projects</div>
        {projects.map((p, i) => (
          <ProjectItem
            key={p.id}
            project={p}
            index={i}
            isActive={p.id === currentProjectId}
            onSelect={() => setCurrentProject(p.id)}
            onRename={(title) => renameProject(p.id, title)}
            onDelete={() => deleteProject(p.id)}
          />
        ))}
      </div>

      <div className="sidebar-footer">
        {isAuthed ? (
          <div className="google-account">
            <div className="google-avatar">{initial}</div>
            <div className="google-info">
              <div className="google-name">{email || "Signed in"}</div>
              <div className="google-status">{driveStatus}</div>
            </div>
            <button
              type="button"
              className="sign-out-btn"
              onClick={() => signOut()}
              aria-label="Sign out of Google"
              title="Sign out"
            >
              <SignOutIcon width={14} height={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="google-account"
            onClick={() => signIn("google")}
            style={{
              cursor: "pointer",
              width: "100%",
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              textAlign: "left",
            }}
          >
            <div className="google-avatar">?</div>
            <div className="google-info">
              <div className="google-name">Sign in with Google</div>
              <div className="google-status" style={{ color: "var(--text-faint)" }}>
                {driveStatus}
              </div>
            </div>
          </button>
        )}

        <button type="button" className="settings">
          <SettingsIcon className="settings-icon" />
          Settings &amp; API Keys
        </button>
      </div>
    </aside>
  );
}
