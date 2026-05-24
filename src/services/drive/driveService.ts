import "server-only";

import { google, type drive_v3 } from "googleapis";
import type { Project } from "@/types/project";
import type { DriveMetadata } from "@/types/drive";

const ROOT_FOLDER_NAME = "Midnight Carnival";
const FOLDER_MIME = "application/vnd.google-apps.folder";

type DriveFiles = drive_v3.Drive["files"];

function client(accessToken: string): drive_v3.Drive {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

// ---------------------------------------------------------------------------
// Folder helpers
// ---------------------------------------------------------------------------

function escapeQ(value: string): string {
  // Drive search query strings are single-quoted; escape inner single quotes.
  return value.replace(/'/g, "\\'");
}

async function findChild(
  files: DriveFiles,
  parentId: string | null,
  name: string,
  mimeType?: string
): Promise<string | null> {
  const clauses = [
    `name = '${escapeQ(name)}'`,
    "trashed = false",
    parentId ? `'${parentId}' in parents` : null,
    mimeType ? `mimeType = '${mimeType}'` : null,
  ].filter(Boolean);

  const res = await files.list({
    q: clauses.join(" and "),
    fields: "files(id, name)",
    spaces: "drive",
    pageSize: 10,
  });
  return res.data.files?.[0]?.id ?? null;
}

async function createFolder(
  files: DriveFiles,
  parentId: string | null,
  name: string
): Promise<string> {
  const res = await files.create({
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });
  if (!res.data.id) throw new Error("Drive folder create returned no id");
  return res.data.id;
}

/**
 * Find or create the top-level "Midnight Carnival" folder in the user's Drive.
 * Returns the folder ID.
 */
export async function ensureRootFolder(accessToken: string): Promise<string> {
  const drive = client(accessToken);
  const existing = await findChild(drive.files, null, ROOT_FOLDER_NAME, FOLDER_MIME);
  if (existing) return existing;
  return createFolder(drive.files, null, ROOT_FOLDER_NAME);
}

async function ensureProjectFolder(
  files: DriveFiles,
  rootId: string,
  title: string
): Promise<string> {
  const existing = await findChild(files, rootId, title, FOLDER_MIME);
  if (existing) return existing;
  return createFolder(files, rootId, title);
}

// ---------------------------------------------------------------------------
// JSON file helpers
// ---------------------------------------------------------------------------

async function upsertJson(
  files: DriveFiles,
  parentId: string,
  name: string,
  content: unknown,
  existingId: string | undefined
): Promise<string> {
  const body = JSON.stringify(content ?? null, null, 2);
  const media = { mimeType: "application/json", body };

  if (existingId) {
    try {
      await files.update({ fileId: existingId, media });
      return existingId;
    } catch (err) {
      // File may have been deleted in Drive. Fall through to create.
      console.warn(
        `[drive] update ${name} (${existingId}) failed, recreating:`,
        err
      );
    }
  }

  const res = await files.create({
    requestBody: { name, parents: [parentId] },
    media,
    fields: "id",
  });
  if (!res.data.id) throw new Error(`Drive create ${name} returned no id`);
  return res.data.id;
}

async function readJson<T>(
  files: DriveFiles,
  fileId: string
): Promise<T | null> {
  try {
    const res = await files.get(
      { fileId, alt: "media" },
      { responseType: "text" }
    );
    if (typeof res.data === "string") return JSON.parse(res.data) as T;
    return res.data as T;
  } catch (err) {
    console.warn(`[drive] read ${fileId} failed:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public sync API
// ---------------------------------------------------------------------------

type ProjectMetaFile = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Push a project's content to Drive. Creates folder + files on first sync,
 * updates existing files on subsequent syncs. Returns the cloud metadata
 * that the client should store on the project.
 */
export async function syncProjectToDrive(
  accessToken: string,
  project: Project
): Promise<DriveMetadata> {
  const drive = client(accessToken);
  const rootId = await ensureRootFolder(accessToken);
  const folderId =
    project.cloud?.folderId ??
    (await ensureProjectFolder(drive.files, rootId, project.title));

  // If the folder ID was cached but the user renamed the project locally,
  // rename the Drive folder too so the layout stays human-browsable.
  if (project.cloud?.folderId) {
    try {
      await drive.files.update({
        fileId: project.cloud.folderId,
        requestBody: { name: project.title },
      });
    } catch (err) {
      console.warn("[drive] folder rename failed (continuing):", err);
    }
  }

  const meta: ProjectMetaFile = {
    id: project.id,
    title: project.title,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };

  const existing = project.cloud?.files ?? {};

  const [metaId, scriptId, feedbackId, chatsId, instructionsId] =
    await Promise.all([
      upsertJson(drive.files, folderId, "meta.json", meta, existing.meta),
      upsertJson(
        drive.files,
        folderId,
        "script.json",
        project.script ?? null,
        existing.script
      ),
      upsertJson(
        drive.files,
        folderId,
        "feedback.json",
        project.feedback ?? [],
        existing.feedback
      ),
      upsertJson(
        drive.files,
        folderId,
        "chats.json",
        project.chats ?? [],
        existing.chats
      ),
      upsertJson(
        drive.files,
        folderId,
        "instructions.json",
        { instructions: project.instructions ?? "" },
        existing.instructions
      ),
    ]);

  return {
    folderId,
    files: {
      meta: metaId,
      script: scriptId,
      feedback: feedbackId,
      chats: chatsId,
      instructions: instructionsId,
    },
    lastSyncedAt: new Date().toISOString(),
  };
}

type CloudProject = Pick<
  Project,
  "id" | "title" | "script" | "instructions" | "feedback" | "chats" |
  "references" | "suggestions" | "createdAt" | "updatedAt"
> & { cloud: DriveMetadata };

/**
 * Load every project in the "Midnight Carnival" folder from Drive. Used on
 * sign-in to populate the local store with cloud data.
 */
export async function loadProjectsFromDrive(
  accessToken: string
): Promise<CloudProject[]> {
  const drive = client(accessToken);
  const rootId = await ensureRootFolder(accessToken);

  // List project subfolders under the root.
  const folderRes = await drive.files.list({
    q: `'${rootId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id, name)",
    spaces: "drive",
    pageSize: 200,
  });
  const folders = folderRes.data.files ?? [];

  const projects: CloudProject[] = [];

  for (const folder of folders) {
    if (!folder.id) continue;

    // List the JSON files in this project folder.
    const fileRes = await drive.files.list({
      q: `'${folder.id}' in parents and trashed = false`,
      fields: "files(id, name)",
      spaces: "drive",
      pageSize: 50,
    });
    const filesByName: Record<string, string> = {};
    for (const f of fileRes.data.files ?? []) {
      if (f.id && f.name) filesByName[f.name] = f.id;
    }

    if (!filesByName["meta.json"]) {
      // Not a project folder we recognize — skip silently.
      continue;
    }

    const [meta, script, feedback, chats, instructions] = await Promise.all([
      readJson<ProjectMetaFile>(drive.files, filesByName["meta.json"]),
      filesByName["script.json"]
        ? readJson<Project["script"]>(drive.files, filesByName["script.json"])
        : Promise.resolve(null),
      filesByName["feedback.json"]
        ? readJson<Project["feedback"]>(drive.files, filesByName["feedback.json"])
        : Promise.resolve([] as Project["feedback"]),
      filesByName["chats.json"]
        ? readJson<Project["chats"]>(drive.files, filesByName["chats.json"])
        : Promise.resolve([] as Project["chats"]),
      filesByName["instructions.json"]
        ? readJson<{ instructions: string }>(
            drive.files,
            filesByName["instructions.json"]
          )
        : Promise.resolve(null),
    ]);

    if (!meta) continue;

    projects.push({
      id: meta.id,
      title: meta.title,
      script: script ?? null,
      instructions: instructions?.instructions ?? "",
      feedback: feedback ?? [],
      chats: chats ?? [],
      references: [],
      suggestions: [],
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      cloud: {
        folderId: folder.id,
        files: {
          meta: filesByName["meta.json"],
          script: filesByName["script.json"],
          feedback: filesByName["feedback.json"],
          chats: filesByName["chats.json"],
          instructions: filesByName["instructions.json"],
        },
        lastSyncedAt: new Date().toISOString(),
      },
    });
  }

  return projects;
}
