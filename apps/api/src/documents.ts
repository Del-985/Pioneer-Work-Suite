// apps/api/src/documents.ts
import express, { Request, Response } from "express";
import { authMiddleware } from "./auth";

const router = express.Router();

interface Document {
  id: string;
  ownerId: string;
  title: string;
  content: string;
  updatedAt: string; // ISO string
}

// In-memory document store (per-user via ownerId)
const documents: Document[] = [];
let docIdCounter = 1;

// Helper: get current user id or send 401 and return null
function getCurrentUserId(req: Request, res: Response): string | null {
  const user = (req as any).user as { id: string } | undefined;
  if (!user) {
    res.status(401).json({ error: "Unauthenticated" });
    return null;
  }
  return user.id;
}

// Apply auth to all /documents routes
router.use(authMiddleware);

// GET /documents
// List current student's documents
router.get("/", (req, res) => {
  const userId = getCurrentUserId(req, res);
  if (!userId) return;

  const userDocs = documents.filter((doc) => doc.ownerId === userId);
  return res.json(userDocs);
});

// POST /documents
// Create a new document
router.post("/", (req, res) => {
  const userId = getCurrentUserId(req, res);
  if (!userId) return;

  const { title, content } = req.body || {};

  const docTitle =
    title && String(title).trim().length > 0 ? String(title) : "Untitled";
  const docContent = typeof content === "string" ? content : "";

  const now = new Date().toISOString();

  const doc: Document = {
    id: String(docIdCounter++),
    ownerId: userId,
    title: docTitle,
    content: docContent,
    updatedAt: now,
  };

  documents.push(doc);

  return res.status(201).json(doc);
});

// GET /documents/:id
router.get("/:id", (req, res) => {
  const userId = getCurrentUserId(req, res);
  if (!userId) return;

  const id = req.params.id;
  const doc = documents.find((d) => d.id === id && d.ownerId === userId);

  if (!doc) {
    return res.status(404).json({ error: "Document not found" });
  }

  return res.json(doc);
});

// PUT /documents/:id
// Partial update: title and/or content
router.put("/:id", (req, res) => {
  const userId = getCurrentUserId(req, res);
  if (!userId) return;

  const id = req.params.id;
  const doc = documents.find((d) => d.id === id && d.ownerId === userId);

  if (!doc) {
    return res.status(404).json({ error: "Document not found" });
  }

  const { title, content } = req.body || {};

  if (typeof title === "string") {
    doc.title = title;
  }
  if (typeof content === "string") {
    doc.content = content;
  }

  doc.updatedAt = new Date().toISOString();

  return res.json(doc);
});

// DELETE /documents/:id
router.delete("/:id", (req, res) => {
  const userId = getCurrentUserId(req, res);
  if (!userId) return;

  const id = req.params.id;
  const index = documents.findIndex(
    (d) => d.id === id && d.ownerId === userId
  );

  if (index === -1) {
    return res.status(404).json({ error: "Document not found" });
  }

  documents.splice(index, 1);

  return res.status(204).send();
});

export { router as documentsRouter };