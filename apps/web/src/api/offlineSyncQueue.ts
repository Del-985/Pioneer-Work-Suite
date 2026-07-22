import {
  makeSyncMutationId,
  notifySyncStateChanged,
} from "./syncSupport";

export interface OfflineCreateOperation<TPayload> {
  kind: "create";
  tempId: string;
  mutationId: string;
  payload: TPayload;
  timestamp: number;
}

export interface OfflineUpdateOperation<TPatch> {
  kind: "update";
  id: string;
  mutationId: string;
  baseVersion: number;
  patch: TPatch;
  timestamp: number;
}

export interface OfflineDeleteOperation {
  kind: "delete";
  id: string;
  mutationId: string;
  baseVersion: number;
  timestamp: number;
}

export type OfflineSyncOperation<TPayload, TPatch> =
  | OfflineCreateOperation<TPayload>
  | OfflineUpdateOperation<TPatch>
  | OfflineDeleteOperation;

interface OfflineSyncQueueOptions<TPayload, TPatch> {
  scope: string;
  migrate(): Promise<void>;
  readStored(): Promise<unknown[]>;
  writeStored(
    operations: OfflineSyncOperation<TPayload, TPatch>[]
  ): Promise<void>;
  normalizePayload(payload: unknown): TPayload;
  normalizePatch(patch: unknown): TPatch;
}

export interface OfflineSyncQueue<TPayload, TPatch> {
  ensureReady(): Promise<void>;
  read(): Promise<OfflineSyncOperation<TPayload, TPatch>[]>;
  replace(
    operations: OfflineSyncOperation<TPayload, TPatch>[]
  ): Promise<void>;
  pendingCount(): number;
  refreshPendingCount(): Promise<number>;
  enqueueCreate(
    tempId: string,
    payload: TPayload,
    mutationId: string
  ): Promise<void>;
  enqueueUpdate(
    id: string,
    patch: TPatch,
    baseVersion: number,
    mutationId: string
  ): Promise<void>;
  enqueueDelete(
    id: string,
    baseVersion: number,
    mutationId: string
  ): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function createOfflineSyncQueue<TPayload, TPatch extends object>(
  options: OfflineSyncQueueOptions<TPayload, TPatch>
): OfflineSyncQueue<TPayload, TPatch> {
  let initialization: Promise<void> | null = null;
  let count = 0;

  function normalizeOperation(
    value: unknown
  ): OfflineSyncOperation<TPayload, TPatch> | null {
    if (!isRecord(value)) return null;

    if (value.kind === "create") {
      return {
        kind: "create",
        tempId: String(value.tempId ?? ""),
        mutationId: String(
          value.mutationId || makeSyncMutationId(`${options.scope}-create`)
        ),
        payload: options.normalizePayload(value.payload),
        timestamp: Number(value.timestamp) || Date.now(),
      };
    }

    if (value.kind === "update") {
      return {
        kind: "update",
        id: String(value.id ?? ""),
        mutationId: String(
          value.mutationId || makeSyncMutationId(`${options.scope}-update`)
        ),
        baseVersion: Math.max(1, Number(value.baseVersion) || 1),
        patch: options.normalizePatch(value.patch),
        timestamp: Number(value.timestamp) || Date.now(),
      };
    }

    if (value.kind === "delete") {
      return {
        kind: "delete",
        id: String(value.id ?? ""),
        mutationId: String(
          value.mutationId || makeSyncMutationId(`${options.scope}-delete`)
        ),
        baseVersion: Math.max(1, Number(value.baseVersion) || 1),
        timestamp: Number(value.timestamp) || Date.now(),
      };
    }

    return null;
  }

  async function readStoredNormalized(): Promise<
    OfflineSyncOperation<TPayload, TPatch>[]
  > {
    const stored = await options.readStored();
    return stored
      .map(normalizeOperation)
      .filter(
        (operation): operation is OfflineSyncOperation<TPayload, TPatch> =>
          operation !== null
      );
  }

  async function refreshPendingCount(): Promise<number> {
    count = (await readStoredNormalized()).length;
    return count;
  }

  async function ensureReady(): Promise<void> {
    if (!initialization) {
      initialization = (async () => {
        await options.migrate();
        await refreshPendingCount();
      })();
    }
    await initialization;
  }

  async function read(): Promise<
    OfflineSyncOperation<TPayload, TPatch>[]
  > {
    await ensureReady();
    return readStoredNormalized();
  }

  async function replace(
    operations: OfflineSyncOperation<TPayload, TPatch>[]
  ): Promise<void> {
    await options.writeStored(operations);
    count = operations.length;
    notifySyncStateChanged();
  }

  async function enqueueCreate(
    tempId: string,
    payload: TPayload,
    mutationId: string
  ): Promise<void> {
    const operations = await read();
    operations.push({
      kind: "create",
      tempId,
      mutationId,
      payload: options.normalizePayload(payload),
      timestamp: Date.now(),
    });
    await replace(operations);
  }

  async function enqueueUpdate(
    id: string,
    patch: TPatch,
    baseVersion: number,
    mutationId: string
  ): Promise<void> {
    const normalizedPatch = options.normalizePatch(patch);
    const operations = await read();

    if (
      operations.some(
        (operation) => operation.kind === "delete" && operation.id === id
      )
    ) {
      return;
    }

    const existingIndex = operations.findIndex(
      (operation) => operation.kind === "update" && operation.id === id
    );

    if (existingIndex >= 0) {
      const existing = operations[existingIndex] as OfflineUpdateOperation<TPatch>;
      operations[existingIndex] = {
        ...existing,
        mutationId,
        patch: { ...existing.patch, ...normalizedPatch },
        timestamp: Date.now(),
      };
    } else {
      operations.push({
        kind: "update",
        id,
        mutationId,
        baseVersion,
        patch: normalizedPatch,
        timestamp: Date.now(),
      });
    }

    await replace(operations);
  }

  async function enqueueDelete(
    id: string,
    baseVersion: number,
    mutationId: string
  ): Promise<void> {
    const operations = (await read()).filter(
      (operation) =>
        !(
          (operation.kind === "update" || operation.kind === "delete") &&
          operation.id === id
        )
    );

    operations.push({
      kind: "delete",
      id,
      mutationId,
      baseVersion,
      timestamp: Date.now(),
    });
    await replace(operations);
  }

  return {
    ensureReady,
    read,
    replace,
    pendingCount: () => count,
    refreshPendingCount,
    enqueueCreate,
    enqueueUpdate,
    enqueueDelete,
  };
}
