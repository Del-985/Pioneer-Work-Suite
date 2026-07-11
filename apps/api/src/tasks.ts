// apps/api/src/tasks.ts
import express from "express";
import { authMiddleware, User } from "./auth";
import { prisma } from "./prisma";

const router = express.Router();

router.use(authMiddleware);

type TaskStatus = "todo" | "in_progress" | "done";
type TaskPriority = "critical" | "high" | "medium" | "low";

interface TaskResponse {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: string;
  dueDate?: string | null;
}

function normalizePriority(input: unknown): TaskPriority {
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

  // Legacy Tasks v1 records used "normal".
  if (value === "normal") {
    return "medium";
  }

  return "medium";
}

function parseDueDate(input: unknown): Date | null {
  if (input === null || input === undefined || input === "") {
    return null;
  }

  const value = String(input).trim();

  // Treat YYYY-MM-DD as a calendar date rather than local midnight.
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapTask(task: any): TaskResponse {
  return {
    id: task.id,
    title: task.title,
    status: (task.status as TaskStatus) || "todo",
    priority: normalizePriority(task.priority),
    createdAt:
      task.createdAt instanceof Date
        ? task.createdAt.toISOString()
        : String(task.createdAt),
    dueDate:
      task.dueDate instanceof Date
        ? task.dueDate.toISOString()
        : task.dueDate ?? null,
  };
}

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

    return res.json(tasks.map(mapTask));
  } catch (error) {
    console.error("Error in GET /tasks:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  const user = (req as any).user as User | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { title, status, dueDate, priority } = req.body || {};

  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Title is required" });
  }

  const statusValue: TaskStatus =
    status === "in_progress" || status === "done" ? status : "todo";
  const priorityValue = normalizePriority(priority);
  const parsedDueDate = parseDueDate(dueDate);

  try {
    const created = await prisma.task.create({
      data: {
        title: title.trim(),
        status: statusValue,
        priority: priorityValue,
        userId: user.id,
        dueDate: parsedDueDate,
      },
    });

    return res.status(201).json(mapTask(created));
  } catch (error) {
    console.error("Error in POST /tasks:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { id } = req.params;
  const { title, status, dueDate, priority } = req.body || {};
  const data: any = {};

  if (typeof title === "string" && title.trim().length > 0) {
    data.title = title.trim();
  }

  if (
    status === "todo" ||
    status === "in_progress" ||
    status === "done"
  ) {
    data.status = status;
  }

  if (priority !== undefined) {
    data.priority = normalizePriority(priority);
  }

  if (dueDate !== undefined) {
    data.dueDate = parseDueDate(dueDate);
  }

  try {
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

    return res.json(mapTask(updated));
  } catch (error) {
    console.error("Error in PUT /tasks/:id:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

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
  } catch (error) {
    console.error("Error in DELETE /tasks/:id:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { router as tasksRouter };
