// apps/web/src/api/sync.ts

import {
  getPendingTaskSyncCount,
  refreshPendingTaskSyncCount,
  syncOfflineTaskQueue,
} from "./tasks";
import {
  getPendingDocumentSyncCount,
  refreshPendingDocumentSyncCount,
  syncOfflineDocumentQueue,
} from "./documents";
import {
  getPendingEventSyncCount,
  refreshPendingEventSyncCount,
  syncOfflineEventQueue,
} from "./events";
import {
  hasBrowserWindow,
  isBrowserOffline,
  SYNC_STATE_EVENT,
} from "./syncSupport";
import {
  CLOUD_AUTH_REQUIRED_EVENT,
  SESSION_CHANGED_EVENT,
  hasCloudSession,
  isCloudReconnectRequired,
} from "./session";
import {
  developerLogger,
} from "../developer/logger";

export type SyncPhase =
  | "local-only"
  | "offline"
  | "reconnect-required"
  | "idle"
  | "pending"
  | "syncing"
  | "error";

export interface SyncSnapshot {
  phase: SyncPhase;
  cloudConnected: boolean;
  online: boolean;
  pendingTasks: number;
  pendingDocuments: number;
  pendingEvents: number;
  pendingTotal: number;
  lastSuccessfulSyncAt: string | null;
  errorMessage: string | null;
}

type SyncListener = (snapshot: SyncSnapshot) => void;

const listeners = new Set<SyncListener>();

let isSyncing = false;
let syncPromise: Promise<SyncSnapshot> | null = null;
let lastSuccessfulSyncAt: string | null = null;
let errorMessage: string | null = null;


function isOnline(): boolean {
  return !isBrowserOffline();
}

function readCachedPendingCounts() {
  return {
    pendingTasks: getPendingTaskSyncCount(),
    pendingDocuments: getPendingDocumentSyncCount(),
    pendingEvents: getPendingEventSyncCount(),
  };
}

function derivePhase(
  pendingTotal: number,
  cloudConnected: boolean,
  online: boolean
): SyncPhase {
  if (isCloudReconnectRequired()) {
    return "reconnect-required";
  }

  if (!cloudConnected) {
    return "local-only";
  }

  if (!online) {
    return "offline";
  }

  if (isSyncing) {
    return "syncing";
  }

  if (errorMessage) {
    return "error";
  }

  if (pendingTotal > 0) {
    return "pending";
  }

  return "idle";
}

function makeSnapshot(
  counts = readCachedPendingCounts()
): SyncSnapshot {
  const cloudConnected = hasCloudSession();
  const online = isOnline();
  const pendingTotal =
    counts.pendingTasks +
    counts.pendingDocuments +
    counts.pendingEvents;

  return {
    phase: derivePhase(pendingTotal, cloudConnected, online),
    cloudConnected,
    online,
    ...counts,
    pendingTotal,
    lastSuccessfulSyncAt,
    errorMessage,
  };
}

let snapshot = makeSnapshot();

function publish(nextSnapshot: SyncSnapshot): SyncSnapshot {
  snapshot = nextSnapshot;

  for (const listener of listeners) {
    listener(snapshot);
  }

  return snapshot;
}

async function readPendingCounts() {
  const [pendingTasks, pendingDocuments, pendingEvents] = await Promise.all([
    refreshPendingTaskSyncCount(),
    refreshPendingDocumentSyncCount(),
    refreshPendingEventSyncCount(),
  ]);

  return {
    pendingTasks,
    pendingDocuments,
    pendingEvents,
  };
}

export function getSyncSnapshot(): SyncSnapshot {
  return snapshot;
}

export function subscribeToSyncStatus(listener: SyncListener): () => void {
  listeners.add(listener);
  listener(snapshot);

  return () => {
    listeners.delete(listener);
  };
}

export async function refreshSyncStatus(): Promise<SyncSnapshot> {
  try {
    const counts = await readPendingCounts();
    return publish(makeSnapshot(counts));
  } catch (error) {
    developerLogger.error(
      "sync",
      "Unable to refresh sync status",
      error
    );
    errorMessage = "Unable to read the local sync queues.";
    return publish(makeSnapshot());
  }
}

export async function syncAllNow(): Promise<SyncSnapshot> {
  if (syncPromise) {
    return syncPromise;
  }

  const run = async (): Promise<SyncSnapshot> => {
    errorMessage = null;

    if (
      !hasCloudSession() ||
      isCloudReconnectRequired() ||
      !isOnline()
    ) {
      return refreshSyncStatus();
    }

    isSyncing = true;
    publish(makeSnapshot());

    const results = await Promise.allSettled([
      syncOfflineTaskQueue(),
      syncOfflineDocumentQueue(),
      syncOfflineEventQueue(),
    ]);

    const rejected = results.find(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected"
    );

    const counts = await readPendingCounts();
    const pendingTotal =
      counts.pendingTasks +
      counts.pendingDocuments +
      counts.pendingEvents;

    if (rejected) {
      developerLogger.error(
        "sync",
        "Cloud synchronization failed",
        rejected.reason
      );
      errorMessage = "Cloud synchronization failed. Local changes are safe.";
    } else if (pendingTotal > 0 && isOnline() && hasCloudSession()) {
      errorMessage =
        "Some local changes could not be uploaded. They will be retried.";
    } else {
      lastSuccessfulSyncAt = new Date().toISOString();
      errorMessage = null;
    }

    return publish(makeSnapshot(counts));
  };

  syncPromise = run()
    .catch((error) => {
      developerLogger.error(
        "sync",
        "Unable to synchronize cloud data",
        error
      );
      errorMessage = "Cloud synchronization failed. Local changes are safe.";
      return publish(makeSnapshot());
    })
    .finally(() => {
      isSyncing = false;
      syncPromise = null;
      publish(makeSnapshot());
    });

  return syncPromise;
}

export function startSyncCoordinator(
  intervalMilliseconds = 60_000
): () => void {
  if (!hasBrowserWindow()) {
    return () => undefined;
  }

  let disposed = false;

  const refresh = () => {
    if (!disposed) {
      void refreshSyncStatus();
    }
  };

  const sync = () => {
    if (!disposed) {
      void syncAllNow();
    }
  };

  const handleAuthRequired = (event: Event) => {
    const customEvent = event as CustomEvent<string>;
    errorMessage = customEvent.detail || "Reconnect to resume cloud syncing.";
    refresh();
  };

  window.addEventListener(SYNC_STATE_EVENT, refresh);
  window.addEventListener(SESSION_CHANGED_EVENT, sync);
  window.addEventListener(CLOUD_AUTH_REQUIRED_EVENT, handleAuthRequired);
  window.addEventListener("online", sync);
  window.addEventListener("offline", refresh);

  const interval = window.setInterval(sync, intervalMilliseconds);

  void syncAllNow();

  return () => {
    disposed = true;
    window.clearInterval(interval);
    window.removeEventListener(SYNC_STATE_EVENT, refresh);
    window.removeEventListener(SESSION_CHANGED_EVENT, sync);
    window.removeEventListener(CLOUD_AUTH_REQUIRED_EVENT, handleAuthRequired);
    window.removeEventListener("online", sync);
    window.removeEventListener("offline", refresh);
  };
}

