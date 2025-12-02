// apps/api/src/tasks.ts
import express from "express";
import { authMiddleware } from "./auth";

const router = express.Router();

// All tasks are per-student in memory for v1
type TaskStatus = "todo" | "in_progress" | "done";

interface Task {
  id: string;
  ownerId: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  dueDate?: string | null;
}

const tasks: Task[] = [];
let taskIdCounter = 1;

// Require auth for all /tasks routes
router.use(authMiddleware);

// GET /tasks - list tasks for current user
router.get("/", (req, res) => {
  const user = (req as any).user as { id: string } | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const userTasks = tasks.filter((t) => t.ownerId === user.id);
  return res.json({ tasks: userTasks });
});

// POST /tasks - create a new task
router.post("/", (req, res) => {
  const user = (req as any).user as { id: string } | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { title, dueDate } = req.body || {};

  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "Title is required" });
  }

  const task: Task = {
    id: String(taskIdCounter++),
    ownerId: user.id,
    title: title.trim(),
    status: "todo",
    createdAt: new Date().toISOString(),
    dueDate: dueDate ?? null,
  };

  // 👇 This is the ONLY place we push, so only one task is created.
  tasks.push(task);

  return res.status(201).json({ task });
});

// PUT /tasks/:id - update a task (title / status / dueDate)
router.put("/:id", (req, res) => {
  const user = (req as any).user as { id: string } | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { id } = req.params;
  const { title, status, dueDate } = req.body || {};

  const task = tasks.find((t) => t.id === id && t.ownerId === user.id);

  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  if (typeof title === "string" && title.trim().length > 0) {
    task.title = title.trim();
  }

  if (status && (status === "todo" || status === "in_progress" || status === "done")) {
    task.status = status;
  }

  if (dueDate !== undefined) {
    task.dueDate = dueDate ?? null;
  }

  return res.json({ task });
});

// DELETE /tasks/:id - delete a task
router.delete("/:id", (req, res) => {
  const user = (req as any).user as { id: string } | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { id } = req.params;

  const index = tasks.findIndex((t) => t.id === id && t.ownerId === user.id);

  if (index === -1) {
    return res.status(404).json({ error: "Task not found" });
  }

  tasks.splice(index, 1);

  return res.status(204).send();
});

export { router as tasksRouter };