// apps/web/src/api/documents.ts
import { http } from "./http";
import { hasCloudSession } from "./session";
import { SYNC_STATE_EVENT } from "./tasks";
import {
  migrateLegacyLocalStorage,
  readStoredDocumentQueue,
  readStoredDocuments,
  writeStoredDocumentQueue,
  writeStoredDocuments,
} from "./storage";

export interface Document {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentPatch {
  title?: string;
  content?: string;
}

interface CreateDocumentOp {
  kind: "create";
  tempId: string;
  payload: {
    title: string;
    content: string;
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
let cachedDocuments: Document[] = [];
let pendingDocumentSyncCount = 0;

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function notifySyncStateChanged(): void {
  if (hasWindow()) {
    window.dispatchEvent(new Event(SYNC_STATE_EVENT));
  }
}

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

function normalizeDocument(raw: any): Document {
  const now = nowIso();

  return {
    id: String(raw?.id ?? makeOfflineId()),
    title: String(raw?.title ?? "Untitled document"),
    content: String(raw?.content ?? ""),
    createdAt: raw?.createdAt ? String(raw.createdAt) : now,
    updatedAt: raw?.updatedAt ? String(raw.updatedAt) : now,
  };
}

function sortDocuments(documents: Document[]): Document[] {
  return [...documents].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt).getTime();

    return bTime - aTime;
  });
}

async function ensureDocumentStorageReady(): Promise<void> {
  if (!storageInitialization) {
    storageInitialization = (async () => {
      await migrateLegacyLocalStorage();

      const storedDocuments = await readStoredDocuments<Document>();
      cachedDocuments = sortDocuments(storedDocuments.map(normalizeDocument));

      await refreshPendingDocumentSyncCount();
    })();
  }

  await storageInitialization;
}

function isProbablyOfflineError(error: any): boolean {
  if (!hasWindow()) {
    return false;
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }

  if (!error || typeof error !== "object") {
    return false;
  }

  const status = error?.response?.status;

  if (typeof status === "number") {
    return (
      status === 401 ||
      status === 403 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504
    );
  }

  if (error.isAxiosError && !error.response) {
    return true;
  }

  if (
    typeof error.code === "string" &&
    (error.code === "ERR_NETWORK" || error.code === "ECONNABORTED")
  ) {
    return true;
  }

  if (typeof error.message === "string") {
    const message = error.message.toLowerCase();

    return (
      message.includes("network") ||
      message.includes("failed to fetch") ||
      message.includes("timeout") ||
      message.includes("service unavailable")
    );
  }

  return false;
}

// ---------- IndexedDB cache ----------

async function readDocumentsCache(): Promise<Document[]> {
  await ensureDocumentStorageReady();

  const storedDocuments = await readStoredDocuments<Document>();
  cachedDocuments = sortDocuments(storedDocuments.map(normalizeDocument));

  return [...cachedDocuments];
}

async function writeDocumentsCache(documents: Document[]): Promise<void> {
  const normalized = sortDocuments(documents.map(normalizeDocument));

  await writeStoredDocuments(normalized);

  cachedDocuments = normalized;
}

async function mergeDocumentIntoCache(document: Document): Promise<void> {
  const normalized = normalizeDocument(document);
  const documents = await readDocumentsCache();

  const index = documents.findIndex((entry) => entry.id === normalized.id);

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

async function removeDocumentFromCache(id: string): Promise<void> {
  const documents = await readDocumentsCache();

  await writeDocumentsCache(
    documents.filter((document) => document.id !== id)
  );
}

/*
 * Kept synchronous for compatibility with existing UI code.
 * It returns the in-memory IndexedDB cache after initialization.
 */
export function getCachedDocuments(): Document[] {
  return [...cachedDocuments];
}

// ---------- IndexedDB queue ----------

async function readQueue(): Promise<DocumentOp[]> {
  await ensureDocumentStorageReady();

  const queue = await readStoredDocumentQueue<DocumentOp>();

  return queue.filter((operation) => {
    return (
      operation &&
      typeof operation === "object" &&
      (operation.kind === "create" ||
        operation.kind === "update" ||
        operation.kind === "delete")
    );
  });
}

async function writeQueue(queue: DocumentOp[]): Promise<void> {
  await writeStoredDocumentQueue(queue);

  pendingDocumentSyncCount = queue.length;
  notifySyncStateChanged();
}

export function getPendingDocumentSyncCount(): number {
  return pendingDocumentSyncCount;
}

export async function refreshPendingDocumentSyncCount(): Promise<number> {
  const queue = await readStoredDocumentQueue<DocumentOp>();

  pendingDocumentSyncCount = queue.length;

  return pendingDocumentSyncCount;
}

export function hasPendingDocumentSync(id?: string): boolean {
  if (!id) {
    return pendingDocumentSyncCount > 0;
  }

  return false;
}

async function enqueueCreate(operation: CreateDocumentOp): Promise<void> {
  const queue = await readQueue();

  queue.push(operation);

  await writeQueue(queue);
}

async function enqueueUpdate(
  id: string,
  patch: DocumentPatch
): Promise<void> {
  const queue = await readQueue();

  const createIndex = queue.findIndex(
    (operation) => operation.kind === "create" && operation.tempId === id
  );

  /*
   * For a document that has never reached the cloud, keep the original
   * queued create request current instead of adding a separate update.
   */
  if (createIndex !== -1) {
    const create = queue[createIndex] as CreateDocumentOp;

    queue[createIndex] = {
      ...create,
      payload: {
        ...create.payload,
        ...patch,
      },
      timestamp: Date.now(),
    };

    await writeQueue(queue);
    return;
  }

  if (
    queue.some(
      (operation) => operation.kind === "delete" && operation.id === id
    )
  ) {
    return;
  }

  const updateIndex = queue.findIndex(
    (operation) => operation.kind === "update" && operation.id === id
  );

  if (updateIndex !== -1) {
    const previous = queue[updateIndex] as UpdateDocumentOp;

    queue[updateIndex] = {
      ...previous,
      patch: {
        ...previous.patch,
        ...patch,
      },
      timestamp: Date.now(),
    };
  } else {
    queue.push({
      kind: "update",
      id,
      patch,
      timestamp: Date.now(),
    });
  }

  await writeQueue(queue);
}

async function enqueueDelete(id: string): Promise<void> {
  const queue = (await readQueue()).filter((operation) => {
    if (operation.kind === "create" && operation.tempId === id) {
      return false;
    }

    if (operation.kind === "update" && operation.id === id) {
      return false;
    }

    if (operation.kind === "delete" && operation.id === id) {
      return false;
    }

    return true;
  });

  /*
   * A document created only on this device never existed remotely,
   * so deleting it does not need a cloud queue entry.
   */
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

  return sortDocuments(rawDocuments.map(normalizeDocument));
}

async function createDocumentOnlineOnly(
  title: string,
  content: string
): Promise<Document> {
  /*
   * Current backend POST creates an empty document, even if content is sent.
   * Follow up with PUT so the synced document receives its initial content.
   */
  const { data } = await http.post("/documents", { title });

  let created = normalizeDocument(data?.document ?? data);

  if (content) {
    created = await updateDocumentOnlineOnly(created.id, {
      title,
      content,
    });
  }

  return created;
}

async function updateDocumentOnlineOnly(
  id: string,
  updates: DocumentPatch
): Promise<Document> {
  const { data } = await http.put(`/documents/${id}`, updates);

  return normalizeDocument(data?.document ?? data);
}

async function deleteDocumentOnlineOnly(id: string): Promise<void> {
  await http.delete(`/documents/${id}`);
}

// ---------- Public API ----------

export async function fetchDocuments(): Promise<Document[]> {
  await ensureDocumentStorageReady();

  if (!hasCloudSession() || (hasWindow() && navigator.onLine === false)) {
    return readDocumentsCache();
  }

  try {
    const remoteDocuments = await fetchDocumentsOnlineOnly();
    const localDocuments = await readDocumentsCache();
    const queue = await readQueue();

    const pendingUpdates = new Set(
      queue
        .filter(
          (operation): operation is UpdateDocumentOp =>
            operation.kind === "update"
        )
        .map((operation) => operation.id)
    );

    const pendingDeletes = new Set(
      queue
        .filter(
          (operation): operation is DeleteDocumentOp =>
            operation.kind === "delete"
        )
        .map((operation) => operation.id)
    );

    const merged = new Map<string, Document>();

    for (const document of remoteDocuments) {
      if (!pendingDeletes.has(document.id)) {
        merged.set(document.id, document);
      }
    }

    /*
     * Keep local queued changes over remote records so a stale cloud response
     * cannot overwrite offline work.
     */
    for (const localDocument of localDocuments) {
      if (
        isOfflineId(localDocument.id) ||
        pendingUpdates.has(localDocument.id) ||
        pendingDeletes.has(localDocument.id)
      ) {
        if (!pendingDeletes.has(localDocument.id)) {
          merged.set(localDocument.id, localDocument);
        }
      }
    }

    const documents = sortDocuments([...merged.values()]);

    await writeDocumentsCache(documents);

    return documents;
  } catch (error) {
    if (isProbablyOfflineError(error)) {
      return readDocumentsCache();
    }

    throw error;
  }
}

export async function createDocument(
  title: string,
  content: string = ""
): Promise<Document> {
  await ensureDocumentStorageReady();

  const finalTitle = title.trim() || "Untitled document";
  const finalContent = content || "";

  const localDocument: Document = {
    id: makeOfflineId(),
    title: finalTitle,
    content: finalContent,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  if (!hasCloudSession() || (hasWindow() && navigator.onLine === false)) {
    await mergeDocumentIntoCache(localDocument);

    await enqueueCreate({
      kind: "create",
      tempId: localDocument.id,
      payload: {
        title: finalTitle,
        content: finalContent,
      },
      timestamp: Date.now(),
    });

    return localDocument;
  }

  try {
    const created = await createDocumentOnlineOnly(finalTitle, finalContent);

    await mergeDocumentIntoCache(created);

    return created;
  } catch (error) {
    if (!isProbablyOfflineError(error)) {
      throw error;
    }

    await mergeDocumentIntoCache(localDocument);

    await enqueueCreate({
      kind: "create",
      tempId: localDocument.id,
      payload: {
        title: finalTitle,
        content: finalContent,
      },
      timestamp: Date.now(),
    });

    return localDocument;
  }
}

export async function updateDocument(
  id: string,
  updates: DocumentPatch
): Promise<Document> {
  await ensureDocumentStorageReady();

  const current = (await readDocumentsCache()).find(
    (document) => document.id === id
  );

  const optimistic = normalizeDocument({
    ...(current ?? {
      id,
      title: "Untitled document",
      content: "",
      createdAt: nowIso(),
    }),
    ...updates,
    updatedAt: nowIso(),
  });

  await mergeDocumentIntoCache(optimistic);

  if (!hasCloudSession() || (hasWindow() && navigator.onLine === false)) {
    await enqueueUpdate(id, updates);

    return optimistic;
  }

  try {
    const updated = await updateDocumentOnlineOnly(id, updates);

    await mergeDocumentIntoCache(updated);

    return updated;
  } catch (error) {
    if (!isProbablyOfflineError(error)) {
      throw error;
    }

    await enqueueUpdate(id, updates);

    return optimistic;
  }
}

export async function deleteDocument(id: string): Promise<void> {
  await ensureDocumentStorageReady();
  await removeDocumentFromCache(id);

  if (!hasCloudSession() || (hasWindow() && navigator.onLine === false)) {
    await enqueueDelete(id);
    return;
  }

  try {
    await deleteDocumentOnlineOnly(id);
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return;
    }

    if (!isProbablyOfflineError(error)) {
      throw error;
    }

    await enqueueDelete(id);
  }
}

// ---------- Queue sync ----------

export async function syncOfflineDocumentQueue(): Promise<void> {
  await ensureDocumentStorageReady();

  if (!hasWindow() || !hasCloudSession() || navigator.onLine === false) {
    return;
  }

  const queue = await readQueue();

  if (queue.length === 0) {
    return;
  }

  const remaining: DocumentOp[] = [];

  for (let index = 0; index < queue.length; index += 1) {
    const operation = queue[index];

    try {
      if (operation.kind === "create") {
        const created = await createDocumentOnlineOnly(
          operation.payload.title,
          operation.payload.content
        );

        const cached = await readDocumentsCache();
        const cachedIndex = cached.findIndex(
          (document) => document.id === operation.tempId
        );

        if (cachedIndex !== -1) {
          cached[cachedIndex] = created;
          await writeDocumentsCache(cached);
        } else {
          await mergeDocumentIntoCache(created);
        }

        /*
         * Remap queued follow-up actions after the cloud assigns a real ID.
         */
        for (
          let laterIndex = index + 1;
          laterIndex < queue.length;
          laterIndex += 1
        ) {
          const later = queue[laterIndex];

          if (later.kind === "update" && later.id === operation.tempId) {
            later.id = created.id;
          }

          if (later.kind === "delete" && later.id === operation.tempId) {
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

        const updated = await updateDocumentOnlineOnly(
          operation.id,
          operation.patch
        );

        await mergeDocumentIntoCache(updated);

        continue;
      }

      if (operation.kind === "delete") {
        if (isOfflineId(operation.id)) {
          await removeDocumentFromCache(operation.id);
          continue;
        }

        await deleteDocumentOnlineOnly(operation.id);
        await removeDocumentFromCache(operation.id);
      }
    } catch (error) {
      if (isProbablyOfflineError(error)) {
        remaining.push(operation, ...queue.slice(index + 1));
        await writeQueue(remaining);
        return;
      }

      console.error("[Document sync] operation failed:", operation, error);
      remaining.push(operation);
    }
  }

  await writeQueue(remaining);

  try {
    await fetchDocuments();
  } catch {
    // Local IndexedDB data remains usable until a later successful sync.
  }
}

export async function trySyncDocumentsIfOnline(): Promise<void> {
  await ensureDocumentStorageReady();

  if (!hasWindow() || !hasCloudSession() || !navigator.onLine) {
    return;
  }

  await syncOfflineDocumentQueue();
}