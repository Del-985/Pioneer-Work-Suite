// apps/web/src/api/tasks.ts
import { http } from "./http";

export type TaskStatus = "todo" | "in_progress" | "done";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate?: string | null;
  createdAt?: string;
}

/**
 * GET /tasks
 */
export async function fetchTasks(): Promise<Task[]> {
  const { data } = await http.get("/tasks");

  // Backend returns a bare array: Task[]
  if (Array.isArray(data)) {
    return data as Task[];
  }

  // Safety if backend ever wraps in { tasks: [...] }
  if (data && Array.isArray((data as any).tasks)) {
    return (data as any).tasks as Task[];
  }

  return [];
}

/**
 * POST /tasks
 * Optional dueDate is an ISO string or null.
 */
export async function createTask(
  title: string,
  dueDate?: string | null
): Promise<Task> {
  const payload: any = { title };
  if (dueDate) {
    payload.dueDate = dueDate;
  }

  const { data } = await http.post("/tasks", payload);

  // Backend returns a bare Task object
  if (data && (data as any).id) {
    return data as Task;
  }

  // Safety if backend ever wraps in { task: {...} }
  if (data && (data as any).task) {
    return (data as any).task as Task;
  }

  return data as Task;
}

/**
 * PUT /tasks/:id
 */
export async function updateTask(
  id: string,
  updates: Partial<Pick<Task, "title" | "status" | "dueDate">>
): Promise<Task> {
  const { data } = await http.put(`/tasks/${id}`, updates);

  if (data && (data as any).id) {
    return data as Task;
  }

  if (data && (data as any).task) {
    return (data as any).task as Task;
  }

  return data as Task;
}

/**
 * DELETE /tasks/:id
 */
export async function deleteTask(id: string): Promise<void> {
  await http.delete(`/tasks/${id}`);
}