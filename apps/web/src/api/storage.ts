// apps/web/src/api/storage.ts

const DATABASE_NAME = "pioneer-work-suite";
const DATABASE_VERSION = 2;

const TASKS_STORE = "tasks";
const TASK_QUEUE_STORE = "taskQueue";

const DOCUMENTS_STORE = "documents";
const DOCUMENT_QUEUE_STORE = "documentQueue";

const EVENTS_STORE = "events";
const EVENT_QUEUE_STORE = "eventQueue";

const META_STORE = "meta";

const LEGACY_TASKS_CACHE_KEY = "pioneer.tasks.cache.v1";
const LEGACY_TASKS_QUEUE_KEY = "pioneer.tasks.queue.v1";

const LEGACY_DOCUMENTS_CACHE_KEY = "pioneer.documents.cache.v2";
const LEGACY_DOCUMENTS_QUEUE_KEY = "pioneer.documents.queue.v2";

const LEGACY_DOCUMENTS_CACHE_KEY_V1 = "pioneer.documents.cache.v1";
const LEGACY_DOCUMENTS_QUEUE_KEY_V1 = "pioneer.documents.queue.v1";

const MIGRATION_FLAG_KEY = "localStorageMigrationComplete";

type StoreName =
  | typeof TASKS_STORE
  | typeof TASK_QUEUE_STORE
  | typeof DOCUMENTS_STORE
  | typeof DOCUMENT_QUEUE_STORE
  | typeof EVENTS_STORE
  | typeof EVENT_QUEUE_STORE
  | typeof META_STORE;

function hasIndexedDb(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("IndexedDB is unavailable in this environment."));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error("Unable to open Pioneer storage."));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(TASKS_STORE)) {
        database.createObjectStore(TASKS_STORE, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(TASK_QUEUE_STORE)) {
        database.createObjectStore(TASK_QUEUE_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
      }

      if (!database.objectStoreNames.contains(DOCUMENTS_STORE)) {
        database.createObjectStore(DOCUMENTS_STORE, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(DOCUMENT_QUEUE_STORE)) {
        database.createObjectStore(DOCUMENT_QUEUE_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
      }

      if (!database.objectStoreNames.contains(EVENTS_STORE)) {
        database.createObjectStore(EVENTS_STORE, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(EVENT_QUEUE_STORE)) {
        database.createObjectStore(EVENT_QUEUE_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
      }

      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
  });
}

async function runTransaction<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  const database = await openDatabase();

  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    let request: IDBRequest<T> | void;

    try {
      request = operation(store);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }

    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Storage transaction failed."));
    };

    transaction.oncomplete = () => {
      database.close();
      resolve(request ? request.result : undefined);
    };
  });
}

async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const database = await openDatabase();

  return new Promise<T[]>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error("Unable to read local data."));
    };

    request.onsuccess = () => {
      database.close();
      resolve(request.result as T[]);
    };
  });
}

async function replaceAll<T extends { id?: IDBValidKey }>(
  storeName: StoreName,
  values: T[]
): Promise<void> {
  const database = await openDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    store.clear();

    for (const value of values) {
      store.put(value);
    }

    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Unable to write local data."));
    };

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
  });
}

async function getMetaValue<T>(key: string): Promise<T | null> {
  const database = await openDatabase();

  return new Promise<T | null>((resolve, reject) => {
    const transaction = database.transaction(META_STORE, "readonly");
    const store = transaction.objectStore(META_STORE);
    const request = store.get(key);

    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error("Unable to read storage metadata."));
    };

    request.onsuccess = () => {
      database.close();

      const result = request.result as { key: string; value: T } | undefined;
      resolve(result?.value ?? null);
    };
  });
}

async function setMetaValue<T>(key: string, value: T): Promise<void> {
  await runTransaction(META_STORE, "readwrite", (store) =>
    store.put({ key, value })
  );
}

function readLegacyJson<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/*
 * One-time import from the old localStorage task/document system.
 *
 * Calendar events were previously cloud-only, so there is no legacy event
 * cache to import.
 */
export async function migrateLegacyLocalStorage(): Promise<void> {
  if (!hasIndexedDb()) {
    return;
  }

  const alreadyMigrated = await getMetaValue<boolean>(MIGRATION_FLAG_KEY);

  if (alreadyMigrated) {
    return;
  }

  const legacyTasks = readLegacyJson<unknown[]>(LEGACY_TASKS_CACHE_KEY) ?? [];
  const legacyTaskQueue =
    readLegacyJson<unknown[]>(LEGACY_TASKS_QUEUE_KEY) ?? [];

  const legacyDocuments =
    readLegacyJson<unknown[]>(LEGACY_DOCUMENTS_CACHE_KEY) ??
    readLegacyJson<unknown[]>(LEGACY_DOCUMENTS_CACHE_KEY_V1) ??
    [];

  const legacyDocumentQueue =
    readLegacyJson<unknown[]>(LEGACY_DOCUMENTS_QUEUE_KEY) ??
    readLegacyJson<unknown[]>(LEGACY_DOCUMENTS_QUEUE_KEY_V1) ??
    [];

  await replaceAll(
    TASKS_STORE,
    legacyTasks.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string"
    )
  );

  await replaceAll(
    DOCUMENTS_STORE,
    legacyDocuments.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string"
    )
  );

  await replaceAll(
    TASK_QUEUE_STORE,
    legacyTaskQueue.map((item, index) => ({
      id: index + 1,
      value: item,
    }))
  );

  await replaceAll(
    DOCUMENT_QUEUE_STORE,
    legacyDocumentQueue.map((item, index) => ({
      id: index + 1,
      value: item,
    }))
  );

  await setMetaValue(MIGRATION_FLAG_KEY, true);
}

/* Tasks */

export async function readStoredTasks<T>(): Promise<T[]> {
  return getAll<T>(TASKS_STORE);
}

export async function writeStoredTasks<T extends { id: string }>(
  tasks: T[]
): Promise<void> {
  await replaceAll(TASKS_STORE, tasks);
}

export async function readStoredTaskQueue<T>(): Promise<T[]> {
  const entries = await getAll<{ id: number; value: T }>(TASK_QUEUE_STORE);

  return entries
    .sort((a, b) => a.id - b.id)
    .map((entry) => entry.value);
}

export async function writeStoredTaskQueue<T>(queue: T[]): Promise<void> {
  await replaceAll(
    TASK_QUEUE_STORE,
    queue.map((value, index) => ({
      id: index + 1,
      value,
    }))
  );
}

/* Documents */

export async function readStoredDocuments<T>(): Promise<T[]> {
  return getAll<T>(DOCUMENTS_STORE);
}

export async function writeStoredDocuments<T extends { id: string }>(
  documents: T[]
): Promise<void> {
  await replaceAll(DOCUMENTS_STORE, documents);
}

export async function readStoredDocumentQueue<T>(): Promise<T[]> {
  const entries = await getAll<{ id: number; value: T }>(
    DOCUMENT_QUEUE_STORE
  );

  return entries
    .sort((a, b) => a.id - b.id)
    .map((entry) => entry.value);
}

export async function writeStoredDocumentQueue<T>(
  queue: T[]
): Promise<void> {
  await replaceAll(
    DOCUMENT_QUEUE_STORE,
    queue.map((value, index) => ({
      id: index + 1,
      value,
    }))
  );
}

/* Calendar events */

export async function readStoredEvents<T>(): Promise<T[]> {
  return getAll<T>(EVENTS_STORE);
}

export async function writeStoredEvents<T extends { id: string }>(
  events: T[]
): Promise<void> {
  await replaceAll(EVENTS_STORE, events);
}

export async function readStoredEventQueue<T>(): Promise<T[]> {
  const entries = await getAll<{ id: number; value: T }>(EVENT_QUEUE_STORE);

  return entries
    .sort((a, b) => a.id - b.id)
    .map((entry) => entry.value);
}

export async function writeStoredEventQueue<T>(queue: T[]): Promise<void> {
  await replaceAll(
    EVENT_QUEUE_STORE,
    queue.map((value, index) => ({
      id: index + 1,
      value,
    }))
  );
}

