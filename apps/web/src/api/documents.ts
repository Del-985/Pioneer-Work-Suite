// apps/web/src/api/documents.ts
import { http } from "./http";

export interface Document {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * GET /documents
 */
export async function fetchDocuments(): Promise<Document[]> {
  const { data } = await http.get("/documents");

  // Backend returns { documents: [...] }
  if (data && Array.isArray(data.documents)) {
    return data.documents as Document[];
  }

  // Fallback if backend ever returns bare array
  if (Array.isArray(data)) {
    return data as Document[];
  }

  return [];
}

/**
 * POST /documents
 */
export async function createDocument(
  title: string,
  content: string = ""
): Promise<Document> {
  const { data } = await http.post("/documents", { title, content });

  // Expecting { document: {...} }
  if (data && data.document) {
    return data.document as Document;
  }

  return data as Document;
}

/**
 * GET /documents/:id
 */
export async function fetchDocument(id: string): Promise<Document> {
  const { data } = await http.get(`/documents/${id}`);

  if (data && data.document) {
    return data.document as Document;
  }

  return data as Document;
}

/**
 * PUT /documents/:id
 */
export async function updateDocument(
  id: string,
  updates: Partial<Pick<Document, "title" | "content">>
): Promise<Document> {
  const { data } = await http.put(`/documents/${id}`, updates);

  if (data && data.document) {
    return data.document as Document;
  }

  return data as Document;
}

/**
 * DELETE /documents/:id
 */
export async function deleteDocument(id: string): Promise<void> {
  await http.delete(`/documents/${id}`);
}