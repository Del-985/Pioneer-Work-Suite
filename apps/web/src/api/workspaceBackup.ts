import { APP_VERSION } from "../config/appMetadata";
import {
  exportStoredWorkspaceSnapshot,
  importStoredWorkspaceSnapshot,
  isStoredWorkspaceSnapshot,
} from "./storage";
import type { StoredWorkspaceSnapshot } from "./storage";

const BACKUP_FORMAT = "pioneer-work-suite-backup";
const BACKUP_SCHEMA_VERSION = 1;
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

const LAST_BACKUP_AT_KEY = "pioneer.backup.lastSuccessfulAt.v1";
const LAST_RESTORE_AT_KEY = "pioneer.backup.lastRestoreAt.v1";

const SAFE_LOCAL_STORAGE_KEYS = [
  "pioneer.settings.v1",
  "pioneer.localWorkspace.enabled.v1",
  "pioneer.localWorkspace.name.v1",
  "pioneer:command-palette-history",
  "suite:lastDocumentId",
] as const;

type SafeLocalStorageKey = (typeof SAFE_LOCAL_STORAGE_KEYS)[number];

export interface WorkspaceBackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  appVersion: string;
  createdAt: string;
  localStorage: Partial<Record<SafeLocalStorageKey, string>>;
  indexedDb: StoredWorkspaceSnapshot;
}

export interface WorkspaceBackupSummary {
  createdAt: string;
  tasks: number;
  documents: number;
  events: number;
  pendingSync: number;
}

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function readSafeLocalStorage(): WorkspaceBackupFile["localStorage"] {
  if (!hasWindow()) {
    return {};
  }

  const values: WorkspaceBackupFile["localStorage"] = {};

  for (const key of SAFE_LOCAL_STORAGE_KEYS) {
    const value = window.localStorage.getItem(key);

    if (value !== null) {
      values[key] = value;
    }
  }

  return values;
}

function isSafeLocalStorageSnapshot(
  value: unknown
): value is WorkspaceBackupFile["localStorage"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const entries = Object.entries(value);

  return entries.every(
    ([key, item]) =>
      SAFE_LOCAL_STORAGE_KEYS.includes(key as SafeLocalStorageKey) &&
      typeof item === "string"
  );
}

function replaceSafeLocalStorage(
  values: WorkspaceBackupFile["localStorage"]
): void {
  if (!hasWindow()) {
    return;
  }

  for (const key of SAFE_LOCAL_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }

  for (const [key, value] of Object.entries(values)) {
    if (
      SAFE_LOCAL_STORAGE_KEYS.includes(key as SafeLocalStorageKey) &&
      typeof value === "string"
    ) {
      window.localStorage.setItem(key, value);
    }
  }
}

function parseBackupFile(value: unknown): WorkspaceBackupFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("This file is not a Pioneer Work Suite backup.");
  }

  const candidate = value as Partial<WorkspaceBackupFile>;

  if (
    candidate.format !== BACKUP_FORMAT ||
    candidate.schemaVersion !== BACKUP_SCHEMA_VERSION ||
    typeof candidate.appVersion !== "string" ||
    typeof candidate.createdAt !== "string" ||
    Number.isNaN(new Date(candidate.createdAt).getTime()) ||
    !isSafeLocalStorageSnapshot(candidate.localStorage) ||
    !isStoredWorkspaceSnapshot(candidate.indexedDb)
  ) {
    throw new Error("The backup file is invalid or uses an unsupported version.");
  }

  return candidate as WorkspaceBackupFile;
}

function summarizeBackup(backup: WorkspaceBackupFile): WorkspaceBackupSummary {
  const stores = backup.indexedDb.stores;

  return {
    createdAt: backup.createdAt,
    tasks: stores.tasks.length,
    documents: stores.documents.length,
    events: stores.events.length,
    pendingSync:
      stores.taskQueue.length +
      stores.documentQueue.length +
      stores.eventQueue.length,
  };
}

export function getLastWorkspaceBackupAt(): string | null {
  if (!hasWindow()) {
    return null;
  }

  const value = window.localStorage.getItem(LAST_BACKUP_AT_KEY);

  return value && !Number.isNaN(new Date(value).getTime())
    ? value
    : null;
}

export function getLastWorkspaceRestoreAt(): string | null {
  if (!hasWindow()) {
    return null;
  }

  const value = window.localStorage.getItem(LAST_RESTORE_AT_KEY);

  return value && !Number.isNaN(new Date(value).getTime())
    ? value
    : null;
}

export async function createWorkspaceBackup(): Promise<WorkspaceBackupFile> {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    localStorage: readSafeLocalStorage(),
    indexedDb: await exportStoredWorkspaceSnapshot(),
  };
}

export async function downloadWorkspaceBackup(): Promise<WorkspaceBackupSummary> {
  if (!hasWindow()) {
    throw new Error("Backup downloads are unavailable in this environment.");
  }

  const backup = await createWorkspaceBackup();
  const content = JSON.stringify(backup, null, 2);
  const blob = new Blob([content], { type: "application/json" });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const date = backup.createdAt.slice(0, 10);

  anchor.href = downloadUrl;
  anchor.download = `pioneer-work-suite-backup-${date}.json`;
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);

  window.localStorage.setItem(LAST_BACKUP_AT_KEY, backup.createdAt);

  return summarizeBackup(backup);
}

export async function restoreWorkspaceBackup(
  file: File
): Promise<WorkspaceBackupSummary> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new Error("The backup file is larger than the 50 MB safety limit.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(await file.text()) as unknown;
  } catch {
    throw new Error("The selected backup is not valid JSON.");
  }

  const backup = parseBackupFile(parsed);
  const previousIndexedDb = await exportStoredWorkspaceSnapshot();
  const previousLocalStorage = readSafeLocalStorage();

  try {
    await importStoredWorkspaceSnapshot(backup.indexedDb);
    replaceSafeLocalStorage(backup.localStorage);
  } catch (error) {
    await importStoredWorkspaceSnapshot(previousIndexedDb);
    replaceSafeLocalStorage(previousLocalStorage);
    throw error;
  }

  if (hasWindow()) {
    window.localStorage.setItem(LAST_BACKUP_AT_KEY, backup.createdAt);
    window.localStorage.setItem(LAST_RESTORE_AT_KEY, new Date().toISOString());
  }

  return summarizeBackup(backup);
}
