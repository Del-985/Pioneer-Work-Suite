// apps/web/src/api/tasks.ts
import { http } from "./http";

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

// ---------- helpers ----------

function safeHasWindow(): boolean {
  return typeof window !== "undefined";
}

function safeHasLocalStorage(): boolean {
  return safeHasWindow() && !!window.localStorage;
}

function readTasksCache(): Task[] {
  if (!safeHasLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(TASKS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Task[];
  } catch {
    return [];
  }
}

function writeTasksCache(tasks: Task[]): void {
  if (!safeHasLocalStorage()) return;
  try {
    window.localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(tasks));
  } catch {
    // ignore
  }
}

function readQueue(): TaskOp[] {
  if (!safeHasLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(TASKS_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as TaskOp[];
  } catch {
    return [];
  }
}

function writeQueue(ops: TaskOp[]): void {
  if (!safeHasLocalStorage()) return;
  try {
    window.localStorage.setItem(TASKS_QUEUE_KEY, JSON.stringify(ops));
  } catch {
    // ignore
  }
}

function enqueue(op: TaskOp) {
  const current = readQueue();
  current.push(op);
  writeQueue(current);
}

function isProbablyOfflineError(err: any): boolean {
  if (!safeHasWindow()) return false;

  // Hard offline from browser
  if (navigator && navigator.onLine === false) return true;

  // Axios-style network error (no response)
  if (err && typeof err === "object") {
    const anyErr = err as any;
    if (anyErr.isAxiosError && !anyErr.response) return true;
    if (typeof anyErr.code === "string" && anyErr.code === "ERR_NETWORK") {
      return true;
    }
    if (
      typeof anyErr.message === "string" &&
      anyErr.message.toLowerCase().includes("network")
    ) {
      return true;
    }
  }

  return false;
}

// update cache utilities

function mergeTaskIntoCache(task: Task) {
  const tasks = readTasksCache();
  const idx = tasks.findIndex((t) => t.id === task.id);
  if (idx === -1) {
    tasks.unshift(task);
  } else {
    tasks[idx] = { ...tasks[idx], ...task };
  }
  writeTasksCache(tasks);
}

function removeTaskFromCache(id: string) {
  const tasks = readTasksCache();
  const next = tasks.filter((t) => t.id !== id);
  writeTasksCache(next);
}

// Normalization to keep TS happy and UI robust
function normalizeTask(raw: any): Task {
  const t: Task = {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    status: (raw.status ?? "todo") as TaskStatus,
    priority: raw.priority ?? null,
    dueDate: raw.dueDate ? String(raw.dueDate) : null,
    createdAt: raw.createdAt ? String(raw.createdAt) : undefined,
  };
  return t;
}

// ---------- ONLINE-ONLY fetch (internal) ----------

async function fetchTasksOnlineOnly(): Promise<Task[]> {
  const { data } = await http.get<any>("/tasks");

  let rawTasks: any[] = [];
  if (Array.isArray(data)) {
    rawTasks = data;
  } else if (data && Array.isArray(data.tasks)) {
    rawTasks = data.tasks;
  }

  const tasks = rawTasks.map(normalizeTask);
  writeTasksCache(tasks);
  return tasks;
}

// ---------- PUBLIC API (offline-aware) ----------

export async function fetchTasks(): Promise<Task[]> {
  // If clearly offline, just return cache
  if (safeHasWindow() && navigator.onLine === false) {
    return readTasksCache();
  }

  try {
    return await fetchTasksOnlineOnly();
  } catch (err) {
    if (isProbablyOfflineError(err)) {
      // Use whatever we have locally
      return readTasksCache();
    }
    throw err;
  }
}

// Existing signature: createTask(title: string)
export async function createTask(title: string): Promise<Task> {
  const basePayload = {
    title,
  };

  // If clearly offline, synthesize local task + queue op
  if (safeHasWindow() && navigator.onLine === false) {
    const tempId = `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const offlineTask: Task = {
      id: tempId,
      title,
      status: "todo",
      priority: "normal",
      dueDate: null,
      createdAt: new Date().toISOString(),
    };

    mergeTaskIntoCache(offlineTask);

    const op: CreateOp = {
      kind: "create",
      tempId,
      payload: {
        title,
        status: "todo",
        priority: "normal",
        dueDate: null,
      },
      timestamp: Date.now(),
    };
    enqueue(op);

    return offlineTask;
  }

  // Try online; on network failure, fall back to offline behaviour
  try {
    const { data } = await http.post<any>("/tasks", basePayload);
    const task = normalizeTask(data.task ?? data);
    mergeTaskIntoCache(task);
    return task;
  } catch (err) {
    if (!isProbablyOfflineError(err)) {
      throw err;
    }

    const tempId = `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const offlineTask: Task = {
      id: tempId,
      title,
      status: "todo",
      priority: "normal",
      dueDate: null,
      createdAt: new Date().toISOString(),
    };

    mergeTaskIntoCache(offlineTask);

    const op: CreateOp = {
      kind: "create",
      tempId,
      payload: {
        title,
        status: "todo",
        priority: "normal",
        dueDate: null,
      },
      timestamp: Date.now(),
    };
    enqueue(op);

    return offlineTask;
  }
}

export async function updateTask(
  id: string,
  patch: TaskPatch
): Promise<Task> {
  // If clearly offline, update cache + queue and return synthetic
  if (safeHasWindow() && navigator.onLine === false) {
    const tasks = readTasksCache();
    const existing = tasks.find((t) => t.id === id);
    const merged: Task = existing
      ? { ...existing, ...patch }
      : {
          id,
          title: patch.title ?? "",
          status: patch.status ?? "todo",
          priority: patch.priority ?? "normal",
          dueDate: patch.dueDate ?? null,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        };

    mergeTaskIntoCache(merged);

    const op: UpdateOp = {
      kind: "update",
      id,
      patch,
      timestamp: Date.now(),
    };
    enqueue(op);

    return merged;
  }

  try {
    const { data } = await http.patch<any>(`/tasks/${id}`, patch);
    const task = normalizeTask(data.task ?? data);
    mergeTaskIntoCache(task);
    return task;
  } catch (err) {
    if (!isProbablyOfflineError(err)) {
      throw err;
    }

    const tasks = readTasksCache();
    const existing = tasks.find((t) => t.id === id);
    const merged: Task = existing
      ? { ...existing, ...patch }
      : {
          id,
          title: patch.title ?? "",
          status: patch.status ?? "todo",
          priority: patch.priority ?? "normal",
          dueDate: patch.dueDate ?? null,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        };

    mergeTaskIntoCache(merged);

    const op: UpdateOp = {
      kind: "update",
      id,
      patch,
      timestamp: Date.now(),
    };
    enqueue(op);

    return merged;
  }
}

export async function deleteTask(id: string): Promise<void> {
  // Always optimistically remove from cache
  removeTaskFromCache(id);

  if (safeHasWindow() && navigator.onLine === false) {
    const op: DeleteOp = {
      kind: "delete",
      id,
      timestamp: Date.now(),
    };
    enqueue(op);
    return;
  }

  try {
    await http.delete(`/tasks/${id}`);
  } catch (err) {
    if (!isProbablyOfflineError(err)) {
      throw err;
    }

    const op: DeleteOp = {
      kind: "delete",
      id,
      timestamp: Date.now(),
    };
    enqueue(op);
  }
}

// ---------- SYNC HELPERS (for App.tsx) ----------

export async function syncOfflineTaskQueue(): Promise<void> {
  if (!safeHasWindow()) return;
  if (navigator.onLine === false) return;

  let queue = readQueue();
  if (queue.length === 0) return;

  const newQueue: TaskOp[] = [];

  for (const op of queue) {
    try {
      if (op.kind === "create") {
        const { tempId, payload } = op;
        const { data } = await http.post<any>("/tasks", payload);
        const serverTask = normalizeTask(data.task ?? data);

        // Replace tempId in cache
        const tasks = readTasksCache();
        const idx = tasks.findIndex((t) => t.id === tempId);
        if (idx !== -1) {
          tasks[idx] = serverTask;
          writeTasksCache(tasks);
        } else {
          mergeTaskIntoCache(serverTask);
        }
      } else if (op.kind === "update") {
        const { id, patch } = op;
        const { data } = await http.patch<any>(`/tasks/${id}`, patch);
        const serverTask = normalizeTask(data.task ?? data);
        mergeTaskIntoCache(serverTask);
      } else if (op.kind === "delete") {
        const { id } = op;
        await http.delete(`/tasks/${id}`);
        removeTaskFromCache(id);
      }
      // success: do not keep in newQueue
    } catch (err) {
      // If still offline mid-loop or server unhappy, keep this op for later
      newQueue.push(op);
    }
  }

  writeQueue(newQueue);

  // Refresh cache from server if we're still online
  try {
    if (navigator.onLine) {
      const tasks = await fetchTasksOnlineOnly();
      writeTasksCache(tasks);
    }
  } catch {
    // ignore
  }
}

/**
 * Convenience function: call this on app mount + on "online" events.
 */
export async function trySyncTasksIfOnline(): Promise<void> {
  if (!safeHasWindow()) return;
  if (!navigator.onLine) return;
  await syncOfflineTaskQueue();
}