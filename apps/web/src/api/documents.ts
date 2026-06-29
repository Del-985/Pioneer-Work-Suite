// apps/web/src/api/documents.ts
import { http } from "./http";

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
  if (!hasWindow()) return false;

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }

  if (!err || typeof err !== "object") {
    return false;
  }

  const status = err?.response?.status;

  // Treat sleeping/unavailable backend responses as offline-capable mode.
  if (typeof status === "number") {
    return status === 500 || status === 502 || status === 503 || status === 504;
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
  if (!hasStorage()) return [];

  try {
    const current = window.localStorage.getItem(DOCUMENTS_CACHE_KEY);
    const legacy = window.localStorage.getItem(LEGACY_CACHE_KEY);
    const raw = current || legacy;

    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const documents = sortDocuments(parsed.map(normalizeDocument));

    // One-time migration from the older cache key.
    if (!current && legacy) {
      writeDocumentsCache(documents);
    }

    return documents;
  } catch {
    return [];
  }
}

function writeDocumentsCache(documents: Document[]): void {
  if (!hasStorage()) return;

  try {
    window.localStorage.setItem(
      DOCUMENTS_CACHE_KEY,
      JSON.stringify(sortDocuments(documents))
    );
  } catch {
    // Ignore quota/private-mode failures.
  }
}

function mergeDocumentIntoCache(doc: Document): void {
  const normalized = normalizeDocument(doc);
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
  if (!hasStorage()) return [];

  try {
    const current = window.localStorage.getItem(DOCUMENTS_QUEUE_KEY);
    const legacy = window.localStorage.getItem(LEGACY_QUEUE_KEY);
    const raw = current || legacy;

    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

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
  if (!hasStorage()) return;

  try {
    window.localStorage.setItem(DOCUMENTS_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Ignore local storage failures.
  }
}

export function getPendingDocumentSyncCount(): number {
  return readQueue().length;
}

export function hasPendingDocumentSync(id?: string): boolean {
  const queue = readQueue();

  if (!id) return queue.length > 0;

  return queue.some((op) => {
    if (op.kind === "create") return op.tempId === id;
    return op.id === id;
  });
}

function enqueueCreate(op: CreateDocumentOp): void {
  const queue = readQueue();
  queue.push(op);
  writeQueue(queue);
}

function enqueueUpdate(id: string, patch: DocumentPatch): void {
  const queue = readQueue();

  // Update an offline-created document by modifying its queued create payload.
  const createIndex = queue.findIndex(
    (op) => op.kind === "create" && op.tempId === id
  );

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

  // No need to update something already queued for deletion.
  if (queue.some((op) => op.kind === "delete" && op.id === id)) {
    return;
  }

  // Collapse repeated edits into one pending update.
  const updateIndex = queue.findIndex(
    (op) => op.kind === "update" && op.id === id
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
  const queue = readQueue();

  const cleanedQueue = queue.filter((op) => {
    if (op.kind === "create" && op.tempId === id) return false;
    if (op.kind === "update" && op.id === id) return false;
    if (op.kind === "delete" && op.id === id) return false;
    return true;
  });

  // Offline-only document never existed server-side, so no delete needs syncing.
  if (!isOfflineId(id)) {
    cleanedQueue.push({
      kind: "delete",
      id,
      timestamp: Date.now(),
    });
  }

  writeQueue(cleanedQueue);
}

// ---------- Online-only API ----------

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
  // Current backend creates documents with empty content, even if content is sent.
  const { data } = await http.post("/documents", { title });

  let created = normalizeDocument(data?.document ?? data);

  // Immediately follow with PUT so content survives a sync/create.
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
  if (hasWindow() && navigator.onLine === false) {
    return readDocumentsCache();
  }

  try {
    const remote = await fetchDocumentsOnlineOnly();
    const local = readDocumentsCache();
    const queue = readQueue();

    const pendingUpdates = new Set(
      queue
        .filter((op): op is UpdateDocumentOp => op.kind === "update")
        .map((op) => op.id)
    );

    const pendingDeletes = new Set(
      queue
        .filter((op): op is DeleteDocumentOp => op.kind === "delete")
        .map((op) => op.id)
    );

    const merged = new Map<string, Document>();

    for (const doc of remote) {
      if (!pendingDeletes.has(doc.id)) {
        merged.set(doc.id, doc);
      }
    }

    // Preserve unsynced edits and offline-created docs over remote responses.
    for (const localDoc of local) {
      if (
        isOfflineId(localDoc.id) ||
        pendingUpdates.has(localDoc.id) ||
        pendingDeletes.has(localDoc.id)
      ) {
        if (!pendingDeletes.has(localDoc.id)) {
          merged.set(localDoc.id, localDoc);
        }
      }
    }

    const documents = sortDocuments([...merged.values()]);
    writeDocumentsCache(documents);
    return documents;
  } catch (err) {
    if (isProbablyOfflineError(err)) {
      return readDocumentsCache();
    }

    throw err;
  }
}

export async function createDocument(
  title: string,
  content: string = ""
): Promise<Document> {
  const finalTitle = title.trim() || "Untitled document";
  const finalContent = content || "";

  if (hasWindow() && navigator.onLine === false) {
    const localDocument: Document = {
      id: makeOfflineId(),
      title: finalTitle,
      content: finalContent,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

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
  } catch (err) {
    if (!isProbablyOfflineError(err)) {
      throw err;
    }

    const localDocument: Document = {
      id: makeOfflineId(),
      title: finalTitle,
      content: finalContent,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

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
  const current = readDocumentsCache().find((doc) => doc.id === id);

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

  // Local save happens immediately, before backend work begins.
  mergeDocumentIntoCache(optimistic);

  if (hasWindow() && navigator.onLine === false) {
    enqueueUpdate(id, updates);
    return optimistic;
  }

  try {
    const updated = await updateDocumentOnlineOnly(id, updates);
    mergeDocumentIntoCache(updated);
    return updated;
  } catch (err) {
    if (!isProbablyOfflineError(err)) {
      throw err;
    }

    enqueueUpdate(id, updates);
    return optimistic;
  }
}

export async function deleteDocument(id: string): Promise<void> {
  removeDocumentFromCache(id);

  if (hasWindow() && navigator.onLine === false) {
    enqueueDelete(id);
    return;
  }

  try {
    await deleteDocumentOnlineOnly(id);
  } catch (err: any) {
    // Already absent remotely; local removal remains correct.
    if (err?.response?.status === 404) {
      return;
    }

    if (!isProbablyOfflineError(err)) {
      throw err;
    }

    enqueueDelete(id);
  }
}

// ---------- Queue sync ----------

export async function syncOfflineDocumentQueue(): Promise<void> {
  if (!hasWindow() || navigator.onLine === false) return;

  const queue = readQueue();
  if (queue.length === 0) return;

  const remaining: DocumentOp[] = [];

  for (let index = 0; index < queue.length; index++) {
    const op = queue[index];

    try {
      if (op.kind === "create") {
        const created = await createDocumentOnlineOnly(
          op.payload.title,
          op.payload.content
        );

        const cached = readDocumentsCache();
        const cachedIndex = cached.findIndex((doc) => doc.id === op.tempId);

        if (cachedIndex !== -1) {
          cached[cachedIndex] = created;
          writeDocumentsCache(cached);
        } else {
          mergeDocumentIntoCache(created);
        }

        // Remap later pending operations if needed.
        for (let laterIndex = index + 1; laterIndex < queue.length; laterIndex++) {
          const later = queue[laterIndex];

          if (later.kind === "update" && later.id === op.tempId) {
            later.id = created.id;
          }

          if (later.kind === "delete" && later.id === op.tempId) {
            later.id = created.id;
          }
        }

        continue;
      }

      if (op.kind === "update") {
        if (isOfflineId(op.id)) {
          remaining.push(op);
          continue;
        }

        const updated = await updateDocumentOnlineOnly(op.id, op.patch);
        mergeDocumentIntoCache(updated);
        continue;
      }

      if (op.kind === "delete") {
        if (isOfflineId(op.id)) {
          removeDocumentFromCache(op.id);
          continue;
        }

        await deleteDocumentOnlineOnly(op.id);
        removeDocumentFromCache(op.id);
      }
    } catch (err) {
      if (isProbablyOfflineError(err)) {
        // Backend still unavailable. Preserve this operation and all later work.
        remaining.push(op, ...queue.slice(index + 1));
        writeQueue(remaining);
        return;
      }

      // Keep a failed non-network operation so no user work disappears.
      console.error("[Document sync] operation failed:", op, err);
      remaining.push(op);
    }
  }

  writeQueue(remaining);

  try {
    await fetchDocuments();
  } catch {
    // Local cache is still the source of truth until next successful sync.
  }
}

export async function trySyncDocumentsIfOnline(): Promise<void> {
  if (!hasWindow() || !navigator.onLine) return;
  await syncOfflineDocumentQueue();
}
