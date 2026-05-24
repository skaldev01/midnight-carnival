"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useProjectStore } from "@/store/projectStore";
import { useSyncStatusStore } from "@/store/syncStatusStore";
import { toast } from "@/store/toastStore";
import type { Project } from "@/types/project";
import type { DriveMetadata } from "@/types/drive";

const DEBOUNCE_MS = 2000;

type PushOutcome =
  | { kind: "ok"; cloud: DriveMetadata | null }
  | { kind: "auth" }
  | { kind: "error"; message: string };

/**
 * Returns a stable hash of the project fields that should trigger a Drive
 * push. Excludes `cloud` (set by the sync response itself) and `suggestions`
 * (transient, not synced — they reference local oldText).
 */
function contentHash(p: Project): string {
  // Deliberately excludes `updatedAt` and `cloud` — those churn on every
  // updateProject call (including the post-sync cloud write), and including
  // them would cause an infinite sync loop. Content fields only.
  return JSON.stringify({
    title: p.title,
    script: p.script,
    instructions: p.instructions,
    chats: p.chats,
    feedback: p.feedback,
    references: p.references,
  });
}

async function pushOne(project: Project): Promise<PushOutcome> {
  try {
    const res = await fetch("/api/drive/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project }),
    });
    if (res.status === 401) {
      return { kind: "auth" };
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({} as { error?: string }));
      const message = data.error || `Drive sync failed (${res.status}).`;
      console.warn("[drive-sync] push failed:", data);
      return { kind: "error", message };
    }
    const data = (await res.json()) as { cloud?: DriveMetadata };
    return { kind: "ok", cloud: data.cloud ?? null };
  } catch (err) {
    console.warn("[drive-sync] push errored:", err);
    return {
      kind: "error",
      message:
        err instanceof Error
          ? `Drive sync failed: ${err.message}`
          : "Drive sync failed: network error.",
    };
  }
}

type PullOutcome =
  | { kind: "ok"; projects: Project[] }
  | { kind: "auth" }
  | { kind: "error"; message: string };

async function pullAll(): Promise<PullOutcome> {
  try {
    const res = await fetch("/api/drive/projects");
    if (res.status === 401) return { kind: "auth" };
    if (!res.ok) {
      const data = await res.json().catch(() => ({} as { error?: string }));
      const message = data.error || `Drive load failed (${res.status}).`;
      console.warn("[drive-sync] pull failed:", data);
      return { kind: "error", message };
    }
    const data = (await res.json()) as { projects?: Project[] };
    return { kind: "ok", projects: data.projects ?? [] };
  } catch (err) {
    console.warn("[drive-sync] pull errored:", err);
    return {
      kind: "error",
      message:
        err instanceof Error
          ? `Drive load failed: ${err.message}`
          : "Drive load failed: network error.",
    };
  }
}

function notifyDriveError(message: string) {
  toast({ kind: "error", message, key: "drive-sync-error" });
}

/**
 * Merge cloud projects with the local store. For each cloud project:
 *   - If local doesn't have it: add it.
 *   - If local has it and cloud is newer: replace (keep local suggestions —
 *     they're transient and project-scoped).
 *   - Otherwise: leave local untouched (it'll push on the next change).
 *
 * Local-only projects are preserved and will sync up via the regular
 * subscriber once they next change.
 */
function mergeCloudIntoStore(cloudProjects: Project[]) {
  const state = useProjectStore.getState();
  const localById = new Map(state.projects.map((p) => [p.id, p]));
  const merged: Project[] = [];

  for (const cloud of cloudProjects) {
    const local = localById.get(cloud.id);
    if (!local) {
      merged.push(cloud);
      continue;
    }
    const localTime = Date.parse(local.updatedAt);
    const cloudTime = Date.parse(cloud.updatedAt);
    if (Number.isFinite(cloudTime) && cloudTime > localTime) {
      merged.push({
        ...cloud,
        // Preserve transient client-only state.
        suggestions: local.suggestions,
      });
    } else {
      merged.push(local);
    }
    localById.delete(cloud.id);
  }

  // Append local-only projects.
  for (const local of localById.values()) merged.push(local);

  // Pick a current project: prefer existing selection if still present.
  const currentId = state.currentProjectId;
  const stillExists =
    currentId && merged.some((p) => p.id === currentId);
  const nextCurrentId = stillExists ? currentId : merged[0]?.id ?? null;

  useProjectStore.setState({
    projects: merged,
    currentProjectId: nextCurrentId,
  });
}

/**
 * Mount once at the top of the authenticated tree. While the user is signed
 * in this hook:
 *   1. Pulls projects from Drive on first authentication (once per session).
 *   2. Subscribes to local store changes and debounce-pushes affected
 *      projects back to Drive.
 *
 * The cloud-metadata write triggered by a successful push does NOT itself
 * cause another sync, because the content hash excludes the `cloud` field.
 */
export function useDriveSync() {
  const { status, data } = useSession();
  const authed = status === "authenticated" && !data?.error;

  const initialPullDoneRef = useRef<string | null>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const lastHashRef = useRef<Map<string, string>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());

  const recomputePending = () => {
    useSyncStatusStore
      .getState()
      .setPending(timersRef.current.size + inFlightRef.current.size);
  };

  const runPush = async (projectId: string) => {
    if (inFlightRef.current.has(projectId)) return;
    inFlightRef.current.add(projectId);
    recomputePending();
    try {
      const latest = useProjectStore.getState().getProjectById(projectId);
      if (!latest) return;
      const outcome = await pushOne(latest);
      if (outcome.kind === "ok") {
        if (outcome.cloud) {
          useProjectStore
            .getState()
            .updateProject(projectId, { cloud: outcome.cloud });
        }
      } else if (outcome.kind === "auth") {
        notifyDriveError("Sign in again to keep syncing to Drive.");
      } else {
        notifyDriveError(outcome.message);
      }
    } finally {
      inFlightRef.current.delete(projectId);
      recomputePending();
    }
  };

  // (1) Initial pull on sign-in.
  useEffect(() => {
    if (!authed) return;
    const userKey = data?.user?.email ?? "anon";
    if (initialPullDoneRef.current === userKey) return;
    initialPullDoneRef.current = userKey;

    (async () => {
      const pullResult = await pullAll();
      if (pullResult.kind === "ok" && pullResult.projects.length > 0) {
        mergeCloudIntoStore(pullResult.projects);
      } else if (pullResult.kind === "auth") {
        notifyDriveError("Sign in again to load your projects from Drive.");
      } else if (pullResult.kind === "error") {
        notifyDriveError(pullResult.message);
      }

      // Seed the hash map so the very next subscribe-fire doesn't push
      // every project right back up just because they're now in the store.
      for (const p of useProjectStore.getState().projects) {
        lastHashRef.current.set(p.id, contentHash(p));
      }

      // Push any local-only projects (no cloud metadata yet) so first-time
      // sign-in lifts existing offline work into Drive without waiting for
      // the user to edit something.
      for (const p of useProjectStore.getState().projects) {
        if (p.cloud) continue;
        await runPush(p.id);
      }
    })();
  }, [authed, data?.user?.email]);

  // (2) Subscriber: debounced push per project on content change.
  useEffect(() => {
    if (!authed) return;

    // Seed hashes from current state so initial subscribe doesn't push
    // everything immediately.
    for (const p of useProjectStore.getState().projects) {
      if (!lastHashRef.current.has(p.id)) {
        lastHashRef.current.set(p.id, contentHash(p));
      }
    }

    const unsubscribe = useProjectStore.subscribe((state) => {
      for (const project of state.projects) {
        const hash = contentHash(project);
        if (lastHashRef.current.get(project.id) === hash) continue;
        lastHashRef.current.set(project.id, hash);

        const existing = timersRef.current.get(project.id);
        if (existing) clearTimeout(existing);

        timersRef.current.set(
          project.id,
          setTimeout(async () => {
            timersRef.current.delete(project.id);
            recomputePending();
            await runPush(project.id);
          }, DEBOUNCE_MS)
        );
        recomputePending();
      }
    });

    return () => {
      unsubscribe();
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();
      recomputePending();
    };
  }, [authed]);
}
