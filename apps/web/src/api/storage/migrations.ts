import { getMetaValue, hasIndexedDb, replaceAll, setMetaValue } from "./database";
import {
  DOCUMENT_QUEUE_STORE,
  DOCUMENTS_STORE,
  TASK_QUEUE_STORE,
  TASKS_STORE,
} from "./schema";

const LEGACY_TASKS_CACHE_KEY = "pioneer.tasks.cache.v1";
const LEGACY_TASKS_QUEUE_KEY = "pioneer.tasks.queue.v1";
const LEGACY_DOCUMENTS_CACHE_KEY = "pioneer.documents.cache.v2";
const LEGACY_DOCUMENTS_QUEUE_KEY = "pioneer.documents.queue.v2";
const LEGACY_DOCUMENTS_CACHE_KEY_V1 = "pioneer.documents.cache.v1";
const LEGACY_DOCUMENTS_QUEUE_KEY_V1 = "pioneer.documents.queue.v1";
const MIGRATION_FLAG_KEY = "localStorageMigrationComplete";

function readLegacyJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function recordsWithId(values: unknown[]): Record<string, unknown>[] {
  return values.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as { id?: unknown }).id === "string"
  );
}

/** Imports task and document data from the pre-IndexedDB releases once. */
export async function migrateLegacyLocalStorage(): Promise<void> {
  if (!hasIndexedDb()) return;
  if (await getMetaValue<boolean>(MIGRATION_FLAG_KEY)) return;

  const legacyTasks = readLegacyJson<unknown[]>(LEGACY_TASKS_CACHE_KEY) ?? [];
  const legacyTaskQueue = readLegacyJson<unknown[]>(LEGACY_TASKS_QUEUE_KEY) ?? [];
  const legacyDocuments =
    readLegacyJson<unknown[]>(LEGACY_DOCUMENTS_CACHE_KEY) ??
    readLegacyJson<unknown[]>(LEGACY_DOCUMENTS_CACHE_KEY_V1) ??
    [];
  const legacyDocumentQueue =
    readLegacyJson<unknown[]>(LEGACY_DOCUMENTS_QUEUE_KEY) ??
    readLegacyJson<unknown[]>(LEGACY_DOCUMENTS_QUEUE_KEY_V1) ??
    [];

  await replaceAll(TASKS_STORE, recordsWithId(legacyTasks));
  await replaceAll(DOCUMENTS_STORE, recordsWithId(legacyDocuments));
  await replaceAll(
    TASK_QUEUE_STORE,
    legacyTaskQueue.map((value, index) => ({ id: index + 1, value }))
  );
  await replaceAll(
    DOCUMENT_QUEUE_STORE,
    legacyDocumentQueue.map((value, index) => ({ id: index + 1, value }))
  );
  await setMetaValue(MIGRATION_FLAG_KEY, true);
}
