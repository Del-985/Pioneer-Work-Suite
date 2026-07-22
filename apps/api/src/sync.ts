import express from "express";
import { authMiddleware, User } from "./auth";
import { mapDocument } from "./documents";
import { mapEvent } from "./events";
import { prisma } from "./prisma";
import { mapTask } from "./tasks";

const router = express.Router();
router.use(authMiddleware);

type EntityType = "task" | "document" | "event";

function parseCursor(value: unknown): bigint | null {
  if (value === undefined || value === null || value === "") return 0n;
  const text = String(value).trim();
  if (!/^\d{1,20}$/.test(text)) return null;
  try {
    return BigInt(text);
  } catch {
    return null;
  }
}

router.get("/changes", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  const cursor = parseCursor(req.query.cursor ?? req.query.after);
  if (cursor === null) {
    return res.status(400).json({ error: "Sync cursor must be a non-negative integer" });
  }
  const requestedLimit = Number(req.query.limit ?? 100);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 500)
    : 100;

  try {
    const rows = await prisma.syncChange.findMany({
      where: { userId: user.id, sequence: { gt: cursor } },
      orderBy: { sequence: "asc" },
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const hasMore = rows.length > limit;

    const taskIds = page.filter((row) => row.entityType === "task").map((row) => row.entityId);
    const documentIds = page.filter((row) => row.entityType === "document").map((row) => row.entityId);
    const eventIds = page.filter((row) => row.entityType === "event").map((row) => row.entityId);

    const [tasks, documents, events] = await Promise.all([
      taskIds.length
        ? prisma.task.findMany({ where: { userId: user.id, id: { in: taskIds } } })
        : [],
      documentIds.length
        ? prisma.document.findMany({ where: { userId: user.id, id: { in: documentIds } } })
        : [],
      eventIds.length
        ? prisma.event.findMany({ where: { userId: user.id, id: { in: eventIds } } })
        : [],
    ]);

    const entities = new Map<string, { deleted: boolean; value: unknown }>();
    for (const task of tasks) entities.set(`task:${task.id}`, { deleted: Boolean(task.deletedAt), value: mapTask(task) });
    for (const document of documents) entities.set(`document:${document.id}`, { deleted: Boolean(document.deletedAt), value: mapDocument(document) });
    for (const event of events) entities.set(`event:${event.id}`, { deleted: Boolean(event.deletedAt), value: mapEvent(event) });

    const changes = page.map((row) => {
      const type = row.entityType as EntityType;
      const entity = entities.get(`${type}:${row.entityId}`);
      const deleted = row.operation === "delete" || !entity || entity.deleted;
      return {
        cursor: row.sequence.toString(),
        entityType: type,
        entityId: row.entityId,
        operation: deleted ? "delete" : "upsert",
        entity: deleted ? null : entity.value,
        changedAt: row.changedAt.toISOString(),
      };
    });

    return res.json({
      changes,
      nextCursor: page.length ? page[page.length - 1].sequence.toString() : cursor.toString(),
      hasMore,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in GET /sync/changes:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { router as syncRouter };
