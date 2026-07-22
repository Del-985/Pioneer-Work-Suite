// apps/web/src/api/tasks.ts
import { http } from "./http";
import { hasCloudSession } from "./session";
import {
  hasBrowserWindow,
  isBrowserOffline,
  isRecoverableOfflineError,
  makeSyncMutationId,
  notifySyncStateChanged,
  readVersionConflictEntity,
} from "./syncSupport";
import {
  migrateLegacyLocalStorage,
  readStoredTaskQueue,
  readStoredTasks,
  writeStoredTaskQueue,
  writeStoredTasks,
} from "./storage";

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "critical" | "high" | "medium" | "low";
export const TASKS_CHANGED_EVENT = "pioneer:tasks-changed";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  version: number;
}

export interface TaskPatch {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
  dueDate?: string | null;
  archivedAt?: string | null;
}

interface CreateTaskOptions {
  status?: TaskStatus;
  priority?: TaskPriority;
  description?: string;
  tags?: string[];
  dueDate?: string | null;
}


interface CreateOp {
  kind: "create";
  tempId: string;
  mutationId: string;
  payload: {
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    tags: string[];
    dueDate: string | null;
  };
  timestamp: number;
}

interface UpdateOp {
  kind: "update";
  id: string;
  mutationId: string;
  baseVersion: number;
  patch: TaskPatch;
  timestamp: number;
}

interface DeleteOp {
  kind: "delete";
  id: string;
  mutationId: string;
  baseVersion: number;
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

function normalizeTaskPriority(input: unknown): TaskPriority {
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

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  return [...new Set(
    input
      .map((tag) => String(tag).trim())
      .filter(Boolean)
      .map((tag) => tag.slice(0, 40))
  )].slice(0, 50);
}

function normalizeTimestamp(input: unknown): string | null {
  if (!input) return null;
  const date = new Date(String(input));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function notifyTasksChanged(): void {
  if (hasBrowserWindow()) {
    window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
  }
}

function normalizeTaskPatch(patch: TaskPatch): TaskPatch {
  const normalized: TaskPatch = { ...patch };

  if (patch.priority !== undefined) {
    normalized.priority = normalizeTaskPriority(patch.priority);
  }

  if (patch.dueDate !== undefined) {
    normalized.dueDate = normalizeDueDate(patch.dueDate);
  }

  if (patch.tags !== undefined) {
    normalized.tags = normalizeTags(patch.tags);
  }

  if (patch.description !== undefined) {
    normalized.description = String(patch.description);
  }

  if (patch.archivedAt !== undefined) {
    normalized.archivedAt = normalizeTimestamp(patch.archivedAt);
  }

  return normalized;
}

function normalizeTask(raw: any): Task {
  return {
    id: String(raw?.id ?? makeOfflineTaskId()),
    title: String(raw?.title ?? ""),
    description: String(raw?.description ?? ""),
    status:
      raw?.status === "in_progress" || raw?.status === "done"
        ? raw.status
        : "todo",
    priority: normalizeTaskPriority(raw?.priority),
    tags: normalizeTags(raw?.tags),
    dueDate: normalizeDueDate(raw?.dueDate),
    createdAt:
      normalizeTimestamp(raw?.createdAt) ?? new Date().toISOString(),
    updatedAt:
      normalizeTimestamp(raw?.updatedAt) ??
      normalizeTimestamp(raw?.createdAt) ??
      new Date().toISOString(),
    completedAt: normalizeTimestamp(raw?.completedAt),
    archivedAt: normalizeTimestamp(raw?.archivedAt),
    version: Number.isInteger(Number(raw?.version)) && Number(raw.version) > 0
      ? Number(raw.version)
      : 1,
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
      mutationId: String(operation.mutationId || makeSyncMutationId("task-create")),
      payload: {
        title: String(operation.payload?.title ?? ""),
        description: String(operation.payload?.description ?? ""),
        status:
          operation.payload?.status === "in_progress" ||
          operation.payload?.status === "done"
            ? operation.payload.status
            : "todo",
        priority: normalizeTaskPriority(operation.payload?.priority),
        tags: normalizeTags(operation.payload?.tags),
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
      mutationId: String(operation.mutationId || makeSyncMutationId("task-update")),
      baseVersion: Math.max(1, Number(operation.baseVersion) || 1),
      patch: normalizeTaskPatch(operation.patch ?? {}),
      timestamp: Number(operation.timestamp) || Date.now(),
    };
  }

  if (operation.kind === "delete") {
    return {
      ...operation,
      kind: "delete",
      id: String(operation.id),
      mutationId: String(operation.mutationId || makeSyncMutationId("task-delete")),
      baseVersion: Math.max(1, Number(operation.baseVersion) || 1),
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

async function enqueueCreate(task: Task, mutationId: string): Promise<void> {
  const queue = await readQueue();

  queue.push({
    kind: "create",
    tempId: task.id,
    mutationId,
    payload: {
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      tags: task.tags,
      dueDate: task.dueDate ?? null,
    },
    timestamp: Date.now(),
  });

  await writeQueue(queue);
}

async function enqueueUpdate(
  id: string,
  patch: TaskPatch,
  baseVersion: number,
  mutationId: string
): Promise<void> {
  const normalizedPatch = normalizeTaskPatch(patch);
  const queue = await readQueue();

  const createIndex = queue.findIndex(
    (operation) => operation.kind === "create" && operation.tempId === id
  );

  if (createIndex !== -1) {
    queue.push({
      kind: "update",
      id,
      patch: normalizedPatch,
      mutationId,
      baseVersion,
      timestamp: Date.now(),
    });

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
      mutationId,
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
      mutationId,
      baseVersion,
      patch: normalizedPatch,
      timestamp: Date.now(),
    });
  }

  await writeQueue(queue);
}

async function enqueueDelete(
  id: string,
  baseVersion: number,
  mutationId: string
): Promise<void> {
  const queue = (await readQueue()).filter((operation) => {
    if (operation.kind === "update" && operation.id === id) {
      return false;
    }

    if (operation.kind === "delete" && operation.id === id) {
      return false;
    }

    return true;
  });

  queue.push({
    kind: "delete",
    id,
    mutationId,
    baseVersion,
    timestamp: Date.now(),
  });

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
  payload: CreateOp["payload"],
  mutationId: string
): Promise<Task> {
  const { data } = await http.post<any>("/tasks", payload, {
    headers: { "Idempotency-Key": mutationId },
  });

  return normalizeTask(data?.task ?? data);
}

async function updateTaskOnlineOnly(
  id: string,
  patch: TaskPatch,
  baseVersion: number,
  mutationId: string
): Promise<Task> {
  try {
    const { data } = await http.put<any>(`/tasks/${id}`, {
      ...patch,
      ifVersion: baseVersion,
    }, { headers: { "Idempotency-Key": mutationId } });
    return normalizeTask(data?.task ?? data);
  } catch (error) {
    const current = readVersionConflictEntity<Task>(error);
    if (!current) throw error;
    const normalizedCurrent = normalizeTask(current);
    const { data } = await http.put<any>(`/tasks/${id}`, {
      ...patch,
      ifVersion: normalizedCurrent.version,
    }, { headers: { "Idempotency-Key": mutationId } });
    return normalizeTask(data?.task ?? data);
  }
}

async function deleteTaskOnlineOnly(
  id: string,
  baseVersion: number,
  mutationId: string
): Promise<void> {
  try {
    await http.delete(`/tasks/${id}`, {
      headers: { "Idempotency-Key": mutationId, "If-Match": String(baseVersion) },
    });
  } catch (error) {
    const current = readVersionConflictEntity<Task>(error);
    if (!current) throw error;
    await http.delete(`/tasks/${id}`, {
      headers: {
        "Idempotency-Key": mutationId,
        "If-Match": String(normalizeTask(current).version),
      },
    });
  }
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
  const description = String(options.description ?? "").trim();
  const tags = normalizeTags(options.tags);
  const now = new Date().toISOString();
  const mutationId = makeSyncMutationId("task-create");

  const localTask: Task = {
    id: makeOfflineTaskId(),
    title: finalTitle,
    description,
    status,
    priority,
    tags,
    dueDate,
    createdAt: now,
    updatedAt: now,
    completedAt: status === "done" ? now : null,
    archivedAt: null,
    version: 1,
  };

  if (!hasCloudSession() || isBrowserOffline()) {
    await mergeTaskIntoCache(localTask);
    await enqueueCreate(localTask, mutationId);
    notifyTasksChanged();

    return localTask;
  }

  try {
    const created = await createTaskOnlineOnly({
      title: finalTitle,
      status,
      priority,
      description,
      tags,
      dueDate,
    }, mutationId);

    await mergeTaskIntoCache(created);
    notifyTasksChanged();
    return created;
  } catch (error) {
    if (!isRecoverableOfflineError(error)) {
      throw error;
    }

    await mergeTaskIntoCache(localTask);
    await enqueueCreate(localTask, mutationId);
    notifyTasksChanged();

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
  const now = new Date().toISOString();
  const baseVersion = existing?.version ?? 1;
  const mutationId = makeSyncMutationId("task-update");

  const completionPatch =
    normalizedPatch.status === "done"
      ? { completedAt: existing?.completedAt ?? now }
      : normalizedPatch.status
        ? { completedAt: null }
        : {};

  const optimistic = normalizeTask({
    ...(existing ?? {
      id,
      title: "",
      description: "",
      status: "todo",
      priority: "medium",
      tags: [],
      dueDate: null,
      createdAt: now,
      completedAt: null,
      archivedAt: null,
      version: baseVersion,
    }),
    ...normalizedPatch,
    ...completionPatch,
    updatedAt: now,
    version: baseVersion + 1,
  });

  await mergeTaskIntoCache(optimistic);
  notifyTasksChanged();

  if (!hasCloudSession() || isBrowserOffline()) {
    await enqueueUpdate(id, normalizedPatch, baseVersion, mutationId);
    return optimistic;
  }

  try {
    const updated = await updateTaskOnlineOnly(
      id,
      normalizedPatch,
      baseVersion,
      mutationId
    );

    await mergeTaskIntoCache(updated);
    return updated;
  } catch (error) {
    if (!isRecoverableOfflineError(error)) {
      throw error;
    }

    await enqueueUpdate(id, normalizedPatch, baseVersion, mutationId);
    return optimistic;
  }
}

export async function deleteTask(id: string): Promise<void> {
  await ensureTaskStorageReady();
  const existing = (await readTasksCache()).find((task) => task.id === id);
  const baseVersion = existing?.version ?? 1;
  const mutationId = makeSyncMutationId("task-delete");
  await removeTaskFromCache(id);
  notifyTasksChanged();

  if (!hasCloudSession() || isBrowserOffline()) {
    await enqueueDelete(id, baseVersion, mutationId);
    return;
  }

  try {
    await deleteTaskOnlineOnly(id, baseVersion, mutationId);
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return;
    }

    if (!isRecoverableOfflineError(error)) {
      throw error;
    }

    await enqueueDelete(id, baseVersion, mutationId);
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
        const created = await createTaskOnlineOnly(
          operation.payload,
          operation.mutationId
        );

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
          operation.patch,
          operation.baseVersion,
          operation.mutationId
        );

        await mergeTaskIntoCache(updated);
        continue;
      }

      if (operation.kind === "delete") {
        if (isOfflineTaskId(operation.id)) {
          await removeTaskFromCache(operation.id);
          continue;
        }

        await deleteTaskOnlineOnly(
          operation.id,
          operation.baseVersion,
          operation.mutationId
        );
        await removeTaskFromCache(operation.id);
      }
    } catch (error) {
      if ((error as any)?.response?.status === 404 && operation.kind === "update") {
        await removeTaskFromCache(operation.id);
        continue;
      }
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

export async function applyTaskCloudChange(
  id: string,
  task: Task | null
): Promise<void> {
  await ensureTaskStorageReady();
  if (task) await mergeTaskIntoCache(normalizeTask(task));
  else await removeTaskFromCache(id);
  notifyTasksChanged();
}
