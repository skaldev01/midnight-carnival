import "server-only";

import { google, type drive_v3 } from "googleapis";
import type { Project } from "@/types/project";
import type { DriveMetadata } from "@/types/drive";

const ROOT_FOLDER_NAME = "Midnight Carnival";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const PROJECT_ID_KEY = "midnightCarnivalProjectId";
const SCHEMA_VERSION = 1;

type DriveFiles = drive_v3.Drive["files"];

function client(accessToken: string): drive_v3.Drive {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

// ---------------------------------------------------------------------------
// Folder + file lookup helpers
// ---------------------------------------------------------------------------

function escapeQ(value: string): string {
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

export async function ensureRootFolder(accessToken: string): Promise<string> {
  const drive = client(accessToken);
  const existing = await findChild(
    drive.files,
    null,
    ROOT_FOLDER_NAME,
    FOLDER_MIME
  );
  if (existing) return existing;
  return createFolder(drive.files, null, ROOT_FOLDER_NAME);
}

/**
 * Look up a project's file by its appProperties.projectId tag — survives
 * file renames and avoids any reliance on the (mutable, collidable) title.
 */
async function findProjectFileByProjectId(
  files: DriveFiles,
  rootId: string,
  projectId: string
): Promise<string | null> {
  const res = await files.list({
    q: [
      `'${rootId}' in parents`,
      `appProperties has { key='${PROJECT_ID_KEY}' and value='${escapeQ(projectId)}' }`,
      "trashed = false",
    ].join(" and "),
    fields: "files(id, name)",
    spaces: "drive",
    pageSize: 10,
  });
  return res.data.files?.[0]?.id ?? null;
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
// File-name sanitization (Drive accepts most chars; we just strip path
// separators and trim. The file is keyed by ID anyway, name is cosmetic.)
// ---------------------------------------------------------------------------

function fileNameFor(title: string): string {
  const cleaned = title.replace(/[/\\]/g, " ").trim();
  return `${cleaned || "Untitled"}.json`;
}

// ---------------------------------------------------------------------------
// Public sync API
// ---------------------------------------------------------------------------

type ProjectFile = {
  schemaVersion: number;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  script: Project["script"];
  instructions: string;
  references: Project["references"];
  feedback: Project["feedback"];
  chats: Project["chats"];
};

function projectToFile(project: Project): ProjectFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: project.id,
    title: project.title,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    script: project.script ?? null,
    instructions: project.instructions ?? "",
    references: project.references ?? [],
    feedback: project.feedback ?? [],
    chats: project.chats ?? [],
  };
}

/**
 * Push a project's content to Drive as a single JSON file. Looks up the
 * existing file by appProperties.projectId so renames are safe and name
 * collisions can't create duplicates. Also opportunistically trashes any
 * legacy 5-file subfolder left behind by the old layout.
 */
export async function syncProjectToDrive(
  accessToken: string,
  project: Project
): Promise<DriveMetadata> {
  const drive = client(accessToken);
  const rootId = await ensureRootFolder(accessToken);

  // Resolve the file ID. Order of preference:
  //   1. The cached fileId (current layout).
  //   2. A search by appProperties.projectId in the root folder.
  //   3. None — we'll create one.
  let fileId =
    project.cloud?.fileId ??
    (await findProjectFileByProjectId(drive.files, rootId, project.id));

  const name = fileNameFor(project.title);
  const body = JSON.stringify(projectToFile(project), null, 2);
  const media = { mimeType: "application/json", body };

  if (fileId) {
    try {
      await drive.files.update({
        fileId,
        requestBody: { name },
        media,
      });
    } catch (err) {
      // File was deleted out from under us; fall through to create.
      console.warn(
        `[drive] update ${name} (${fileId}) failed, recreating:`,
        err
      );
      fileId = null;
    }
  }

  if (!fileId) {
    const res = await drive.files.create({
      requestBody: {
        name,
        parents: [rootId],
        appProperties: { [PROJECT_ID_KEY]: project.id },
      },
      media,
      fields: "id",
    });
    if (!res.data.id) throw new Error(`Drive create ${name} returned no id`);
    fileId = res.data.id;
  }

  // Best-effort cleanup of the legacy per-project subfolder, if this
  // project was previously synced under the old 5-file layout. Cached
  // folderId is the LEGACY subfolder ID when it differs from the root.
  // Failures here don't fail the sync — the user can also delete manually.
  const legacyFolderId = project.cloud?.folderId;
  if (legacyFolderId && legacyFolderId !== rootId) {
    try {
      await drive.files.update({
        fileId: legacyFolderId,
        requestBody: { trashed: true },
      });
    } catch (err) {
      console.warn(
        `[drive] failed to trash legacy folder ${legacyFolderId}:`,
        err
      );
    }
  }

  return {
    folderId: rootId,
    fileId,
    lastSyncedAt: new Date().toISOString(),
  };
}

type CloudProject = Pick<
  Project,
  | "id"
  | "title"
  | "script"
  | "instructions"
  | "feedback"
  | "chats"
  | "references"
  | "suggestions"
  | "createdAt"
  | "updatedAt"
> & { cloud: DriveMetadata };

function fileToCloudProject(
  file: ProjectFile,
  cloud: DriveMetadata
): CloudProject {
  return {
    id: file.id,
    title: file.title,
    script: file.script ?? null,
    instructions: file.instructions ?? "",
    feedback: file.feedback ?? [],
    chats: file.chats ?? [],
    references: file.references ?? [],
    suggestions: [],
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    cloud,
  };
}

/**
 * Legacy 5-file project layout: { meta.json, script.json, feedback.json,
 * chats.json, instructions.json } inside a per-project subfolder. Still
 * read on sign-in so users who haven't re-synced yet don't lose data.
 */
type LegacyMetaFile = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

async function readLegacyFolder(
  files: DriveFiles,
  folder: { id: string; name?: string | null }
): Promise<CloudProject | null> {
  const fileRes = await files.list({
    q: `'${folder.id}' in parents and trashed = false`,
    fields: "files(id, name)",
    spaces: "drive",
    pageSize: 50,
  });
  const byName: Record<string, string> = {};
  for (const f of fileRes.data.files ?? []) {
    if (f.id && f.name) byName[f.name] = f.id;
  }
  if (!byName["meta.json"]) return null;

  const [meta, script, feedback, chats, instructions] = await Promise.all([
    readJson<LegacyMetaFile>(files, byName["meta.json"]),
    byName["script.json"]
      ? readJson<Project["script"]>(files, byName["script.json"])
      : Promise.resolve(null),
    byName["feedback.json"]
      ? readJson<Project["feedback"]>(files, byName["feedback.json"])
      : Promise.resolve([] as Project["feedback"]),
    byName["chats.json"]
      ? readJson<Project["chats"]>(files, byName["chats.json"])
      : Promise.resolve([] as Project["chats"]),
    byName["instructions.json"]
      ? readJson<{ instructions: string }>(files, byName["instructions.json"])
      : Promise.resolve(null),
  ]);
  if (!meta) return null;

  // Legacy fileId doesn't exist; use the meta.json file ID as a placeholder
  // so the next push can find/replace correctly via appProperties lookup.
  // The legacy folderId is preserved so syncProjectToDrive can trash it
  // after the first successful new-layout push.
  return {
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
      fileId: byName["meta.json"],
      lastSyncedAt: new Date().toISOString(),
    },
  };
}

/**
 * Load every project from Drive on sign-in. Reads both the current
 * single-file layout and the legacy 5-file-subfolder layout, deduping by
 * project ID (current layout wins).
 */
export async function loadProjectsFromDrive(
  accessToken: string
): Promise<CloudProject[]> {
  const drive = client(accessToken);
  const rootId = await ensureRootFolder(accessToken);

  // (1) Current layout: JSON files directly in the root folder, each
  // tagged with appProperties.projectId.
  const fileRes = await drive.files.list({
    q: [
      `'${rootId}' in parents`,
      `mimeType != '${FOLDER_MIME}'`,
      "trashed = false",
    ].join(" and "),
    fields: "files(id, name, appProperties)",
    spaces: "drive",
    pageSize: 200,
  });

  const byProjectId = new Map<string, CloudProject>();

  for (const file of fileRes.data.files ?? []) {
    if (!file.id) continue;
    const content = await readJson<ProjectFile>(drive.files, file.id);
    if (!content || typeof content !== "object" || !content.id) continue;

    byProjectId.set(content.id, fileToCloudProject(content, {
      folderId: rootId,
      fileId: file.id,
      lastSyncedAt: new Date().toISOString(),
    }));
  }

  // (2) Legacy layout: per-project subfolders containing 5 JSON files.
  // Only adopt a legacy project if the current layout doesn't already
  // have one for the same project ID.
  const folderRes = await drive.files.list({
    q: [
      `'${rootId}' in parents`,
      `mimeType = '${FOLDER_MIME}'`,
      "trashed = false",
    ].join(" and "),
    fields: "files(id, name)",
    spaces: "drive",
    pageSize: 200,
  });

  for (const folder of folderRes.data.files ?? []) {
    if (!folder.id) continue;
    const legacy = await readLegacyFolder(drive.files, {
      id: folder.id,
      name: folder.name,
    });
    if (!legacy) continue;
    if (byProjectId.has(legacy.id)) continue;
    byProjectId.set(legacy.id, legacy);
  }

  return Array.from(byProjectId.values());
}
