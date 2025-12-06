// apps/web/src/api/tasks.ts
import { http } from "./http";

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "normal" | "high";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  createdAt?: string;
}

/**
 * GET /tasks
 */
export async function fetchTasks(): Promise<Task[]> {
  const { data } = await http.get("/tasks");

  // Backend returns bare array: Task[]
  if (Array.isArray(data)) {
    return data as Task[];
  }

  // Fallback if backend ever wraps it
  if (data && Array.isArray((data as any).tasks)) {
    return (data as any).tasks as Task[];
  }

  return [];
}

/**
 * POST /tasks
 */
export async function createTask(
  title: string,
  priority: TaskPriority = "normal"
): Promise<Task> {
  const payload = { title, priority };
  const { data } = await http.post("/tasks", payload);

  // If backend ever returns { task: {...} }
  if (data && (data as any).task) {
    return (data as any).task as Task;
  }

  // Current backend returns the task object directly
  return data as Task;
}

/**
 * PUT /tasks/:id
 */
export async function updateTask(
  id: string,
  updates: Partial<Pick<Task, "title" | "status" | "dueDate" | "priority">>
): Promise<Task> {
  const { data } = await http.put(`/tasks/${id}`, updates);

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