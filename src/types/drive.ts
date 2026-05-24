/**
 * Per-project cloud sync metadata. Tracks the Drive folder + file IDs so
 * subsequent saves update existing files instead of creating duplicates.
 */
export interface DriveMetadata {
  folderId: string;
  files: {
    meta?: string;
    script?: string;
    feedback?: string;
    chats?: string;
    instructions?: string;
  };
  /** ISO timestamp of the last successful push to Drive. */
  lastSyncedAt: string;
}
