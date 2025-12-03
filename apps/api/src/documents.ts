// apps/api/src/documents.ts
import express from "express";
import { authMiddleware } from "./auth";

const router = express.Router();

// All documents are per-student in memory for v1

interface Document {
  id: string;
  ownerId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const documents: Document[] = [];
let documentIdCounter = 1;

// Require auth for all /documents routes
router.use(authMiddleware);

// GET /documents - list documents for current user
router.get("/", (req, res) => {
  const user = (req as any).user as { id: string } | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const userDocs = documents.filter((d) => d.ownerId === user.id);
  return res.json({ documents: userDocs });
});

// POST /documents - create a new document
router.post("/", (req, res) => {
  const user = (req as any).user as { id: string } | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { title, content } = req.body || {};

  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "Title is required" });
  }

  const now = new Date().toISOString();

  const doc: Document = {
    id: String(documentIdCounter++),
    ownerId: user.id,
    title: title.trim(),
    content: typeof content === "string" ? content : "",
    createdAt: now,
    updatedAt: now,
  };

  documents.push(doc);

  return res.status(201).json({ document: doc });
});

// GET /documents/:id - get a single document by id
router.get("/:id", (req, res) => {
  const user = (req as any).user as { id: string } | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { id } = req.params;
  const doc = documents.find((d) => d.id === id && d.ownerId === user.id);

  if (!doc) {
    return res.status(404).json({ error: "Document not found" });
  }

  return res.json({ document: doc });
});

// PUT /documents/:id - update title/content
router.put("/:id", (req, res) => {
  const user = (req as any).user as { id: string } | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { id } = req.params;
  const { title, content } = req.body || {};

  const doc = documents.find((d) => d.id === id && d.ownerId === user.id);

  if (!doc) {
    return res.status(404).json({ error: "Document not found" });
  }

  if (typeof title === "string" && title.trim().length > 0) {
    doc.title = title.trim();
  }

  if (typeof content === "string") {
    doc.content = content;
  }

  doc.updatedAt = new Date().toISOString();

  return res.json({ document: doc });
});

// DELETE /documents/:id - delete a document
router.delete("/:id", (req, res) => {
  const user = (req as any).user as { id: string } | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { id } = req.params;

  const index = documents.findIndex(
    (d) => d.id === id && d.ownerId === user.id
  );

  if (index === -1) {
    return res.status(404).json({ error: "Document not found" });
  }

  documents.splice(index, 1);

  return res.status(204).send();
});

export { router as documentsRouter };