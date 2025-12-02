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

  // Backend returns { tasks: [...] }
  if (data && Array.isArray(data.tasks)) {
    return data.tasks as Task[];
  }

  // Fallback if backend shape changes
  if (Array.isArray(data)) {
    return data as Task[];
  }

  return [];
}

/**
 * POST /tasks
 */
export async function createTask(title: string): Promise<Task> {
  const { data } = await http.post("/tasks", { title });
  // Expecting { task: {...} }
  if (data && data.task) {
    return data.task as Task;
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
  if (data && data.task) {
    return data.task as Task;
  }
  return data as Task;
}

/**
 * DELETE /tasks/:id
 */
export async function deleteTask(id: string): Promise<void> {
  await http.delete(`/tasks/${id}`);
}