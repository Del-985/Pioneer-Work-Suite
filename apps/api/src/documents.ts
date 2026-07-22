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

export interface DocumentResponse {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  isFavorite: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function mapDocument(doc: any): DocumentResponse {
  const toIso = (value: unknown): string =>
    value instanceof Date ? value.toISOString() : String(value);
  return {
    id: String(doc.id),
    title: String(doc.title),
    content: String(doc.content ?? ""),
    isPinned: Boolean(doc.isPinned),
    isFavorite: Boolean(doc.isFavorite),
    version: Number(doc.version) || 1,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  };
}

router.get("/", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  try {
    const docs = await prisma.document.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });
    return res.json(docs.map(mapDocument));
  } catch (error) {
    console.error("Error in GET /documents:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  const { title, content, isPinned, isFavorite } = req.body || {};
  const finalTitle = typeof title === "string" && title.trim() ? title.trim() : "Untitled document";
  if (finalTitle.length > 240) {
    return res.status(400).json({ error: "Document title is too long" });
  }
  if (content !== undefined && typeof content !== "string") {
    return res.status(400).json({ error: "Document content must be text" });
  }
  if (typeof content === "string" && content.length > 1_500_000) {
    return res.status(413).json({ error: "Document content is too large" });
  }

  try {
    const key = readIdempotencyKey(req);
    const result = await runIdempotentMutation<DocumentResponse>({
      userId: user.id,
      scope: "documents:create",
      key,
      work: async (tx) => {
        const created = await tx.document.create({
          data: {
            userId: user.id,
            title: finalTitle,
            content: typeof content === "string" ? content : "",
            isPinned: Boolean(isPinned),
            isFavorite: Boolean(isFavorite),
          },
        });
        await recordSyncChange(tx, user.id, "document", created.id, "upsert");
        return { statusCode: 201, body: mapDocument(created) };
      },
    });
    if (result.replayed) res.setHeader("idempotency-replayed", "true");
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return sendMutationError(error, res, "Error in POST /documents:");
  }
});

router.get("/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  try {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, userId: user.id, deletedAt: null },
    });
    if (!doc) return res.status(404).json({ error: "Document not found" });
    return res.json(mapDocument(doc));
  } catch (error) {
    console.error("Error in GET /documents/:id:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  const { title, content, isPinned, isFavorite } = req.body || {};
  const data: any = {};
  if (typeof title === "string" && title.trim()) data.title = title.trim();
  if (typeof data.title === "string" && data.title.length > 240) {
    return res.status(400).json({ error: "Document title is too long" });
  }
  if (content !== undefined && typeof content !== "string") {
    return res.status(400).json({ error: "Document content must be text" });
  }
  if (typeof content === "string") {
    if (content.length > 1_500_000) {
      return res.status(413).json({ error: "Document content is too large" });
    }
    data.content = content;
  }
  if (typeof isPinned === "boolean") data.isPinned = isPinned;
  if (typeof isFavorite === "boolean") data.isFavorite = isFavorite;

  try {
    const key = readIdempotencyKey(req);
    const expectedVersion = readExpectedVersion(req);
    const result = await runIdempotentMutation<DocumentResponse>({
      userId: user.id,
      scope: `documents:update:${req.params.id}`,
      key,
      work: async (tx) => {
        const existing = await tx.document.findFirst({
          where: { id: req.params.id, userId: user.id, deletedAt: null },
        });
        if (!existing) throw new ApiMutationError(404, { error: "Document not found" });
        const version = expectedVersion ?? existing.version;
        const update = await tx.document.updateMany({
          where: { id: existing.id, userId: user.id, deletedAt: null, version },
          data: { ...data, version: { increment: 1 } },
        });
        if (update.count !== 1) {
          const current = await tx.document.findFirst({ where: { id: existing.id, userId: user.id } });
          throw new ApiMutationError(409, {
            error: "Document changed on another device",
            code: "VERSION_CONFLICT",
            current: current && !current.deletedAt ? mapDocument(current) : null,
          });
        }
        const updated = await tx.document.findUniqueOrThrow({ where: { id: existing.id } });
        await recordSyncChange(tx, user.id, "document", updated.id, "upsert");
        return { statusCode: 200, body: mapDocument(updated) };
      },
    });
    if (result.replayed) res.setHeader("idempotency-replayed", "true");
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return sendMutationError(error, res, "Error in PUT /documents/:id:");
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
      scope: `documents:delete:${req.params.id}`,
      key,
      work: async (tx) => {
        const existing = await tx.document.findFirst({
          where: { id: req.params.id, userId: user.id },
        });
        if (!existing || existing.deletedAt) return { statusCode: 204, body: {} };
        const version = expectedVersion ?? existing.version;
        const update = await tx.document.updateMany({
          where: { id: existing.id, userId: user.id, deletedAt: null, version },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        if (update.count !== 1) {
          const current = await tx.document.findFirst({ where: { id: existing.id, userId: user.id } });
          throw new ApiMutationError(409, {
            error: "Document changed on another device",
            code: "VERSION_CONFLICT",
            current: current && !current.deletedAt ? mapDocument(current) : null,
          });
        }
        await recordSyncChange(tx, user.id, "document", existing.id, "delete");
        return { statusCode: 204, body: {} };
      },
    });
    if (result.replayed) res.setHeader("idempotency-replayed", "true");
    return res.status(204).send();
  } catch (error) {
    return sendMutationError(error, res, "Error in DELETE /documents/:id:");
  }
});

export { router as documentsRouter };
