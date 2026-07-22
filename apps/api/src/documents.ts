// apps/api/src/documents.ts
import express from "express";
import { authMiddleware, User } from "./auth";
import { prisma } from "./prisma";

const router = express.Router();

// All /documents routes require authentication
router.use(authMiddleware);

interface DocumentResponse {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

function mapDocument(doc: any): DocumentResponse {
  return {
    id: doc.id,
    title: doc.title,
    content: doc.content ?? "",
    isPinned: Boolean(doc.isPinned),
    isFavorite: Boolean(doc.isFavorite),
    createdAt:
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : String(doc.createdAt),
    updatedAt:
      doc.updatedAt instanceof Date
        ? doc.updatedAt.toISOString()
        : String(doc.updatedAt),
  };
}

// GET /documents - list documents for current user
router.get("/", async (req, res) => {
  const user = (req as any).user as User | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  try {
    const docs = await prisma.document.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });

    const mapped = docs.map(mapDocument);
    // Return raw array (frontend can also handle { documents: [...] } if needed)
    return res.json(mapped);
  } catch (err) {
    console.error("Error in GET /documents:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /documents - create new doc (empty content by default)
router.post("/", async (req, res) => {
  const user = (req as any).user as User | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { title, content, isPinned, isFavorite } = req.body || {};
  const finalTitle =
    typeof title === "string" && title.trim().length > 0
      ? title.trim()
      : "Untitled document";
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
    const created = await prisma.document.create({
      data: {
        userId: user.id,
        title: finalTitle,
        content: typeof content === "string" ? content : "",
        isPinned: Boolean(isPinned),
        isFavorite: Boolean(isFavorite),
      },
    });

    const mapped = mapDocument(created);
    // Flexible: frontend can treat this as either { document } or bare object
    return res.status(201).json(mapped);
  } catch (err) {
    console.error("Error in POST /documents:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /documents/:id - fetch a single document (with full content)
router.get("/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { id } = req.params;

  try {
    const doc = await prisma.document.findFirst({
      where: { id, userId: user.id },
    });

    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    const mapped = mapDocument(doc);
    return res.json(mapped);
  } catch (err) {
    console.error("Error in GET /documents/:id:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /documents/:id - update title/content
router.put("/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { id } = req.params;
  const { title, content, isPinned, isFavorite } = req.body || {};

  const data: any = {};
  if (typeof title === "string" && title.trim().length > 0) {
    data.title = title.trim();
  }
  if (typeof data.title === "string" && data.title.length > 240) {
    return res.status(400).json({ error: "Document title is too long" });
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
    const existing = await prisma.document.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    const updated = await prisma.document.update({
      where: { id: existing.id },
      data,
    });

    const mapped = mapDocument(updated);
    return res.json(mapped);
  } catch (err) {
    console.error("Error in PUT /documents/:id:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /documents/:id - delete a document
router.delete("/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { id } = req.params;

  try {
    const existing = await prisma.document.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    await prisma.document.delete({
      where: { id: existing.id },
    });

    return res.status(204).send();
  } catch (err) {
    console.error("Error in DELETE /documents/:id:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { router as documentsRouter };
