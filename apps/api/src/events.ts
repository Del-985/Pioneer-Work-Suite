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

type EventKind = string;
type EventUrgency = "critical" | "high" | "medium" | "low";

export interface EventResponse {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
  kind: EventKind;
  urgency: EventUrgency | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function parseDateParam(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeUrgency(value: unknown): EventUrgency | null {
  return value === "critical" || value === "high" || value === "medium" || value === "low"
    ? value
    : null;
}

function hasValidUrgency(value: unknown): boolean {
  return value === undefined || value === null || value === "" || normalizeUrgency(value) !== null;
}

export function mapEvent(event: any): EventResponse {
  const toIso = (value: unknown): string =>
    value instanceof Date ? value.toISOString() : String(value);
  return {
    id: String(event.id),
    title: String(event.title),
    description: String(event.description ?? ""),
    start: toIso(event.start),
    end: toIso(event.end),
    allDay: Boolean(event.allDay),
    kind: String(event.kind || "event"),
    urgency: normalizeUrgency(event.urgency),
    version: Number(event.version) || 1,
    createdAt: toIso(event.createdAt),
    updatedAt: toIso(event.updatedAt),
  };
}

router.get("/", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  const from = parseDateParam(req.query.from);
  const to = parseDateParam(req.query.to);
  if (req.query.from !== undefined && !from) return res.status(400).json({ error: "Invalid from date" });
  if (req.query.to !== undefined && !to) return res.status(400).json({ error: "Invalid to date" });
  if (from && to && from >= to) return res.status(400).json({ error: "from must be earlier than to" });

  const where: any = { userId: user.id, deletedAt: null };
  if (from || to) {
    where.AND = [];
    if (from) where.AND.push({ end: { gte: from } });
    if (to) where.AND.push({ start: { lt: to } });
  }

  try {
    const events = await prisma.event.findMany({ where, orderBy: { start: "asc" } });
    return res.json(events.map(mapEvent));
  } catch (error) {
    console.error("Error in GET /events:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  const { title, description, start, end, allDay, kind, urgency } = req.body || {};
  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Title is required" });
  }
  if (title.trim().length > 240) return res.status(400).json({ error: "Event title is too long" });
  if (typeof description === "string" && description.length > 20_000) {
    return res.status(413).json({ error: "Event description is too large" });
  }
  const startDate = parseDateParam(start);
  if (!startDate) return res.status(400).json({ error: "Valid start date is required" });
  const endDate = parseDateParam(end) ?? startDate;
  if (endDate < startDate) return res.status(400).json({ error: "Event end cannot be before its start" });
  const finalKind = typeof kind === "string" && kind.trim() ? kind.trim() : "event";
  if (finalKind.length > 40) return res.status(400).json({ error: "Event kind is too long" });
  if (!hasValidUrgency(urgency)) return res.status(400).json({ error: "Invalid event urgency" });

  try {
    const key = readIdempotencyKey(req);
    const result = await runIdempotentMutation<EventResponse>({
      userId: user.id,
      scope: "events:create",
      key,
      work: async (tx) => {
        const created = await tx.event.create({
          data: {
            userId: user.id,
            title: title.trim(),
            description: typeof description === "string" ? description : "",
            start: startDate,
            end: endDate,
            allDay: Boolean(allDay),
            kind: finalKind,
            urgency: normalizeUrgency(urgency),
          },
        });
        await recordSyncChange(tx, user.id, "event", created.id, "upsert");
        return { statusCode: 201, body: mapEvent(created) };
      },
    });
    if (result.replayed) res.setHeader("idempotency-replayed", "true");
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return sendMutationError(error, res, "Error in POST /events:");
  }
});

router.get("/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) return res.status(401).json({ error: "Unauthenticated" });
  try {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id, userId: user.id, deletedAt: null },
    });
    if (!event) return res.status(404).json({ error: "Event not found" });
    return res.json(mapEvent(event));
  } catch (error) {
    console.error("Error in GET /events/:id:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  const { title, description, start, end, allDay, kind, urgency } = req.body || {};
  const data: any = {};
  if (typeof title === "string" && title.trim()) data.title = title.trim();
  if (typeof data.title === "string" && data.title.length > 240) {
    return res.status(400).json({ error: "Event title is too long" });
  }
  if (typeof description === "string") {
    if (description.length > 20_000) return res.status(413).json({ error: "Event description is too large" });
    data.description = description;
  }
  if (start !== undefined) {
    const parsed = parseDateParam(start);
    if (!parsed) return res.status(400).json({ error: "Invalid start date" });
    data.start = parsed;
  }
  if (end !== undefined) {
    const parsed = parseDateParam(end);
    if (!parsed) return res.status(400).json({ error: "Invalid end date" });
    data.end = parsed;
  }
  if (allDay !== undefined) data.allDay = Boolean(allDay);
  if (typeof kind === "string" && kind.trim()) {
    data.kind = kind.trim();
    if (data.kind.length > 40) return res.status(400).json({ error: "Event kind is too long" });
  }
  if (urgency !== undefined) {
    if (!hasValidUrgency(urgency)) return res.status(400).json({ error: "Invalid event urgency" });
    data.urgency = normalizeUrgency(urgency);
  }

  try {
    const key = readIdempotencyKey(req);
    const expectedVersion = readExpectedVersion(req);
    const result = await runIdempotentMutation<EventResponse>({
      userId: user.id,
      scope: `events:update:${req.params.id}`,
      key,
      work: async (tx) => {
        const existing = await tx.event.findFirst({
          where: { id: req.params.id, userId: user.id, deletedAt: null },
        });
        if (!existing) throw new ApiMutationError(404, { error: "Event not found" });
        const effectiveStart = data.start ?? existing.start;
        const effectiveEnd = data.end ?? existing.end;
        if (effectiveEnd < effectiveStart) {
          throw new ApiMutationError(400, { error: "Event end cannot be before its start" });
        }
        const version = expectedVersion ?? existing.version;
        const update = await tx.event.updateMany({
          where: { id: existing.id, userId: user.id, deletedAt: null, version },
          data: { ...data, version: { increment: 1 } },
        });
        if (update.count !== 1) {
          const current = await tx.event.findFirst({ where: { id: existing.id, userId: user.id } });
          throw new ApiMutationError(409, {
            error: "Event changed on another device",
            code: "VERSION_CONFLICT",
            current: current && !current.deletedAt ? mapEvent(current) : null,
          });
        }
        const updated = await tx.event.findUniqueOrThrow({ where: { id: existing.id } });
        await recordSyncChange(tx, user.id, "event", updated.id, "upsert");
        return { statusCode: 200, body: mapEvent(updated) };
      },
    });
    if (result.replayed) res.setHeader("idempotency-replayed", "true");
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return sendMutationError(error, res, "Error in PUT /events/:id:");
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
      scope: `events:delete:${req.params.id}`,
      key,
      work: async (tx) => {
        const existing = await tx.event.findFirst({
          where: { id: req.params.id, userId: user.id },
        });
        if (!existing || existing.deletedAt) return { statusCode: 204, body: {} };
        const version = expectedVersion ?? existing.version;
        const update = await tx.event.updateMany({
          where: { id: existing.id, userId: user.id, deletedAt: null, version },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        if (update.count !== 1) {
          const current = await tx.event.findFirst({ where: { id: existing.id, userId: user.id } });
          throw new ApiMutationError(409, {
            error: "Event changed on another device",
            code: "VERSION_CONFLICT",
            current: current && !current.deletedAt ? mapEvent(current) : null,
          });
        }
        await recordSyncChange(tx, user.id, "event", existing.id, "delete");
        return { statusCode: 204, body: {} };
      },
    });
    if (result.replayed) res.setHeader("idempotency-replayed", "true");
    return res.status(204).send();
  } catch (error) {
    return sendMutationError(error, res, "Error in DELETE /events/:id:");
  }
});

export { router as eventsRouter };
