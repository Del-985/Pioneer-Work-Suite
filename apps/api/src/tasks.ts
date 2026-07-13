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
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  dueDate: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function normalizePriority(input: unknown): TaskPriority {
  const value = String(input ?? "").trim().toLowerCase();

  if (
    value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low"
  ) {
    return value;
  }

  return value === "normal" ? "medium" : "medium";
}

function normalizeStatus(input: unknown): TaskStatus {
  return input === "in_progress" || input === "done"
    ? input
    : "todo";
}

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  return [...new Set(
    input
      .map((tag) => String(tag).trim())
      .filter(Boolean)
      .map((tag) => tag.slice(0, 40))
  )].slice(0, 50);
}

function parseDate(input: unknown): Date | null {
  if (input === null || input === undefined || input === "") return null;
  const value = String(input).trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapTask(task: any): TaskResponse {
  return {
    id: String(task.id),
    title: String(task.title ?? ""),
    description: String(task.description ?? ""),
    status: normalizeStatus(task.status),
    priority: normalizePriority(task.priority),
    tags: normalizeTags(task.tags),
    dueDate: toIso(task.dueDate),
    completedAt: toIso(task.completedAt),
    archivedAt: toIso(task.archivedAt),
    createdAt: toIso(task.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(task.updatedAt) ?? new Date().toISOString(),
  };
}

router.get("/", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

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
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  const {
    title,
    description,
    status,
    dueDate,
    priority,
    tags,
  } = req.body || {};

  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Title is required" });
  }

  const statusValue = normalizeStatus(status);

  try {
    const created = await prisma.task.create({
      data: {
        userId: user.id,
        title: title.trim(),
        description:
          typeof description === "string" ? description.trim() : "",
        status: statusValue,
        priority: normalizePriority(priority),
        tags: normalizeTags(tags),
        dueDate: parseDate(dueDate),
        completedAt: statusValue === "done" ? new Date() : null,
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
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  const existing = await prisma.task.findFirst({
    where: { id: req.params.id, userId: user.id },
  });

  if (!existing) return res.status(404).json({ error: "Task not found" });

  const patch = req.body || {};
  const data: any = {};

  if (typeof patch.title === "string" && patch.title.trim()) {
    data.title = patch.title.trim();
  }
  if (typeof patch.description === "string") {
    data.description = patch.description.trim();
  }
  if (patch.priority !== undefined) {
    data.priority = normalizePriority(patch.priority);
  }
  if (patch.tags !== undefined) {
    data.tags = normalizeTags(patch.tags);
  }
  if (patch.dueDate !== undefined) {
    data.dueDate = parseDate(patch.dueDate);
  }
  if (
    patch.status === "todo" ||
    patch.status === "in_progress" ||
    patch.status === "done"
  ) {
    data.status = patch.status;
    data.completedAt =
      patch.status === "done"
        ? existing.completedAt ?? new Date()
        : null;
  }
  if (patch.archivedAt !== undefined) {
    data.archivedAt = parseDate(patch.archivedAt);
  }

  try {
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
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  try {
    const existing = await prisma.task.findFirst({
      where: { id: req.params.id, userId: user.id },
    });
    if (!existing) return res.status(404).json({ error: "Task not found" });
    await prisma.task.delete({ where: { id: existing.id } });
    return res.status(204).send();
  } catch (error) {
    console.error("Error in DELETE /tasks/:id:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { router as tasksRouter };
