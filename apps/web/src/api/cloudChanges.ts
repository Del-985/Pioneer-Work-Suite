import { applyDocumentCloudChange, Document } from "./documents";
import { applyEventCloudChange, CalendarEvent } from "./events";
import { http } from "./http";
import { getCloudSessionKey } from "./session";
import {
  readStoredCloudSyncCursor,
  writeStoredCloudSyncCursor,
} from "./storage";
import { applyTaskCloudChange, Task } from "./tasks";

type CloudEntityType = "task" | "document" | "event";

interface CloudChange {
  cursor: string;
  entityType: CloudEntityType;
  entityId: string;
  operation: "upsert" | "delete";
  entity: Task | Document | CalendarEvent | null;
}

interface CloudChangePage {
  changes: CloudChange[];
  nextCursor: string;
  hasMore: boolean;
}

async function applyChange(change: CloudChange): Promise<void> {
  const entity = change.operation === "delete" ? null : change.entity;
  if (change.entityType === "task") {
    await applyTaskCloudChange(change.entityId, entity as Task | null);
  } else if (change.entityType === "document") {
    await applyDocumentCloudChange(change.entityId, entity as Document | null);
  } else if (change.entityType === "event") {
    await applyEventCloudChange(change.entityId, entity as CalendarEvent | null);
  }
}

export async function pullCloudChanges(): Promise<number> {
  const sessionKey = getCloudSessionKey();
  if (!sessionKey) throw new Error("A cloud session is required to synchronize changes.");
  let cursor = await readStoredCloudSyncCursor(sessionKey);
  let applied = 0;

  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const { data } = await http.get<CloudChangePage>("/sync/changes", {
      params: { cursor, limit: 250 },
    });
    const changes = Array.isArray(data?.changes) ? data.changes : [];

    for (const change of changes) {
      await applyChange(change);
      applied += 1;
    }

    const nextCursor = String(data?.nextCursor ?? cursor);
    if (!/^\d+$/.test(nextCursor)) {
      throw new Error("The cloud returned an invalid synchronization cursor.");
    }
    await writeStoredCloudSyncCursor(sessionKey, nextCursor);
    cursor = nextCursor;

    if (!data?.hasMore) return applied;
  }

  throw new Error("Cloud synchronization exceeded the page safety limit.");
}
