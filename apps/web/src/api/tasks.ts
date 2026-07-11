// apps/web/src/api/tasks.ts
import { http } from "./http";
import { hasCloudSession } from "./session";
import {
  hasBrowserWindow,
  isBrowserOffline,
  isRecoverableOfflineError,
  notifySyncStateChanged,
} from "./syncSupport";
import {
  migrateLegacyLocalStorage,
  readStoredTaskQueue,
  readStoredTasks,
  writeStoredTaskQueue,
  writeStoredTasks,
} from "./storage";

export type TaskStatus = "todo" | "in_progress" | "done" | string;
export type TaskPriority = "critical" | "high" | "medium" | "low";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  createdAt?: string;
}

export interface TaskPatch {
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
}

export interface CreateTaskOptions {
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
}


interface CreateOp {
  kind: "create";
  tempId: string;
  payload: {
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate: string | null;
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

export function normalizeTaskPriority(input: unknown): TaskPriority {
  const value = String(input ?? "")
    .trim()
    .toLowerCase();

  if (
    value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low"
  ) {
    return value;
  }

  // Tasks created before Tasks v2 used "normal".
  if (value === "normal") {
    return "medium";
  }

  return "medium";
}

function normalizeDueDate(input: unknown): string | null {
  if (input === null || input === undefined || input === "") {
    return null;
  }

  return String(input);
}

function normalizeTaskPatch(patch: TaskPatch): TaskPatch {
  const normalized: TaskPatch = { ...patch };

  if (patch.priority !== undefined) {
    normalized.priority = normalizeTaskPriority(patch.priority);
  }

  if (patch.dueDate !== undefined) {
    normalized.dueDate = normalizeDueDate(patch.dueDate);
  }

  return normalized;
}

function normalizeTask(raw: any): Task {
  return {
    id: String(raw?.id ?? makeOfflineTaskId()),
    title: String(raw?.title ?? ""),
    status: (raw?.status ?? "todo") as TaskStatus,
    priority: normalizeTaskPriority(raw?.priority),
    dueDate: normalizeDueDate(raw?.dueDate),
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

function normalizeQueueOperation(operation: any): TaskOp | null {
  if (!operation || typeof operation !== "object") {
    return null;
  }

  if (operation.kind === "create") {
    return {
      ...operation,
      kind: "create",
      tempId: String(operation.tempId),
      payload: {
        title: String(operation.payload?.title ?? ""),
        status: (operation.payload?.status ?? "todo") as TaskStatus,
        priority: normalizeTaskPriority(operation.payload?.priority),
        dueDate: normalizeDueDate(operation.payload?.dueDate),
      },
      timestamp: Number(operation.timestamp) || Date.now(),
    };
  }

  if (operation.kind === "update") {
    return {
      ...operation,
      kind: "update",
      id: String(operation.id),
      patch: normalizeTaskPatch(operation.patch ?? {}),
      timestamp: Number(operation.timestamp) || Date.now(),
    };
  }

  if (operation.kind === "delete") {
    return {
      ...operation,
      kind: "delete",
      id: String(operation.id),
      timestamp: Number(operation.timestamp) || Date.now(),
    };
  }

  return null;
}

async function readQueue(): Promise<TaskOp[]> {
  await ensureTaskStorageReady();

  const queue = await readStoredTaskQueue<TaskOp>();

  return queue
    .map(normalizeQueueOperation)
    .filter((operation): operation is TaskOp => operation !== null);
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

async function enqueueCreate(task: Task): Promise<void> {
  const queue = await readQueue();

  queue.push({
    kind: "create",
    tempId: task.id,
    payload: {
      title: task.title,
      status: task.status,
      priority: task.priority,
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
  const normalizedPatch = normalizeTaskPatch(patch);
  const queue = await readQueue();

  const createIndex = queue.findIndex(
    (operation) => operation.kind === "create" && operation.tempId === id
  );

  if (createIndex !== -1) {
    const create = queue[createIndex] as CreateOp;

    queue[createIndex] = {
      ...create,
      payload: {
        ...create.payload,
        ...normalizedPatch,
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
        ...normalizedPatch,
      },
      timestamp: Date.now(),
    };
  } else {
    queue.push({
      kind: "update",
      id,
      patch: normalizedPatch,
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

  if (!hasCloudSession() || isBrowserOffline()) {
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
    if (isRecoverableOfflineError(error)) {
      return readTasksCache();
    }

    throw error;
  }
}

export async function createTask(
  title: string,
  options: CreateTaskOptions = {}
): Promise<Task> {
  await ensureTaskStorageReady();

  const finalTitle = title.trim();

  if (!finalTitle) {
    throw new Error("Task title is required.");
  }

  const status = options.status ?? "todo";
  const priority = normalizeTaskPriority(options.priority);
  const dueDate = normalizeDueDate(options.dueDate);

  const localTask: Task = {
    id: makeOfflineTaskId(),
    title: finalTitle,
    status,
    priority,
    dueDate,
    createdAt: new Date().toISOString(),
  };

  if (!hasCloudSession() || isBrowserOffline()) {
    await mergeTaskIntoCache(localTask);
    await enqueueCreate(localTask);

    return localTask;
  }

  try {
    const created = await createTaskOnlineOnly({
      title: finalTitle,
      status,
      priority,
      dueDate,
    });

    await mergeTaskIntoCache(created);
    return created;
  } catch (error) {
    if (!isRecoverableOfflineError(error)) {
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

  const normalizedPatch = normalizeTaskPatch(patch);
  const existing = (await readTasksCache()).find((task) => task.id === id);

  const optimistic = normalizeTask({
    ...(existing ?? {
      id,
      title: "",
      status: "todo",
      priority: "medium",
      dueDate: null,
      createdAt: new Date().toISOString(),
    }),
    ...normalizedPatch,
  });

  await mergeTaskIntoCache(optimistic);

  if (!hasCloudSession() || isBrowserOffline()) {
    await enqueueUpdate(id, normalizedPatch);
    return optimistic;
  }

  try {
    const updated = await updateTaskOnlineOnly(id, normalizedPatch);

    await mergeTaskIntoCache(updated);
    return updated;
  } catch (error) {
    if (!isRecoverableOfflineError(error)) {
      throw error;
    }

    await enqueueUpdate(id, normalizedPatch);
    return optimistic;
  }
}

export async function deleteTask(id: string): Promise<void> {
  await ensureTaskStorageReady();
  await removeTaskFromCache(id);

  if (!hasCloudSession() || isBrowserOffline()) {
    await enqueueDelete(id);
    return;
  }

  try {
    await deleteTaskOnlineOnly(id);
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return;
    }

    if (!isRecoverableOfflineError(error)) {
      throw error;
    }

    await enqueueDelete(id);
  }
}

export async function syncOfflineTaskQueue(): Promise<void> {
  await ensureTaskStorageReady();

  if (!hasBrowserWindow() || !hasCloudSession() || isBrowserOffline()) {
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
      if (isRecoverableOfflineError(error)) {
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
