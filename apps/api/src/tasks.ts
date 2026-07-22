import express from "express";
import { authMiddleware, User } from "./auth";
import { prisma } from "./prisma";
import {
  ApiMutationError,
  readExpectedVersion,
  readIdempotencyKey,
  recordSyncChange,
  runIdempotentMutation,
  sendMutationError,
} from "./syncMutation";

const router = express.Router();
router.use(authMiddleware);

type TaskStatus = "todo" | "in_progress" | "done";
type TaskPriority = "critical" | "high" | "medium" | "low";

export interface TaskResponse {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  dueDate: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function normalizePriority(input: unknown): TaskPriority {
  const value = String(input ?? "").trim().toLowerCase();
  return value === "critical" || value === "high" || value === "low"
    ? value
    : "medium";
}

function normalizeStatus(input: unknown): TaskStatus {
  return input === "in_progress" || input === "done" ? input : "todo";
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

function hasInvalidDate(input: unknown): boolean {
  return input !== null && input !== undefined && input !== "" && parseDate(input) === null;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function mapTask(task: any): TaskResponse {
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
    version: Number(task.version) || 1,
    createdAt: toIso(task.createdAt) ?? new Date().toISOString(),
    updatedAt: toIso(task.updatedAt) ?? new Date().toISOString(),
  };
}

router.get("/", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  try {
    const tasks = await prisma.task.findMany({
      where: { userId: user.id, deletedAt: null },
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

  const { title, description, status, dueDate, priority, tags } = req.body || {};
  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Title is required" });
  }
  if (title.trim().length > 240) {
    return res.status(400).json({ error: "Task title is too long" });
  }
  if (typeof description === "string" && description.length > 20_000) {
    return res.status(413).json({ error: "Task description is too large" });
  }
  if (hasInvalidDate(dueDate)) {
    return res.status(400).json({ error: "Invalid task due date" });
  }

  try {
    const key = readIdempotencyKey(req);
    const statusValue = normalizeStatus(status);
    const result = await runIdempotentMutation<TaskResponse>({
      userId: user.id,
      scope: "tasks:create",
      key,
      work: async (tx) => {
        const created = await tx.task.create({
          data: {
            userId: user.id,
            title: title.trim(),
            description: typeof description === "string" ? description.trim() : "",
            status: statusValue,
            priority: normalizePriority(priority),
            tags: normalizeTags(tags),
            dueDate: parseDate(dueDate),
            completedAt: statusValue === "done" ? new Date() : null,
          },
        });
        await recordSyncChange(tx, user.id, "task", created.id, "upsert");
        return { statusCode: 201, body: mapTask(created) };
      },
    });
    if (result.replayed) res.setHeader("idempotency-replayed", "true");
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return sendMutationError(error, res, "Error in POST /tasks:");
  }
});

router.put("/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  const patch = req.body || {};
  const data: any = {};
  if (typeof patch.title === "string" && patch.title.trim()) {
    if (patch.title.trim().length > 240) {
      return res.status(400).json({ error: "Task title is too long" });
    }
    data.title = patch.title.trim();
  }
  if (typeof patch.description === "string") {
    if (patch.description.length > 20_000) {
      return res.status(413).json({ error: "Task description is too large" });
    }
    data.description = patch.description.trim();
  }
  if (patch.priority !== undefined) data.priority = normalizePriority(patch.priority);
  if (patch.tags !== undefined) data.tags = normalizeTags(patch.tags);
  if (patch.dueDate !== undefined) {
    if (hasInvalidDate(patch.dueDate)) {
      return res.status(400).json({ error: "Invalid task due date" });
    }
    data.dueDate = parseDate(patch.dueDate);
  }
  if (patch.archivedAt !== undefined) {
    if (hasInvalidDate(patch.archivedAt)) {
      return res.status(400).json({ error: "Invalid task archive date" });
    }
    data.archivedAt = parseDate(patch.archivedAt);
  }

  try {
    const key = readIdempotencyKey(req);
    const expectedVersion = readExpectedVersion(req);
    const result = await runIdempotentMutation<TaskResponse>({
      userId: user.id,
      scope: `tasks:update:${req.params.id}`,
      key,
      work: async (tx) => {
        const existing = await tx.task.findFirst({
          where: { id: req.params.id, userId: user.id, deletedAt: null },
        });
        if (!existing) throw new ApiMutationError(404, { error: "Task not found" });

        if (patch.status === "todo" || patch.status === "in_progress" || patch.status === "done") {
          data.status = patch.status;
          data.completedAt = patch.status === "done" ? existing.completedAt ?? new Date() : null;
        }
        const version = expectedVersion ?? existing.version;
        const update = await tx.task.updateMany({
          where: { id: existing.id, userId: user.id, deletedAt: null, version },
          data: { ...data, version: { increment: 1 } },
        });
        if (update.count !== 1) {
          const current = await tx.task.findFirst({ where: { id: existing.id, userId: user.id } });
          throw new ApiMutationError(409, {
            error: "Task changed on another device",
            code: "VERSION_CONFLICT",
            current: current && !current.deletedAt ? mapTask(current) : null,
          });
        }
        const updated = await tx.task.findUniqueOrThrow({ where: { id: existing.id } });
        await recordSyncChange(tx, user.id, "task", updated.id, "upsert");
        return { statusCode: 200, body: mapTask(updated) };
      },
    });
    if (result.replayed) res.setHeader("idempotency-replayed", "true");
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return sendMutationError(error, res, "Error in PUT /tasks/:id:");
  }
});

router.delete("/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  try {
    const key = readIdempotencyKey(req);
    const expectedVersion = readExpectedVersion(req);
    const result = await runIdempotentMutation<Record<string, never>>({
      userId: user.id,
      scope: `tasks:delete:${req.params.id}`,
      key,
      work: async (tx) => {
        const existing = await tx.task.findFirst({
          where: { id: req.params.id, userId: user.id },
        });
        if (!existing || existing.deletedAt) return { statusCode: 204, body: {} };
        const version = expectedVersion ?? existing.version;
        const update = await tx.task.updateMany({
          where: { id: existing.id, userId: user.id, deletedAt: null, version },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        if (update.count !== 1) {
          const current = await tx.task.findFirst({ where: { id: existing.id, userId: user.id } });
          throw new ApiMutationError(409, {
            error: "Task changed on another device",
            code: "VERSION_CONFLICT",
            current: current && !current.deletedAt ? mapTask(current) : null,
          });
        }
        await recordSyncChange(tx, user.id, "task", existing.id, "delete");
        return { statusCode: 204, body: {} };
      },
    });
    if (result.replayed) res.setHeader("idempotency-replayed", "true");
    return res.status(204).send();
  } catch (error) {
    return sendMutationError(error, res, "Error in DELETE /tasks/:id:");
  }
});

export { router as tasksRouter };
