import { developerLogger } from "../../developer/logger";
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  DOCUMENT_QUEUE_STORE,
  DOCUMENTS_STORE,
  EVENT_QUEUE_STORE,
  EVENTS_STORE,
  META_STORE,
  StoreName,
  TASK_QUEUE_STORE,
  TASKS_STORE,
} from "./schema";

export function hasIndexedDb(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      const error = new Error("IndexedDB is unavailable in this environment.");
      developerLogger.error("storage", error.message, error);
      reject(error);
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => {
      const error = request.error ?? new Error("Unable to open Pioneer storage.");
      developerLogger.error("storage", "Unable to open Pioneer storage", error);
      reject(error);
    };
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const storeName of [TASKS_STORE, DOCUMENTS_STORE, EVENTS_STORE]) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: "id" });
        }
      }
      for (const storeName of [
        TASK_QUEUE_STORE,
        DOCUMENT_QUEUE_STORE,
        EVENT_QUEUE_STORE,
      ]) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, {
            keyPath: "id",
            autoIncrement: true,
          });
        }
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
  });
}

export async function runTransaction<T>(
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
      developerLogger.error(
        "storage",
        `Storage operation failed in ${storeName}`,
        error
      );
      database.close();
      reject(error);
      return;
    }
    transaction.onerror = () => {
      developerLogger.error(
        "storage",
        `Storage transaction failed in ${storeName}`,
        transaction.error
      );
      database.close();
      reject(transaction.error ?? new Error("Storage transaction failed."));
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(request ? request.result : undefined);
    };
  });
}

export async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const database = await openDatabase();
  return new Promise<T[]>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();
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

export async function replaceAll<T extends { id?: IDBValidKey }>(
  storeName: StoreName,
  values: T[]
): Promise<void> {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    store.clear();
    for (const value of values) store.put(value);
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

export async function getMetaValue<T>(key: string): Promise<T | null> {
  const database = await openDatabase();
  return new Promise<T | null>((resolve, reject) => {
    const transaction = database.transaction(META_STORE, "readonly");
    const request = transaction.objectStore(META_STORE).get(key);
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

export async function setMetaValue<T>(key: string, value: T): Promise<void> {
  await runTransaction(META_STORE, "readwrite", (store) =>
    store.put({ key, value })
  );
}

export async function deleteMetaValue(key: string): Promise<void> {
  await runTransaction(META_STORE, "readwrite", (store) => store.delete(key));
}
