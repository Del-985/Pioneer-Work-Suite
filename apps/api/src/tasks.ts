// apps/api/src/tasks.ts
import express from "express";
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

// Protect all /tasks routes with auth
router.use(authMiddleware);

// GET /tasks
// List current student's tasks
router.get("/", (req, res) => {
  const user = (req as any).user as { id: string } | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const userTasks = tasks.filter((t) => t.ownerId === user.id);
  return res.json(userTasks);
});

// POST /tasks
// Create a new task
router.post("/", (req, res) => {
  const user = (req as any).user as { id: string } | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { title, dueDate } = req.body || {};
  const taskTitle =
    title && String(title).trim().length > 0 ? String(title) : "Untitled task";

  const task: Task = {
    id: String(taskIdCounter++),
    ownerId: user.id,
    title: taskTitle,
    status: "todo",
    dueDate: typeof dueDate === "string" ? dueDate : undefined,
  };

  tasks.push(task);

  return res.status(201).json(task);
});

// Helper: find task owned by current user
function findUserTask(req: express.Request) {
  const user = (req as any).user as { id: string } | undefined;
  if (!user) {
    return { error: { status: 401, body: { error: "Unauthenticated" } } };
  }

  const id = req.params.id;
  const task = tasks.find((t) => t.id === id && t.ownerId === user.id);
  if (!task) {
    return { error: { status: 404, body: { error: "Task not found" } } };
  }

  return { user, task };
}

// PUT /tasks/:id
// Partial update: title, status, dueDate
router.put("/:id", (req, res) => {
  const result = findUserTask(req);
  if ("error" in result) {
    return res.status(result.error.status).json(result.error.body);
  }

  const { task } = result;
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
  const result = findUserTask(req);
  if ("error" in result) {
    return res.status(result.error.status).json(result.error.body);
  }

  const index = tasks.findIndex(
    (t) => t.id === result.task.id && t.ownerId === result.task.ownerId
  );
  if (index >= 0) {
    tasks.splice(index, 1);
  }

  return res.status(204).send();
});

export { router as tasksRouter };