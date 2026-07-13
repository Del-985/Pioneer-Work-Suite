// apps/web/src/api/documents.ts
import { http } from "./http";
import { hasCloudSession } from "./session";
import {
  hasBrowserWindow,
  isBrowserOffline,
  isRecoverableOfflineError,
  notifySyncStateChanged,
} from "./syncSupport";
import {
  migrateLegacyLocalStorage,
  readStoredDocumentQueue,
  readStoredDocuments,
  writeStoredDocumentQueue,
  writeStoredDocuments,
} from "./storage";

export const DOCUMENTS_CHANGED_EVENT = "pioneer:documents-changed";
import {
  sortDocumentsByPinnedThenUpdated,
} from "../utils/documentSort";

export interface Document {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentPatch {
  title?: string;
  content?: string;
  isPinned?: boolean;
  isFavorite?: boolean;
}

interface CreateDocumentOptions {
  isPinned?: boolean;
  isFavorite?: boolean;
}

interface CreateDocumentOp {
  kind: "create";
  tempId: string;
  payload: {
    title: string;
    content: string;
    isPinned: boolean;
    isFavorite: boolean;
  };
  timestamp: number;
}

interface UpdateDocumentOp {
  kind: "update";
  id: string;
  patch: DocumentPatch;
  timestamp: number;
}

interface DeleteDocumentOp {
  kind: "delete";
  id: string;
  timestamp: number;
}

type DocumentOp =
  | CreateDocumentOp
  | UpdateDocumentOp
  | DeleteDocumentOp;

let storageInitialization: Promise<void> | null = null;
let pendingDocumentSyncCount = 0;



function nowIso(): string {
  return new Date().toISOString();
}

function makeOfflineId(): string {
  return `offline-doc-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function isOfflineId(id: string): boolean {
  return id.startsWith("offline-doc-");
}

function normalizePatch(patch: DocumentPatch): DocumentPatch {
  const normalized: DocumentPatch = { ...patch };

  if (patch.title !== undefined) {
    normalized.title =
      patch.title.trim() || "Untitled document";
  }

  if (patch.content !== undefined) {
    normalized.content = String(patch.content);
  }

  if (patch.isPinned !== undefined) {
    normalized.isPinned = Boolean(patch.isPinned);
  }

  if (patch.isFavorite !== undefined) {
    normalized.isFavorite = Boolean(patch.isFavorite);
  }

  return normalized;
}

function normalizeDocument(raw: any): Document {
  const now = nowIso();

  return {
    id: String(raw?.id ?? makeOfflineId()),
    title: String(raw?.title ?? "Untitled document"),
    content: String(raw?.content ?? ""),
    isPinned: Boolean(raw?.isPinned),
    isFavorite: Boolean(raw?.isFavorite),
    createdAt: raw?.createdAt ? String(raw.createdAt) : now,
    updatedAt: raw?.updatedAt ? String(raw.updatedAt) : now,
  };
}

async function ensureDocumentStorageReady(): Promise<void> {
  if (!storageInitialization) {
    storageInitialization = (async () => {
      await migrateLegacyLocalStorage();

      await refreshPendingDocumentSyncCount();
    })();
  }

  await storageInitialization;
}

// ---------- IndexedDB cache ----------

async function readDocumentsCache(): Promise<Document[]> {
  await ensureDocumentStorageReady();

  const storedDocuments =
    await readStoredDocuments<Document>();

  return sortDocumentsByPinnedThenUpdated(
    storedDocuments.map(normalizeDocument)
  );
}

async function writeDocumentsCache(
  documents: Document[]
): Promise<void> {
  const normalized = sortDocumentsByPinnedThenUpdated(
    documents.map(normalizeDocument)
  );

  await writeStoredDocuments(normalized);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(DOCUMENTS_CHANGED_EVENT));
  }
}

async function mergeDocumentIntoCache(
  document: Document
): Promise<void> {
  const normalized = normalizeDocument(document);
  const documents = await readDocumentsCache();

  const index = documents.findIndex(
    (entry) => entry.id === normalized.id
  );

  if (index === -1) {
    documents.unshift(normalized);
  } else {
    documents[index] = {
      ...documents[index],
      ...normalized,
    };
  }

  await writeDocumentsCache(documents);
}

async function removeDocumentFromCache(
  id: string
): Promise<void> {
  const documents = await readDocumentsCache();

  await writeDocumentsCache(
    documents.filter((document) => document.id !== id)
  );
}


// ---------- IndexedDB queue ----------

function normalizeQueueOperation(
  operation: any
): DocumentOp | null {
  if (!operation || typeof operation !== "object") {
    return null;
  }

  if (operation.kind === "create") {
    return {
      kind: "create",
      tempId: String(operation.tempId),
      payload: {
        title: String(
          operation.payload?.title ?? "Untitled document"
        ),
        content: String(operation.payload?.content ?? ""),
        isPinned: Boolean(operation.payload?.isPinned),
        isFavorite: Boolean(
          operation.payload?.isFavorite
        ),
      },
      timestamp:
        Number(operation.timestamp) || Date.now(),
    };
  }

  if (operation.kind === "update") {
    return {
      kind: "update",
      id: String(operation.id),
      patch: normalizePatch(operation.patch ?? {}),
      timestamp:
        Number(operation.timestamp) || Date.now(),
    };
  }

  if (operation.kind === "delete") {
    return {
      kind: "delete",
      id: String(operation.id),
      timestamp:
        Number(operation.timestamp) || Date.now(),
    };
  }

  return null;
}

async function readQueue(): Promise<DocumentOp[]> {
  await ensureDocumentStorageReady();

  const queue =
    await readStoredDocumentQueue<DocumentOp>();

  return queue
    .map(normalizeQueueOperation)
    .filter(
      (operation): operation is DocumentOp =>
        operation !== null
    );
}

async function writeQueue(
  queue: DocumentOp[]
): Promise<void> {
  await writeStoredDocumentQueue(queue);

  pendingDocumentSyncCount = queue.length;
  notifySyncStateChanged();
}

export function getPendingDocumentSyncCount(): number {
  return pendingDocumentSyncCount;
}

export async function refreshPendingDocumentSyncCount(): Promise<number> {
  const queue =
    await readStoredDocumentQueue<DocumentOp>();

  pendingDocumentSyncCount = queue.length;

  return pendingDocumentSyncCount;
}


async function enqueueCreate(
  operation: CreateDocumentOp
): Promise<void> {
  const queue = await readQueue();

  queue.push(operation);
  await writeQueue(queue);
}

async function enqueueUpdate(
  id: string,
  patch: DocumentPatch
): Promise<void> {
  const normalizedPatch = normalizePatch(patch);
  const queue = await readQueue();

  const createIndex = queue.findIndex(
    (operation) =>
      operation.kind === "create" &&
      operation.tempId === id
  );

  if (createIndex !== -1) {
    const create =
      queue[createIndex] as CreateDocumentOp;

    queue[createIndex] = {
      ...create,
      payload: {
        ...create.payload,
        ...normalizedPatch,
      },
      timestamp: Date.now(),
    };

    await writeQueue(queue);
    return;
  }

  if (
    queue.some(
      (operation) =>
        operation.kind === "delete" &&
        operation.id === id
    )
  ) {
    return;
  }

  const updateIndex = queue.findIndex(
    (operation) =>
      operation.kind === "update" &&
      operation.id === id
  );

  if (updateIndex !== -1) {
    const previous =
      queue[updateIndex] as UpdateDocumentOp;

    queue[updateIndex] = {
      ...previous,
      patch: {
        ...previous.patch,
        ...normalizedPatch,
      },
      timestamp: Date.now(),
    };
  } else {
    queue.push({
      kind: "update",
      id,
      patch: normalizedPatch,
      timestamp: Date.now(),
    });
  }

  await writeQueue(queue);
}

async function enqueueDelete(
  id: string
): Promise<void> {
  const queue = (await readQueue()).filter(
    (operation) => {
      if (
        operation.kind === "create" &&
        operation.tempId === id
      ) {
        return false;
      }

      if (
        operation.kind === "update" &&
        operation.id === id
      ) {
        return false;
      }

      if (
        operation.kind === "delete" &&
        operation.id === id
      ) {
        return false;
      }

      return true;
    }
  );

  if (!isOfflineId(id)) {
    queue.push({
      kind: "delete",
      id,
      timestamp: Date.now(),
    });
  }

  await writeQueue(queue);
}

// ---------- Cloud-only API ----------

async function fetchDocumentsOnlineOnly(): Promise<Document[]> {
  const { data } = await http.get("/documents");

  const rawDocuments = Array.isArray(data)
    ? data
    : data && Array.isArray(data.documents)
      ? data.documents
      : [];

  return sortDocumentsByPinnedThenUpdated(
    rawDocuments.map(normalizeDocument)
  );
}

async function createDocumentOnlineOnly(
  payload: CreateDocumentOp["payload"]
): Promise<Document> {
  const { data } = await http.post(
    "/documents",
    payload
  );

  return normalizeDocument(data?.document ?? data);
}

async function updateDocumentOnlineOnly(
  id: string,
  updates: DocumentPatch
): Promise<Document> {
  const { data } = await http.put(
    `/documents/${id}`,
    updates
  );

  return normalizeDocument(data?.document ?? data);
}

async function deleteDocumentOnlineOnly(
  id: string
): Promise<void> {
  await http.delete(`/documents/${id}`);
}

// ---------- Public API ----------

export async function fetchDocuments(): Promise<Document[]> {
  await ensureDocumentStorageReady();

  if (
    !hasCloudSession() ||
    isBrowserOffline()
  ) {
    return readDocumentsCache();
  }

  try {
    const remoteDocuments =
      await fetchDocumentsOnlineOnly();
    const localDocuments =
      await readDocumentsCache();
    const queue = await readQueue();

    const pendingUpdates = new Set(
      queue
        .filter(
          (
            operation
          ): operation is UpdateDocumentOp =>
            operation.kind === "update"
        )
        .map((operation) => operation.id)
    );

    const pendingDeletes = new Set(
      queue
        .filter(
          (
            operation
          ): operation is DeleteDocumentOp =>
            operation.kind === "delete"
        )
        .map((operation) => operation.id)
    );

    const merged =
      new Map<string, Document>();

    for (const document of remoteDocuments) {
      if (!pendingDeletes.has(document.id)) {
        merged.set(document.id, document);
      }
    }

    for (const localDocument of localDocuments) {
      if (
        isOfflineId(localDocument.id) ||
        pendingUpdates.has(localDocument.id) ||
        pendingDeletes.has(localDocument.id)
      ) {
        if (!pendingDeletes.has(localDocument.id)) {
          merged.set(
            localDocument.id,
            localDocument
          );
        }
      }
    }

    const documents = sortDocumentsByPinnedThenUpdated(
      [...merged.values()]
    );

    await writeDocumentsCache(documents);

    return documents;
  } catch (error) {
    if (isRecoverableOfflineError(error)) {
      return readDocumentsCache();
    }

    throw error;
  }
}

export async function createDocument(
  title: string,
  content: string = "",
  options: CreateDocumentOptions = {}
): Promise<Document> {
  await ensureDocumentStorageReady();

  const payload: CreateDocumentOp["payload"] = {
    title:
      title.trim() || "Untitled document",
    content: content || "",
    isPinned: Boolean(options.isPinned),
    isFavorite: Boolean(options.isFavorite),
  };

  const localDocument: Document = {
    id: makeOfflineId(),
    ...payload,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  if (
    !hasCloudSession() ||
    isBrowserOffline()
  ) {
    await mergeDocumentIntoCache(localDocument);

    await enqueueCreate({
      kind: "create",
      tempId: localDocument.id,
      payload,
      timestamp: Date.now(),
    });

    return localDocument;
  }

  try {
    const created =
      await createDocumentOnlineOnly(payload);

    await mergeDocumentIntoCache(created);

    return created;
  } catch (error) {
    if (!isRecoverableOfflineError(error)) {
      throw error;
    }

    await mergeDocumentIntoCache(localDocument);

    await enqueueCreate({
      kind: "create",
      tempId: localDocument.id,
      payload,
      timestamp: Date.now(),
    });

    return localDocument;
  }
}

export async function duplicateDocument(
  source: Document
): Promise<Document> {
  const copyTitle = source.title
    ? `Copy of ${source.title}`
    : "Copy of Untitled document";

  return createDocument(
    copyTitle,
    source.content,
    {
      isPinned: false,
      isFavorite: false,
    }
  );
}

export async function updateDocument(
  id: string,
  updates: DocumentPatch
): Promise<Document> {
  await ensureDocumentStorageReady();

  const normalizedUpdates =
    normalizePatch(updates);

  const current = (
    await readDocumentsCache()
  ).find((document) => document.id === id);

  const optimistic = normalizeDocument({
    ...(current ?? {
      id,
      title: "Untitled document",
      content: "",
      isPinned: false,
      isFavorite: false,
      createdAt: nowIso(),
    }),
    ...normalizedUpdates,
    updatedAt: nowIso(),
  });

  await mergeDocumentIntoCache(optimistic);

  if (
    !hasCloudSession() ||
    isBrowserOffline()
  ) {
    await enqueueUpdate(
      id,
      normalizedUpdates
    );

    return optimistic;
  }

  try {
    const updated =
      await updateDocumentOnlineOnly(
        id,
        normalizedUpdates
      );

    await mergeDocumentIntoCache(updated);

    return updated;
  } catch (error) {
    if (!isRecoverableOfflineError(error)) {
      throw error;
    }

    await enqueueUpdate(
      id,
      normalizedUpdates
    );

    return optimistic;
  }
}

export async function deleteDocument(
  id: string
): Promise<void> {
  await ensureDocumentStorageReady();
  await removeDocumentFromCache(id);

  if (
    !hasCloudSession() ||
    isBrowserOffline()
  ) {
    await enqueueDelete(id);
    return;
  }

  try {
    await deleteDocumentOnlineOnly(id);
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return;
    }

    if (!isRecoverableOfflineError(error)) {
      throw error;
    }

    await enqueueDelete(id);
  }
}

// ---------- Queue sync ----------

export async function syncOfflineDocumentQueue(): Promise<void> {
  await ensureDocumentStorageReady();

  if (
    !hasBrowserWindow() ||
    !hasCloudSession() ||
    isBrowserOffline()
  ) {
    return;
  }

  const queue = await readQueue();

  if (queue.length === 0) {
    return;
  }

  const remaining: DocumentOp[] = [];

  for (
    let index = 0;
    index < queue.length;
    index += 1
  ) {
    const operation = queue[index];

    try {
      if (operation.kind === "create") {
        const created =
          await createDocumentOnlineOnly(
            operation.payload
          );

        const cached =
          await readDocumentsCache();

        const cachedIndex = cached.findIndex(
          (document) =>
            document.id === operation.tempId
        );

        if (cachedIndex !== -1) {
          cached[cachedIndex] = created;
          await writeDocumentsCache(cached);
        } else {
          await mergeDocumentIntoCache(created);
        }

        for (
          let laterIndex = index + 1;
          laterIndex < queue.length;
          laterIndex += 1
        ) {
          const later = queue[laterIndex];

          if (
            later.kind === "update" &&
            later.id === operation.tempId
          ) {
            later.id = created.id;
          }

          if (
            later.kind === "delete" &&
            later.id === operation.tempId
          ) {
            later.id = created.id;
          }
        }

        continue;
      }

      if (operation.kind === "update") {
        if (isOfflineId(operation.id)) {
          remaining.push(operation);
          continue;
        }

        const updated =
          await updateDocumentOnlineOnly(
            operation.id,
            operation.patch
          );

        await mergeDocumentIntoCache(updated);
        continue;
      }

      if (operation.kind === "delete") {
        if (isOfflineId(operation.id)) {
          await removeDocumentFromCache(
            operation.id
          );
          continue;
        }

        await deleteDocumentOnlineOnly(
          operation.id
        );
        await removeDocumentFromCache(
          operation.id
        );
      }
    } catch (error) {
      if (isRecoverableOfflineError(error)) {
        remaining.push(
          operation,
          ...queue.slice(index + 1)
        );
        await writeQueue(remaining);
        return;
      }

      console.error(
        "[Document sync] operation failed:",
        operation,
        error
      );
      remaining.push(operation);
    }
  }

  await writeQueue(remaining);

  try {
    await fetchDocuments();
  } catch {
    // IndexedDB remains available until a later successful sync.
  }
}

