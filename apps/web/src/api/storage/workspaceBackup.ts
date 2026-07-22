import { getAll, openDatabase } from "./database";
import {
  DATABASE_VERSION,
  WORKSPACE_BACKUP_STORES,
  WorkspaceBackupStoreName,
} from "./schema";

export interface StoredWorkspaceSnapshot {
  schemaVersion: 1;
  databaseVersion: number;
  stores: Record<WorkspaceBackupStoreName, unknown[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isStoredWorkspaceSnapshot(value: unknown): value is StoredWorkspaceSnapshot {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (typeof value.databaseVersion !== "number" || !isRecord(value.stores)) {
    return false;
  }
  const stores = value.stores;
  return WORKSPACE_BACKUP_STORES.every((storeName) =>
    Array.isArray(stores[storeName])
  );
}

export async function exportStoredWorkspaceSnapshot(): Promise<StoredWorkspaceSnapshot> {
  const entries = await Promise.all(
    WORKSPACE_BACKUP_STORES.map(async (storeName) => [
      storeName,
      await getAll<unknown>(storeName),
    ] as const)
  );
  return {
    schemaVersion: 1,
    databaseVersion: DATABASE_VERSION,
    stores: Object.fromEntries(entries) as StoredWorkspaceSnapshot["stores"],
  };
}

export async function importStoredWorkspaceSnapshot(snapshot: StoredWorkspaceSnapshot): Promise<void> {
  if (!isStoredWorkspaceSnapshot(snapshot)) {
    throw new Error("The backup contains an invalid local data snapshot.");
  }
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([...WORKSPACE_BACKUP_STORES], "readwrite");
    for (const storeName of WORKSPACE_BACKUP_STORES) {
      const store = transaction.objectStore(storeName);
      store.clear();
      for (const value of snapshot.stores[storeName]) store.put(value);
    }
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Unable to restore the local workspace backup."));
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
  });
}
