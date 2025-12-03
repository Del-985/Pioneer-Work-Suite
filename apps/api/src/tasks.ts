// apps/api/src/tasks.ts
import express from "express";
import { authMiddleware, User } from "./auth";
import { prisma } from "./prisma";

const router = express.Router();

// All /tasks routes require authentication
router.use(authMiddleware);

type TaskStatus = "todo" | "in_progress" | "done";

interface TaskResponse {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  dueDate?: string | null;
}

// Helper to map Prisma Task to API shape
function mapTask(task: any): TaskResponse {
  return {
    id: task.id,
    title: task.title,
    status: (task.status as TaskStatus) || "todo",
    createdAt: task.createdAt instanceof Date
      ? task.createdAt.toISOString()
      : String(task.createdAt),
    dueDate:
      task.dueDate instanceof Date
        ? task.dueDate.toISOString()
        : task.dueDate ?? null,
  };
}

// GET /tasks - list tasks for current user
router.get("/", async (req, res) => {
  const user = (req as any).user as User | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  try {
    const tasks = await prisma.task.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    const mapped = tasks.map(mapTask);

    // For safety with the existing frontend, return just the array.
    // (Your frontend's fetchTasks already expects a Task[] from /tasks.)
    return res.json(mapped);
  } catch (err) {
    console.error("Error in GET /tasks:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /tasks - create a new task for current user
router.post("/", async (req, res) => {
  const user = (req as any).user as User | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { title, status, dueDate } = req.body || {};

  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "Title is required" });
  }

  const statusValue: TaskStatus =
    status === "in_progress" || status === "done" ? status : "todo";

  let parsedDueDate: Date | null = null;
  if (dueDate) {
    const d = new Date(dueDate);
    if (!isNaN(d.getTime())) {
      parsedDueDate = d;
    }
  }

  try {
    const created = await prisma.task.create({
      data: {
        title: title.trim(),
        status: statusValue,
        userId: user.id,
        dueDate: parsedDueDate,
      },
    });

    const mapped = mapTask(created);
    return res.status(201).json(mapped);
  } catch (err) {
    console.error("Error in POST /tasks:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /tasks/:id - update task (title/status/dueDate)
router.put("/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { id } = req.params;
  const { title, status, dueDate } = req.body || {};

  // Build update data dynamically
  const data: any = {};
  if (typeof title === "string" && title.trim().length > 0) {
    data.title = title.trim();
  }

  if (typeof status === "string") {
    if (status === "todo" || status === "in_progress" || status === "done") {
      data.status = status;
    }
  }

  if (dueDate !== undefined) {
    if (dueDate === null || dueDate === "") {
      data.dueDate = null;
    } else {
      const d = new Date(dueDate);
      if (!isNaN(d.getTime())) {
        data.dueDate = d;
      }
    }
  }

  try {
    // Ensure this task belongs to the current user
    const existing = await prisma.task.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return res.status(404).json({ error: "Task not found" });
    }

    const updated = await prisma.task.update({
      where: { id: existing.id },
      data,
    });

    const mapped = mapTask(updated);
    return res.json(mapped);
  } catch (err) {
    console.error("Error in PUT /tasks/:id:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /tasks/:id - delete a task
router.delete("/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { id } = req.params;

  try {
    const existing = await prisma.task.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return res.status(404).json({ error: "Task not found" });
    }

    await prisma.task.delete({
      where: { id: existing.id },
    });

    return res.status(204).send();
  } catch (err) {
    console.error("Error in DELETE /tasks/:id:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { router as tasksRouter };