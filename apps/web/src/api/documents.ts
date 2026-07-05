// apps/web/src/api/documents.ts
import { http } from "./http";
import { hasCloudSession } from "./session";

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

const DOCUMENTS_CACHE_KEY = "pioneer.documents.cache.v2";
const DOCUMENTS_QUEUE_KEY = "pioneer.documents.queue.v2";

const LEGACY_CACHE_KEY = "pioneer.documents.cache.v1";
const LEGACY_QUEUE_KEY = "pioneer.documents.queue.v1";

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

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function hasStorage(): boolean {
  return hasWindow() && !!window.localStorage;
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

function isProbablyOfflineError(err: any): boolean {
  if (!hasWindow()) {
    return false;
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }

  if (!err || typeof err !== "object") {
    return false;
  }

  const status = err?.response?.status;

  /*
   * 401/403 are treated as local-mode-safe failures because a stale or
   * disconnected cloud session must never block local documents.
   *
   * 500–504 cover Render sleeping/unavailable states.
   */
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

  if (err.isAxiosError && !err.response) {
    return true;
  }

  if (
    typeof err.code === "string" &&
    (err.code === "ERR_NETWORK" || err.code === "ECONNABORTED")
  ) {
    return true;
  }

  if (typeof err.message === "string") {
    const message = err.message.toLowerCase();

    return (
      message.includes("network") ||
      message.includes("failed to fetch") ||
      message.includes("timeout") ||
      message.includes("service unavailable")
    );
  }

  return false;
}

// ---------- Local cache ----------

function readDocumentsCache(): Document[] {
  if (!hasStorage()) {
    return [];
  }

  try {
    const current = window.localStorage.getItem(DOCUMENTS_CACHE_KEY);
    const legacy = window.localStorage.getItem(LEGACY_CACHE_KEY);
    const raw = current || legacy;

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const documents = sortDocuments(parsed.map(normalizeDocument));

    if (!current && legacy) {
      writeDocumentsCache(documents);
    }

    return documents;
  } catch {
    return [];
  }
}

function writeDocumentsCache(documents: Document[]): void {
  if (!hasStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(
      DOCUMENTS_CACHE_KEY,
      JSON.stringify(sortDocuments(documents))
    );
  } catch {
    // Local storage quota/private-mode failures are non-fatal.
  }
}

function mergeDocumentIntoCache(document: Document): void {
  const normalized = normalizeDocument(document);
  const documents = readDocumentsCache();

  const index = documents.findIndex((entry) => entry.id === normalized.id);

  if (index === -1) {
    documents.unshift(normalized);
  } else {
    documents[index] = {
      ...documents[index],
      ...normalized,
    };
  }

  writeDocumentsCache(documents);
}

function removeDocumentFromCache(id: string): void {
  writeDocumentsCache(readDocumentsCache().filter((doc) => doc.id !== id));
}

export function getCachedDocuments(): Document[] {
  return readDocumentsCache();
}

// ---------- Sync queue ----------

function readQueue(): DocumentOp[] {
  if (!hasStorage()) {
    return [];
  }

  try {
    const current = window.localStorage.getItem(DOCUMENTS_QUEUE_KEY);
    const legacy = window.localStorage.getItem(LEGACY_QUEUE_KEY);
    const raw = current || legacy;

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const queue = parsed.filter((op) => {
      return (
        op &&
        typeof op === "object" &&
        (op.kind === "create" || op.kind === "update" || op.kind === "delete")
      );
    }) as DocumentOp[];

    if (!current && legacy) {
      writeQueue(queue);
    }

    return queue;
  } catch {
    return [];
  }
}

function writeQueue(queue: DocumentOp[]): void {
  if (!hasStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(DOCUMENTS_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Local storage failures are non-fatal.
  }
}

export function getPendingDocumentSyncCount(): number {
  return readQueue().length;
}

export function hasPendingDocumentSync(id?: string): boolean {
  const queue = readQueue();

  if (!id) {
    return queue.length > 0;
  }

  return queue.some((operation) => {
    if (operation.kind === "create") {
      return operation.tempId === id;
    }

    return operation.id === id;
  });
}

function enqueueCreate(operation: CreateDocumentOp): void {
  const queue = readQueue();

  queue.push(operation);
  writeQueue(queue);
}

function enqueueUpdate(id: string, patch: DocumentPatch): void {
  const queue = readQueue();

  const createIndex = queue.findIndex(
    (operation) => operation.kind === "create" && operation.tempId === id
  );

  /*
   * Documents created only on this device do not need a separate update
   * operation. Keep the queued create payload current instead.
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

    writeQueue(queue);
    return;
  }

  if (queue.some((operation) => operation.kind === "delete" && operation.id === id)) {
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

  writeQueue(queue);
}

function enqueueDelete(id: string): void {
  const queue = readQueue().filter((operation) => {
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

  if (!isOfflineId(id)) {
    queue.push({
      kind: "delete",
      id,
      timestamp: Date.now(),
    });
  }

  writeQueue(queue);
}

// ---------- Cloud-only API ----------

async function fetchDocumentsOnlineOnly(): Promise<Document[]> {
  const { data } = await http.get("/documents");

  let rawDocuments: any[] = [];

  if (Array.isArray(data)) {
    rawDocuments = data;
  } else if (data && Array.isArray(data.documents)) {
    rawDocuments = data.documents;
  }

  return sortDocuments(rawDocuments.map(normalizeDocument));
}

async function createDocumentOnlineOnly(
  title: string,
  content: string
): Promise<Document> {
  /*
   * The current backend creates blank documents even if content is included
   * in POST. Follow with PUT so a synced local document keeps its content.
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
  if (!hasCloudSession() || (hasWindow() && navigator.onLine === false)) {
    return readDocumentsCache();
  }

  try {
    const remote = await fetchDocumentsOnlineOnly();
    const local = readDocumentsCache();
    const queue = readQueue();

    const pendingUpdates = new Set(
      queue
        .filter((operation): operation is UpdateDocumentOp => {
          return operation.kind === "update";
        })
        .map((operation) => operation.id)
    );

    const pendingDeletes = new Set(
      queue
        .filter((operation): operation is DeleteDocumentOp => {
          return operation.kind === "delete";
        })
        .map((operation) => operation.id)
    );

    const merged = new Map<string, Document>();

    for (const document of remote) {
      if (!pendingDeletes.has(document.id)) {
        merged.set(document.id, document);
      }
    }

    /*
     * Preserve unsynced local changes over a cloud response. This avoids a
     * stale cloud fetch overwriting edits made while disconnected.
     */
    for (const localDocument of local) {
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

    writeDocumentsCache(documents);
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
    mergeDocumentIntoCache(localDocument);

    enqueueCreate({
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

    mergeDocumentIntoCache(created);
    return created;
  } catch (error) {
    if (!isProbablyOfflineError(error)) {
      throw error;
    }

    mergeDocumentIntoCache(localDocument);

    enqueueCreate({
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
  const current = readDocumentsCache().find((document) => document.id === id);

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

  // Always save locally before attempting cloud work.
  mergeDocumentIntoCache(optimistic);

  if (!hasCloudSession() || (hasWindow() && navigator.onLine === false)) {
    enqueueUpdate(id, updates);
    return optimistic;
  }

  try {
    const updated = await updateDocumentOnlineOnly(id, updates);

    mergeDocumentIntoCache(updated);
    return updated;
  } catch (error) {
    if (!isProbablyOfflineError(error)) {
      throw error;
    }

    enqueueUpdate(id, updates);
    return optimistic;
  }
}

export async function deleteDocument(id: string): Promise<void> {
  removeDocumentFromCache(id);

  if (!hasCloudSession() || (hasWindow() && navigator.onLine === false)) {
    enqueueDelete(id);
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

    enqueueDelete(id);
  }
}

// ---------- Queue sync ----------

export async function syncOfflineDocumentQueue(): Promise<void> {
  if (!hasWindow() || !hasCloudSession() || navigator.onLine === false) {
    return;
  }

  const queue = readQueue();

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

        const cached = readDocumentsCache();
        const cachedIndex = cached.findIndex(
          (document) => document.id === operation.tempId
        );

        if (cachedIndex !== -1) {
          cached[cachedIndex] = created;
          writeDocumentsCache(cached);
        } else {
          mergeDocumentIntoCache(created);
        }

        /*
         * Remap later operations in this same queue after the cloud assigns
         * a real document ID.
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

        mergeDocumentIntoCache(updated);
        continue;
      }

      if (operation.kind === "delete") {
        if (isOfflineId(operation.id)) {
          removeDocumentFromCache(operation.id);
          continue;
        }

        await deleteDocumentOnlineOnly(operation.id);
        removeDocumentFromCache(operation.id);
      }
    } catch (error) {
      if (isProbablyOfflineError(error)) {
        remaining.push(operation, ...queue.slice(index + 1));
        writeQueue(remaining);
        return;
      }

      console.error("[Document sync] operation failed:", operation, error);
      remaining.push(operation);
    }
  }

  writeQueue(remaining);

  try {
    await fetchDocuments();
  } catch {
    // Local cache remains usable until a later successful sync.
  }
}

export async function trySyncDocumentsIfOnline(): Promise<void> {
  if (!hasWindow() || !hasCloudSession() || !navigator.onLine) {
    return;
  }

  await syncOfflineDocumentQueue();
}
