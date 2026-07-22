import {
  deleteMetaValue,
  getAll,
  getMetaValue,
  replaceAll,
  setMetaValue,
} from "./database";
import {
  DOCUMENT_QUEUE_STORE,
  DOCUMENTS_STORE,
  EVENT_QUEUE_STORE,
  EVENTS_STORE,
  TASK_QUEUE_STORE,
  TASKS_STORE,
} from "./schema";

const CLOUD_SYNC_CURSOR_KEY = "cloudSyncCursor.v1";

async function readQueue<T>(store: typeof TASK_QUEUE_STORE | typeof DOCUMENT_QUEUE_STORE | typeof EVENT_QUEUE_STORE): Promise<T[]> {
  const entries = await getAll<{ id: number; value: T }>(store);
  return entries.sort((a, b) => a.id - b.id).map((entry) => entry.value);
}

async function writeQueue<T>(store: typeof TASK_QUEUE_STORE | typeof DOCUMENT_QUEUE_STORE | typeof EVENT_QUEUE_STORE, queue: T[]): Promise<void> {
  await replaceAll(
    store,
    queue.map((value, index) => ({ id: index + 1, value }))
  );
}

export async function readStoredCloudSyncCursor(sessionKey: string): Promise<string> {
  return (await getMetaValue<string>(`${CLOUD_SYNC_CURSOR_KEY}:${sessionKey}`)) ?? "0";
}

export async function writeStoredCloudSyncCursor(sessionKey: string, cursor: string): Promise<void> {
  await setMetaValue(`${CLOUD_SYNC_CURSOR_KEY}:${sessionKey}`, cursor);
}

export const readStoredTasks = <T>() => getAll<T>(TASKS_STORE);
export const writeStoredTasks = <T extends { id: string }>(tasks: T[]) =>
  replaceAll(TASKS_STORE, tasks);
export const readStoredTaskQueue = <T>() => readQueue<T>(TASK_QUEUE_STORE);
export const writeStoredTaskQueue = <T>(queue: T[]) =>
  writeQueue(TASK_QUEUE_STORE, queue);

export const readStoredDocuments = <T>() => getAll<T>(DOCUMENTS_STORE);
export const writeStoredDocuments = <T extends { id: string }>(documents: T[]) =>
  replaceAll(DOCUMENTS_STORE, documents);
export const readStoredDocumentQueue = <T>() => readQueue<T>(DOCUMENT_QUEUE_STORE);
export const writeStoredDocumentQueue = <T>(queue: T[]) =>
  writeQueue(DOCUMENT_QUEUE_STORE, queue);

export const readStoredEvents = <T>() => getAll<T>(EVENTS_STORE);
export const writeStoredEvents = <T extends { id: string }>(events: T[]) =>
  replaceAll(EVENTS_STORE, events);
export const readStoredEventQueue = <T>() => readQueue<T>(EVENT_QUEUE_STORE);
export const writeStoredEventQueue = <T>(queue: T[]) =>
  writeQueue(EVENT_QUEUE_STORE, queue);

function documentRecoveryKey(documentId: string): string {
  return `documentRecovery:${documentId}`;
}

export const readStoredDocumentRecovery = <T>(documentId: string) =>
  getMetaValue<T>(documentRecoveryKey(documentId));
export const writeStoredDocumentRecovery = <T>(documentId: string, value: T) =>
  setMetaValue(documentRecoveryKey(documentId), value);
export const deleteStoredDocumentRecovery = (documentId: string) =>
  deleteMetaValue(documentRecoveryKey(documentId));
