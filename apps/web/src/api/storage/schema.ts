export const DATABASE_NAME = "pioneer-work-suite";
export const DATABASE_VERSION = 2;

export const TASKS_STORE = "tasks";
export const TASK_QUEUE_STORE = "taskQueue";
export const DOCUMENTS_STORE = "documents";
export const DOCUMENT_QUEUE_STORE = "documentQueue";
export const EVENTS_STORE = "events";
export const EVENT_QUEUE_STORE = "eventQueue";
export const META_STORE = "meta";

export const WORKSPACE_BACKUP_STORES = [
  TASKS_STORE,
  TASK_QUEUE_STORE,
  DOCUMENTS_STORE,
  DOCUMENT_QUEUE_STORE,
  EVENTS_STORE,
  EVENT_QUEUE_STORE,
  META_STORE,
] as const;

export type StoreName = (typeof WORKSPACE_BACKUP_STORES)[number];
export type WorkspaceBackupStoreName = StoreName;
