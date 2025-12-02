// apps/api/src/documents.ts
import express from "express";
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

// Protect all /documents routes with auth
router.use(authMiddleware);

// GET /documents
// List current student's documents
router.get("/", (req, res) => {
  const user = (req as any).user as { id: string } | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const userDocs = documents.filter((doc) => doc.ownerId === user.id);
  return res.json(userDocs);
});

// POST /documents
// Create a new document
router.post("/", (req, res) => {
  const user = (req as any).user as { id: string } | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { title, content } = req.body || {};

  // Minimal validation for now
  const docTitle = title && String(title).trim().length > 0 ? String(title) : "Untitled";
  const docContent = typeof content === "string" ? content : "";

  const now = new Date().toISOString();

  const doc: Document = {
    id: String(docIdCounter++),
    ownerId: user.id,
    title: docTitle,
    content: docContent,
    updatedAt: now,
  };

  documents.push(doc);

  return res.status(201).json(doc);
});

// Helper to find a doc owned by the current user
function findUserDoc(req: express.Request) {
  const user = (req as any).user as { id: string } | undefined;
  if (!user) return { error: { status: 401, body: { error: "Unauthenticated" } } };

  const id = req.params.id;
  const doc = documents.find((d) => d.id === id && d.ownerId === user.id);
  if (!doc) {
    return { error: { status: 404, body: { error: "Document not found" } } };
  }
  return { user, doc };
}

// GET /documents/:id
router.get("/:id", (req, res) => {
  const result = findUserDoc(req);
  if ("error" in result) {
    return res.status(result.error.status).json(result.error.body);
  }

  return res.json(result.doc);
});

// PUT /documents/:id
// Partial update: title and/or content
router.put("/:id", (req, res) => {
  const result = findUserDoc(req);
  if ("error" in result) {
    return res.status(result.error.status).json(result.error.body);
  }

  const { doc } = result;
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
  const result = findUserDoc(req);
  if ("error" in result) {
    return res.status(result.error.status).json(result.error.body);
  }

  const index = documents.findIndex(
    (d) => d.id === result.doc.id && d.ownerId === result.doc.ownerId
  );
  if (index >= 0) {
    documents.splice(index, 1);
  }

  return res.status(204).send();
});

export { router as documentsRouter };