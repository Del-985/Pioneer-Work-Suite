// apps/web/src/api/tasks.ts
import { http } from "./http";
import { hasCloudSession } from "./session";

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

const TASKS_CACHE_KEY = "pioneer.tasks.cache.v1";
const TASKS_QUEUE_KEY = "pioneer.tasks.queue.v1";

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

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function hasStorage(): boolean {
  return hasWindow() && !!window.localStorage;
}

function notifySyncStateChanged(): void {
  if (hasWindow()) {
    window.dispatchEvent(new Event(SYNC_STATE_EVENT));
  }
}

function isOfflineTaskId(id: string): boolean {
  return id.startsWith("offline-task-");
}

function makeOfflineTaskId(): string {
  return `offline-task-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function readTasksCache(): Task[] {
  if (!hasStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(TASKS_CACHE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizeTask);
  } catch {
    return [];
  }
}

function writeTasksCache(tasks: Task[]): void {
  if (!hasStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(tasks));
  } catch {
    // Ignore storage failures for now.
  }
}

function readQueue(): TaskOp[] {
  if (!hasStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(TASKS_QUEUE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((op) => {
      return (
        op &&
        typeof op === "object" &&
        (op.kind === "create" || op.kind === "update" || op.kind === "delete")
      );
    }) as TaskOp[];
  } catch {
    return [];
  }
}

function writeQueue(queue: TaskOp[]): void {
  if (!hasStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(TASKS_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Ignore storage failures for now.
  } finally {
    notifySyncStateChanged();
  }
}

export function getPendingTaskSyncCount(): number {
  return readQueue().length;
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

function mergeTaskIntoCache(task: Task): void {
  const normalized = normalizeTask(task);
  const tasks = readTasksCache();
  const index = tasks.findIndex((entry) => entry.id === normalized.id);

  if (index === -1) {
    tasks.unshift(normalized);
  } else {
    tasks[index] = {
      ...tasks[index],
      ...normalized,
    };
  }

  writeTasksCache(tasks);
}

function removeTaskFromCache(id: string): void {
  writeTasksCache(readTasksCache().filter((task) => task.id !== id));
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

function enqueueCreate(task: Task): void {
  const queue = readQueue();

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

  writeQueue(queue);
}

function enqueueUpdate(id: string, patch: TaskPatch): void {
  const queue = readQueue();

  const createIndex = queue.findIndex(
    (op) => op.kind === "create" && op.tempId === id
  );

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

    writeQueue(queue);
    return;
  }

  if (queue.some((op) => op.kind === "delete" && op.id === id)) {
    return;
  }

  const updateIndex = queue.findIndex(
    (op) => op.kind === "update" && op.id === id
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

  writeQueue(queue);
}

function enqueueDelete(id: string): void {
  const queue = readQueue().filter((op) => {
    if (op.kind === "create" && op.tempId === id) {
      return false;
    }

    if (op.kind === "update" && op.id === id) {
      return false;
    }

    if (op.kind === "delete" && op.id === id) {
      return false;
    }

    return true;
  });

  if (!isOfflineTaskId(id)) {
    queue.push({
      kind: "delete",
      id,
      timestamp: Date.now(),
    });
  }

  writeQueue(queue);
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
  if (!hasCloudSession() || (hasWindow() && navigator.onLine === false)) {
    return readTasksCache();
  }

  try {
    const remoteTasks = await fetchTasksOnlineOnly();
    const localTasks = readTasksCache();
    const queue = readQueue();

    const pendingUpdates = new Set(
      queue
        .filter((op): op is UpdateOp => op.kind === "update")
        .map((op) => op.id)
    );

    const pendingDeletes = new Set(
      queue
        .filter((op): op is DeleteOp => op.kind === "delete")
        .map((op) => op.id)
    );

    const merged = new Map<string, Task>();

    for (const task of remoteTasks) {
      if (!pendingDeletes.has(task.id)) {
        merged.set(task.id, task);
      }
    }

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

    writeTasksCache(tasks);
    return tasks;
  } catch (error) {
    if (isProbablyOfflineError(error)) {
      return readTasksCache();
    }

    throw error;
  }
}

export async function createTask(title: string): Promise<Task> {
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
    mergeTaskIntoCache(localTask);
    enqueueCreate(localTask);

    return localTask;
  }

  try {
    const created = await createTaskOnlineOnly({
      title: finalTitle,
      status: "todo",
      priority: "normal",
      dueDate: null,
    });

    mergeTaskIntoCache(created);
    return created;
  } catch (error) {
    if (!isProbablyOfflineError(error)) {
      throw error;
    }

    mergeTaskIntoCache(localTask);
    enqueueCreate(localTask);

    return localTask;
  }
}

export async function updateTask(
  id: string,
  patch: TaskPatch
): Promise<Task> {
  const existing = readTasksCache().find((task) => task.id === id);

  const optimistic: Task = normalizeTask({
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

  mergeTaskIntoCache(optimistic);

  if (!hasCloudSession() || (hasWindow() && navigator.onLine === false)) {
    enqueueUpdate(id, patch);

    return optimistic;
  }

  try {
    const updated = await updateTaskOnlineOnly(id, patch);

    mergeTaskIntoCache(updated);
    return updated;
  } catch (error) {
    if (!isProbablyOfflineError(error)) {
      throw error;
    }

    enqueueUpdate(id, patch);
    return optimistic;
  }
}

export async function deleteTask(id: string): Promise<void> {
  removeTaskFromCache(id);

  if (!hasCloudSession() || (hasWindow() && navigator.onLine === false)) {
    enqueueDelete(id);
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

    enqueueDelete(id);
  }
}

export async function syncOfflineTaskQueue(): Promise<void> {
  if (!hasWindow() || !hasCloudSession() || navigator.onLine === false) {
    return;
  }

  const queue = readQueue();

  if (queue.length === 0) {
    return;
  }

  const remaining: TaskOp[] = [];

  for (let index = 0; index < queue.length; index += 1) {
    const operation = queue[index];

    try {
      if (operation.kind === "create") {
        const created = await createTaskOnlineOnly(operation.payload);

        const cached = readTasksCache();
        const cachedIndex = cached.findIndex(
          (task) => task.id === operation.tempId
        );

        if (cachedIndex !== -1) {
          cached[cachedIndex] = created;
          writeTasksCache(cached);
        } else {
          mergeTaskIntoCache(created);
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

        mergeTaskIntoCache(updated);
        continue;
      }

      if (operation.kind === "delete") {
        if (isOfflineTaskId(operation.id)) {
          removeTaskFromCache(operation.id);
          continue;
        }

        await deleteTaskOnlineOnly(operation.id);
        removeTaskFromCache(operation.id);
      }
    } catch (error) {
      if (isProbablyOfflineError(error)) {
        remaining.push(operation, ...queue.slice(index + 1));
        writeQueue(remaining);
        return;
      }

      console.error("[Task sync] operation failed:", operation, error);
      remaining.push(operation);
    }
  }

  writeQueue(remaining);

  try {
    await fetchTasks();
  } catch {
    // Cache remains usable until a later successful sync.
  }
}

export async function trySyncTasksIfOnline(): Promise<void> {
  if (!hasWindow() || !hasCloudSession() || !navigator.onLine) {
    return;
  }

  await syncOfflineTaskQueue();
}