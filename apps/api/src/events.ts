// apps/api/src/events.ts
import express from "express";
import { authMiddleware, User } from "./auth";
import { prisma } from "./prisma";

const router = express.Router();

// All /events routes require authentication
router.use(authMiddleware);

type EventKind = string; // keep free-form for now

interface EventResponse {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
  kind: EventKind;
  createdAt: string;
  updatedAt: string;
}

// Helper: map Prisma Event -> API shape
function mapEvent(ev: any): EventResponse {
  const toIso = (value: any): string =>
    value instanceof Date ? value.toISOString() : String(value);

  return {
    id: ev.id,
    title: ev.title,
    description: ev.description ?? "",
    start: toIso(ev.start),
    end: toIso(ev.end),
    allDay: Boolean(ev.allDay),
    kind: (ev.kind as EventKind) || "event",
    createdAt: toIso(ev.createdAt),
    updatedAt: toIso(ev.updatedAt),
  };
}

function parseDateParam(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// GET /events
// Optional query: ?from=ISO&to=ISO  (both inclusive start, exclusive end)
router.get("/", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const from = parseDateParam(req.query.from);
  const to = parseDateParam(req.query.to);

  const where: any = { userId: user.id };
  if (from || to) {
    where.start = {};
    if (from) {
      where.start.gte = from;
    }
    if (to) {
      where.start.lt = to;
    }
  }

  try {
    const events = await prisma.event.findMany({
      where,
      orderBy: { start: "asc" },
    });

    return res.json(events.map(mapEvent));
  } catch (err) {
    console.error("Error in GET /events:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /events
router.post("/", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { title, description, start, end, allDay, kind } = req.body || {};

  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "Title is required" });
  }

  const startDate = parseDateParam(start);
  if (!startDate) {
    return res.status(400).json({ error: "Valid start date is required" });
  }

  let endDate = parseDateParam(end) ?? startDate;
  if (endDate < startDate) {
    endDate = startDate;
  }

  const finalAllDay = Boolean(allDay);
  const finalKind: EventKind =
    typeof kind === "string" && kind.trim().length > 0
      ? kind.trim()
      : "event";

  try {
    const created = await prisma.event.create({
      data: {
        userId: user.id,
        title: title.trim(),
        description:
          typeof description === "string" ? description : "",
        start: startDate,
        end: endDate,
        allDay: finalAllDay,
        kind: finalKind,
      },
    });

    return res.status(201).json(mapEvent(created));
  } catch (err) {
    console.error("Error in POST /events:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /events/:id
router.get("/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { id } = req.params;

  try {
    const ev = await prisma.event.findFirst({
      where: { id, userId: user.id },
    });

    if (!ev) {
      return res.status(404).json({ error: "Event not found" });
    }

    return res.json(mapEvent(ev));
  } catch (err) {
    console.error("Error in GET /events/:id:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /events/:id
router.put("/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { id } = req.params;
  const { title, description, start, end, allDay, kind } = req.body || {};

  const data: any = {};

  if (typeof title === "string" && title.trim().length > 0) {
    data.title = title.trim();
  }

  if (typeof description === "string") {
    data.description = description;
  }

  if (start !== undefined) {
    const startDate = parseDateParam(start);
    if (startDate) {
      data.start = startDate;
    }
  }

  if (end !== undefined) {
    const endDate = parseDateParam(end);
    if (endDate) {
      data.end = endDate;
    }
  }

  if (allDay !== undefined) {
    data.allDay = Boolean(allDay);
  }

  if (typeof kind === "string" && kind.trim().length > 0) {
    data.kind = kind.trim();
  }

  try {
    const existing = await prisma.event.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Ensure end >= start if both present in update
    if (data.start && data.end && data.end < data.start) {
      data.end = data.start;
    }

    const updated = await prisma.event.update({
      where: { id: existing.id },
      data,
    });

    return res.json(mapEvent(updated));
  } catch (err) {
    console.error("Error in PUT /events/:id:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /events/:id
router.delete("/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { id } = req.params;

  try {
    const existing = await prisma.event.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return res.status(404).json({ error: "Event not found" });
    }

    await prisma.event.delete({
      where: { id: existing.id },
    });

    return res.status(204).send();
  } catch (err) {
    console.error("Error in DELETE /events/:id:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { router as eventsRouter };