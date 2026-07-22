// apps/web/src/api/documents.ts
import { http } from "./http";
import { hasCloudSession } from "./session";
import {
  hasBrowserWindow,
  isBrowserOffline,
  isRecoverableOfflineError,
  makeSyncMutationId,
  deleteWithVersionRetry,
  updateWithVersionRetry,
} from "./syncSupport";
import {
  createOfflineSyncQueue,
  type OfflineCreateOperation,
  type OfflineDeleteOperation,
  type OfflineSyncOperation,
  type OfflineUpdateOperation,
} from "./offlineSyncQueue";
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
  version: number;
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

type DocumentCreatePayload = {
    title: string;
    content: string;
    isPinned: boolean;
    isFavorite: boolean;
};

type CreateDocumentOp = OfflineCreateOperation<DocumentCreatePayload>;
type UpdateDocumentOp = OfflineUpdateOperation<DocumentPatch>;
type DeleteDocumentOp = OfflineDeleteOperation;
type DocumentOp = OfflineSyncOperation<DocumentCreatePayload, DocumentPatch>;



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
    version: Number.isInteger(Number(raw?.version)) && Number(raw.version) > 0
      ? Number(raw.version)
      : 1,
  };
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
      mutationId: String(operation.mutationId || makeSyncMutationId("document-create")),
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
      mutationId: String(operation.mutationId || makeSyncMutationId("document-update")),
      baseVersion: Math.max(1, Number(operation.baseVersion) || 1),
      patch: normalizePatch(operation.patch ?? {}),
      timestamp:
        Number(operation.timestamp) || Date.now(),
    };
  }

  if (operation.kind === "delete") {
    return {
      kind: "delete",
      id: String(operation.id),
      mutationId: String(operation.mutationId || makeSyncMutationId("document-delete")),
      baseVersion: Math.max(1, Number(operation.baseVersion) || 1),
      timestamp:
        Number(operation.timestamp) || Date.now(),
    };
  }

  return null;
}

const documentQueue = createOfflineSyncQueue<
  DocumentCreatePayload,
  DocumentPatch
>({
  scope: "document",
  migrate: migrateLegacyLocalStorage,
  readStored: () => readStoredDocumentQueue<unknown>(),
  writeStored: writeStoredDocumentQueue,
  normalizePayload: (payload) => {
    const operation = normalizeQueueOperation({ kind: "create", payload });
    return operation && operation.kind === "create"
      ? operation.payload
      : {
          title: "Untitled document",
          content: "",
          isPinned: false,
          isFavorite: false,
        };
  },
  normalizePatch: (patch) => normalizePatch((patch ?? {}) as DocumentPatch),
});

const ensureDocumentStorageReady = documentQueue.ensureReady;
const readQueue = documentQueue.read;
const writeQueue = documentQueue.replace;

export function getPendingDocumentSyncCount(): number {
  return documentQueue.pendingCount();
}

export async function refreshPendingDocumentSyncCount(): Promise<number> {
  return documentQueue.refreshPendingCount();
}


async function enqueueCreate(
  operation: CreateDocumentOp
): Promise<void> {
  await documentQueue.enqueueCreate(
    operation.tempId,
    operation.payload,
    operation.mutationId
  );
}

async function enqueueUpdate(
  id: string,
  patch: DocumentPatch,
  baseVersion: number,
  mutationId: string
): Promise<void> {
  await documentQueue.enqueueUpdate(id, patch, baseVersion, mutationId);
}

async function enqueueDelete(
  id: string,
  baseVersion: number,
  mutationId: string
): Promise<void> {
  await documentQueue.enqueueDelete(id, baseVersion, mutationId);
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
  payload: CreateDocumentOp["payload"],
  mutationId: string
): Promise<Document> {
  const { data } = await http.post(
    "/documents",
    payload,
    { headers: { "Idempotency-Key": mutationId } }
  );

  return normalizeDocument(data?.document ?? data);
}

async function updateDocumentOnlineOnly(
  id: string,
  updates: DocumentPatch,
  baseVersion: number,
  mutationId: string
): Promise<Document> {
  return updateWithVersionRetry<Document>(baseVersion, async (version) => {
    const { data } = await http.put(`/documents/${id}`, {
      ...updates,
      ifVersion: version,
    }, { headers: { "Idempotency-Key": mutationId } });
    return normalizeDocument(data?.document ?? data);
  }, normalizeDocument);
}

async function deleteDocumentOnlineOnly(
  id: string,
  baseVersion: number,
  mutationId: string
): Promise<void> {
  await deleteWithVersionRetry<Document>(baseVersion, async (version) => {
    await http.delete(`/documents/${id}`, {
      headers: { "Idempotency-Key": mutationId, "If-Match": String(version) },
    });
  }, normalizeDocument);
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
    version: 1,
  };
  const mutationId = makeSyncMutationId("document-create");

  if (
    !hasCloudSession() ||
    isBrowserOffline()
  ) {
    await mergeDocumentIntoCache(localDocument);

    await enqueueCreate({
      kind: "create",
      tempId: localDocument.id,
      mutationId,
      payload,
      timestamp: Date.now(),
    });

    return localDocument;
  }

  try {
    const created =
      await createDocumentOnlineOnly(payload, mutationId);

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
      mutationId,
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
  const baseVersion = current?.version ?? 1;
  const mutationId = makeSyncMutationId("document-update");

  const optimistic = normalizeDocument({
    ...(current ?? {
      id,
      title: "Untitled document",
      content: "",
      isPinned: false,
      isFavorite: false,
      createdAt: nowIso(),
      version: baseVersion,
    }),
    ...normalizedUpdates,
    updatedAt: nowIso(),
    version: baseVersion + 1,
  });

  await mergeDocumentIntoCache(optimistic);

  if (
    !hasCloudSession() ||
    isBrowserOffline()
  ) {
    await enqueueUpdate(
      id,
      normalizedUpdates,
      baseVersion,
      mutationId
    );

    return optimistic;
  }

  try {
    const updated =
      await updateDocumentOnlineOnly(
        id,
        normalizedUpdates,
        baseVersion,
        mutationId
      );

    await mergeDocumentIntoCache(updated);

    return updated;
  } catch (error) {
    if (!isRecoverableOfflineError(error)) {
      throw error;
    }

    await enqueueUpdate(
      id,
      normalizedUpdates,
      baseVersion,
      mutationId
    );

    return optimistic;
  }
}

export async function deleteDocument(
  id: string
): Promise<void> {
  await ensureDocumentStorageReady();
  const existing = (await readDocumentsCache()).find((document) => document.id === id);
  const baseVersion = existing?.version ?? 1;
  const mutationId = makeSyncMutationId("document-delete");
  await removeDocumentFromCache(id);

  if (
    !hasCloudSession() ||
    isBrowserOffline()
  ) {
    await enqueueDelete(id, baseVersion, mutationId);
    return;
  }

  try {
    await deleteDocumentOnlineOnly(id, baseVersion, mutationId);
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return;
    }

    if (!isRecoverableOfflineError(error)) {
      throw error;
    }

    await enqueueDelete(id, baseVersion, mutationId);
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
            operation.payload,
            operation.mutationId
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
            operation.patch,
            operation.baseVersion,
            operation.mutationId
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
          operation.id,
          operation.baseVersion,
          operation.mutationId
        );
        await removeDocumentFromCache(
          operation.id
        );
      }
    } catch (error) {
      if ((error as any)?.response?.status === 404 && operation.kind === "update") {
        await removeDocumentFromCache(operation.id);
        continue;
      }
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

export async function applyDocumentCloudChange(
  id: string,
  document: Document | null
): Promise<void> {
  await ensureDocumentStorageReady();
  if (document) await mergeDocumentIntoCache(normalizeDocument(document));
  else await removeDocumentFromCache(id);
}

