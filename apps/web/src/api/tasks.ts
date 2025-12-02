import { http } from "./http";

export type TaskStatus = "todo" | "in_progress" | "done";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate?: string | null;
  createdAt: string;
}

/**
 * GET /tasks
 */
export async function getTasks(): Promise<Task[]> {
  const { data } = await http.get<{ tasks: Task[] }>("/tasks");
  return data.tasks;
}

/**
 * POST /tasks
 */
export async function createTask(title: string, dueDate?: string | null): Promise<Task> {
  const payload: { title: string; dueDate?: string | null } = { title };
  if (dueDate !== undefined) {
    payload.dueDate = dueDate;
  }

  const { data } = await http.post<{ task: Task }>("/tasks", payload);
  return data.task;
}

/**
 * PUT /tasks/:id
 */
export async function updateTask(
  id: string,
  updates: Partial<Pick<Task, "title" | "status" | "dueDate">>
): Promise<Task> {
  const { data } = await http.put<{ task: Task }>(`/tasks/${id}`, updates);
  return data.task;
}

/**
 * DELETE /tasks/:id
 */
export async function deleteTask(id: string): Promise<void> {
  await http.delete(`/tasks/${id}`);
}