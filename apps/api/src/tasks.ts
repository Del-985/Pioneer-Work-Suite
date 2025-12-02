// apps/api/src/tasks.ts
import express, { Request, Response } from "express";
import { authMiddleware } from "./auth";

const router = express.Router();

type TaskStatus = "todo" | "done";

interface Task {
  id: string;
  ownerId: string;
  title: string;
  status: TaskStatus;
  dueDate?: string; // ISO string
}

// In-memory task store (per-user via ownerId)
const tasks: Task[] = [];
let taskIdCounter = 1;

// Helper: get current user id or send 401 and return null
function getCurrentUserId(req: Request, res: Response): string | null {
  const user = (req as any).user as { id: string } | undefined;
  if (!user) {
    res.status(401).json({ error: "Unauthenticated" });
    return null;
  }
  return user.id;
}

// Protect all /tasks routes with auth
router.use(authMiddleware);

// GET /tasks
// List current student's tasks
router.get("/", (req, res) => {
  const userId = getCurrentUserId(req, res);
  if (!userId) return;

  const userTasks = tasks.filter((t) => t.ownerId === userId);
  return res.json(userTasks);
});

// POST /tasks
// Create a new task
router.post("/", (req, res) => {
  const userId = getCurrentUserId(req, res);
  if (!userId) return;

  const { title, dueDate } = req.body || {};
  const taskTitle =
    title && String(title).trim().length > 0 ? String(title) : "Untitled task";

  const task: Task = {
    id: String(taskIdCounter++),
    ownerId: userId,
    title: taskTitle,
    status: "todo",
    dueDate: typeof dueDate === "string" ? dueDate : undefined,
  };

  tasks.push(task);

  return res.status(201).json(task);
});

// PUT /tasks/:id
// Partial update: title, status, dueDate
router.put("/:id", (req, res) => {
  const userId = getCurrentUserId(req, res);
  if (!userId) return;

  const id = req.params.id;
  const task = tasks.find((t) => t.id === id && t.ownerId === userId);

  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  const { title, status, dueDate } = req.body || {};

  if (typeof title === "string") {
    task.title = title;
  }

  if (status === "todo" || status === "done") {
    task.status = status;
  }

  if (typeof dueDate === "string" || dueDate === null) {
    task.dueDate = typeof dueDate === "string" ? dueDate : undefined;
  }

  return res.json(task);
});

// DELETE /tasks/:id
router.delete("/:id", (req, res) => {
  const userId = getCurrentUserId(req, res);
  if (!userId) return;

  const id = req.params.id;
  const index = tasks.findIndex(
    (t) => t.id === id && t.ownerId === userId
  );

  if (index === -1) {
    return res.status(404).json({ error: "Task not found" });
  }

  tasks.splice(index, 1);

  return res.status(204).send();
});

export { router as tasksRouter };