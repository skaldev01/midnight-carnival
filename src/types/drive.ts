/**
 * Per-project cloud sync metadata. A project's full state (script,
 * instructions, references, feedback, chats) lives in a single JSON file
 * inside the user's "Midnight Carnival" Drive folder. The file is looked
 * up by the project's local UUID stored in Drive `appProperties`, so it
 * survives renames and title collisions.
 */
export interface DriveMetadata {
  /** ID of the top-level "Midnight Carnival" folder in the user's Drive. */
  folderId: string;
  /** ID of this project's single JSON file. */
  fileId: string;
  /** ISO timestamp of the last successful push to Drive. */
  lastSyncedAt: string;
}
