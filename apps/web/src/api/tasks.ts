// apps/web/src/api/tasks.ts
import { http } from "./http";
import { hasCloudSession } from "./session";
import {
  migrateLegacyLocalStorage,
  readStoredTaskQueue,
  readStoredTasks,
  writeStoredTaskQueue,
  writeStoredTasks,
} from "./storage";

export type TaskStatus = "todo" | "in_progress" | "done" | string;

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority?: string | null;
  dueDate?: string | null;
  createdAt?: string;
}

export interface TaskPatch {
  title?: string;
  status?: TaskStatus;
  priority?: string | null;
  dueDate?: string | null;
}

export const SYNC_STATE_EVENT = "pioneer:sync-state-changed";

type TaskOpKind = "create" | "update" | "delete";

interface CreateOp {
  kind: "create";
  tempId: string;
  payload: {
    title: string;
    status?: TaskStatus;
    priority?: string | null;
    dueDate?: string | null;
  };
  timestamp: number;
}

interface UpdateOp {
  kind: "update";
  id: string;
  patch: TaskPatch;
  timestamp: number;
}

interface DeleteOp {
  kind: "delete";
  id: string;
  timestamp: number;
}

type TaskOp = CreateOp | UpdateOp | DeleteOp;

let storageInitialization: Promise<void> | null = null;
let pendingTaskSyncCount = 0;

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function notifySyncStateChanged(): void {
  if (hasWindow()) {
    window.dispatchEvent(new Event(SYNC_STATE_EVENT));
  }
}

async function ensureTaskStorageReady(): Promise<void> {
  if (!storageInitialization) {
    storageInitialization = (async () => {
      await migrateLegacyLocalStorage();
      await refreshPendingTaskSyncCount();
    })();
  }

  await storageInitialization;
}

function isOfflineTaskId(id: string): boolean {
  return id.startsWith("offline-task-");
}

function makeOfflineTaskId(): string {
  return `offline-task-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function normalizeTask(raw: any): Task {
  return {
    id: String(raw?.id ?? makeOfflineTaskId()),
    title: String(raw?.title ?? ""),
    status: (raw?.status ?? "todo") as TaskStatus,
    priority: raw?.priority ?? "normal",
    dueDate: raw?.dueDate ? String(raw.dueDate) : null,
    createdAt: raw?.createdAt
      ? String(raw.createdAt)
      : new Date().toISOString(),
  };
}

async function readTasksCache(): Promise<Task[]> {
  await ensureTaskStorageReady();

  const tasks = await readStoredTasks<Task>();
  return tasks.map(normalizeTask);
}

async function writeTasksCache(tasks: Task[]): Promise<void> {
  await ensureTaskStorageReady();
  await writeStoredTasks(tasks.map(normalizeTask));
}

async function readQueue(): Promise<TaskOp[]> {
  await ensureTaskStorageReady();

  const queue = await readStoredTaskQueue<TaskOp>();

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

async function writeQueue(queue: TaskOp[]): Promise<void> {
  await ensureTaskStorageReady();
  await writeStoredTaskQueue(queue);

  pendingTaskSyncCount = queue.length;
  notifySyncStateChanged();
}

export function getPendingTaskSyncCount(): number {
  return pendingTaskSyncCount;
}

export async function refreshPendingTaskSyncCount(): Promise<number> {
  const queue = await readStoredTaskQueue<TaskOp>();

  pendingTaskSyncCount = queue.length;
  return pendingTaskSyncCount;
}

async function mergeTaskIntoCache(task: Task): Promise<void> {
  const normalized = normalizeTask(task);
  const tasks = await readTasksCache();

  const index = tasks.findIndex((entry) => entry.id === normalized.id);

  if (index === -1) {
    tasks.unshift(normalized);
  } else {
    tasks[index] = {
      ...tasks[index],
      ...normalized,
    };
  }

  await writeTasksCache(tasks);
}

async function removeTaskFromCache(id: string): Promise<void> {
  const tasks = await readTasksCache();
  await writeTasksCache(tasks.filter((task) => task.id !== id));
}

function isProbablyOfflineError(error: any): boolean {
  if (!hasWindow()) {
    return false;
  }

  if (navigator.onLine === false) {
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

async function enqueueCreate(task: Task): Promise<void> {
  const queue = await readQueue();

  queue.push({
    kind: "create",
    tempId: task.id,
    payload: {
      title: task.title,
      status: task.status,
      priority: task.priority ?? "normal",
      dueDate: task.dueDate ?? null,
    },
    timestamp: Date.now(),
  });

  await writeQueue(queue);
}

async function enqueueUpdate(
  id: string,
  patch: TaskPatch
): Promise<void> {
  const queue = await readQueue();

  const createIndex = queue.findIndex(
    (operation) => operation.kind === "create" && operation.tempId === id
  );

  /*
   * A locally created task does not have a cloud ID yet. Keep its queued
   * create operation current instead of creating a separate update.
   */
  if (createIndex !== -1) {
    const create = queue[createIndex] as CreateOp;

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
    const existing = queue[updateIndex] as UpdateOp;

    queue[updateIndex] = {
      ...existing,
      patch: {
        ...existing.patch,
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
   * An offline-only task was never sent to the cloud, so it does not need
   * a future delete operation.
   */
  if (!isOfflineTaskId(id)) {
    queue.push({
      kind: "delete",
      id,
      timestamp: Date.now(),
    });
  }

  await writeQueue(queue);
}

async function fetchTasksOnlineOnly(): Promise<Task[]> {
  const { data } = await http.get<any>("/tasks");

  const rawTasks = Array.isArray(data)
    ? data
    : data && Array.isArray(data.tasks)
      ? data.tasks
      : [];

  return rawTasks.map(normalizeTask);
}

async function createTaskOnlineOnly(
  payload: CreateOp["payload"]
): Promise<Task> {
  const { data } = await http.post<any>("/tasks", payload);

  return normalizeTask(data?.task ?? data);
}

async function updateTaskOnlineOnly(
  id: string,
  patch: TaskPatch
): Promise<Task> {
  const { data } = await http.put<any>(`/tasks/${id}`, patch);

  return normalizeTask(data?.task ?? data);
}

async function deleteTaskOnlineOnly(id: string): Promise<void> {
  await http.delete(`/tasks/${id}`);
}

export async function fetchTasks(): Promise<Task[]> {
  await ensureTaskStorageReady();

  if (!hasCloudSession() || (hasWindow() && navigator.onLine === false)) {
    return readTasksCache();
  }

  try {
    const remoteTasks = await fetchTasksOnlineOnly();
    const localTasks = await readTasksCache();
    const queue = await readQueue();

    const pendingUpdates = new Set(
      queue
        .filter((operation): operation is UpdateOp => {
          return operation.kind === "update";
        })
        .map((operation) => operation.id)
    );

    const pendingDeletes = new Set(
      queue
        .filter((operation): operation is DeleteOp => {
          return operation.kind === "delete";
        })
        .map((operation) => operation.id)
    );

    const merged = new Map<string, Task>();

    for (const task of remoteTasks) {
      if (!pendingDeletes.has(task.id)) {
        merged.set(task.id, task);
      }
    }

    /*
     * Local queued work wins over a stale cloud response so disconnected
     * edits cannot be overwritten during a refresh.
     */
    for (const task of localTasks) {
      if (
        isOfflineTaskId(task.id) ||
        pendingUpdates.has(task.id) ||
        pendingDeletes.has(task.id)
      ) {
        if (!pendingDeletes.has(task.id)) {
          merged.set(task.id, task);
        }
      }
    }

    const tasks = [...merged.values()];

    await writeTasksCache(tasks);
    return tasks;
  } catch (error) {
    if (isProbablyOfflineError(error)) {
      return readTasksCache();
    }

    throw error;
  }
}

export async function createTask(title: string): Promise<Task> {
  await ensureTaskStorageReady();

  const finalTitle = title.trim();

  if (!finalTitle) {
    throw new Error("Task title is required.");
  }

  const localTask: Task = {
    id: makeOfflineTaskId(),
    title: finalTitle,
    status: "todo",
    priority: "normal",
    dueDate: null,
    createdAt: new Date().toISOString(),
  };

  if (!hasCloudSession() || (hasWindow() && navigator.onLine === false)) {
    await mergeTaskIntoCache(localTask);
    await enqueueCreate(localTask);

    return localTask;
  }

  try {
    const created = await createTaskOnlineOnly({
      title: finalTitle,
      status: "todo",
      priority: "normal",
      dueDate: null,
    });

    await mergeTaskIntoCache(created);
    return created;
  } catch (error) {
    if (!isProbablyOfflineError(error)) {
      throw error;
    }

    await mergeTaskIntoCache(localTask);
    await enqueueCreate(localTask);

    return localTask;
  }
}

export async function updateTask(
  id: string,
  patch: TaskPatch
): Promise<Task> {
  await ensureTaskStorageReady();

  const existing = (await readTasksCache()).find((task) => task.id === id);

  const optimistic = normalizeTask({
    ...(existing ?? {
      id,
      title: "",
      status: "todo",
      priority: "normal",
      dueDate: null,
      createdAt: new Date().toISOString(),
    }),
    ...patch,
  });

  await mergeTaskIntoCache(optimistic);

  if (!hasCloudSession() || (hasWindow() && navigator.onLine === false)) {
    await enqueueUpdate(id, patch);
    return optimistic;
  }

  try {
    const updated = await updateTaskOnlineOnly(id, patch);

    await mergeTaskIntoCache(updated);
    return updated;
  } catch (error) {
    if (!isProbablyOfflineError(error)) {
      throw error;
    }

    await enqueueUpdate(id, patch);
    return optimistic;
  }
}

export async function deleteTask(id: string): Promise<void> {
  await ensureTaskStorageReady();
  await removeTaskFromCache(id);

  if (!hasCloudSession() || (hasWindow() && navigator.onLine === false)) {
    await enqueueDelete(id);
    return;
  }

  try {
    await deleteTaskOnlineOnly(id);
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

export async function syncOfflineTaskQueue(): Promise<void> {
  await ensureTaskStorageReady();

  if (!hasWindow() || !hasCloudSession() || navigator.onLine === false) {
    return;
  }

  const queue = await readQueue();

  if (queue.length === 0) {
    return;
  }

  const remaining: TaskOp[] = [];

  for (let index = 0; index < queue.length; index += 1) {
    const operation = queue[index];

    try {
      if (operation.kind === "create") {
        const created = await createTaskOnlineOnly(operation.payload);

        const cached = await readTasksCache();
        const cachedIndex = cached.findIndex(
          (task) => task.id === operation.tempId
        );

        if (cachedIndex !== -1) {
          cached[cachedIndex] = created;
          await writeTasksCache(cached);
        } else {
          await mergeTaskIntoCache(created);
        }

        /*
         * Future-proof remapping in case an update/delete follows a queued
         * create operation for the old temporary ID.
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
        if (isOfflineTaskId(operation.id)) {
          remaining.push(operation);
          continue;
        }

        const updated = await updateTaskOnlineOnly(
          operation.id,
          operation.patch
        );

        await mergeTaskIntoCache(updated);
        continue;
      }

      if (operation.kind === "delete") {
        if (isOfflineTaskId(operation.id)) {
          await removeTaskFromCache(operation.id);
          continue;
        }

        await deleteTaskOnlineOnly(operation.id);
        await removeTaskFromCache(operation.id);
      }
    } catch (error) {
      if (isProbablyOfflineError(error)) {
        remaining.push(operation, ...queue.slice(index + 1));
        await writeQueue(remaining);
        return;
      }

      console.error("[Task sync] operation failed:", operation, error);
      remaining.push(operation);
    }
  }

  await writeQueue(remaining);

  try {
    await fetchTasks();
  } catch {
    // Local IndexedDB data remains available until a later successful sync.
}
}
