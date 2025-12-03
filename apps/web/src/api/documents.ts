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
 * Backend returns a bare array: Document[]
 */
export async function fetchDocuments(): Promise<Document[]> {
  const { data } = await http.get<Document[]>("/documents");

  if (Array.isArray(data)) {
    return data;
  }

  // Legacy fallback in case backend ever wraps it again
  if ((data as any)?.documents && Array.isArray((data as any).documents)) {
    return (data as any).documents as Document[];
  }

  return [];
}

/**
 * POST /documents
 * Backend returns a single Document object.
 */
export async function createDocument(
  title: string,
  content: string = ""
): Promise<Document> {
  const { data } = await http.post<Document>("/documents", { title, content });
  return data as Document;
}

/**
 * GET /documents/:id
 * Backend returns a single Document object.
 */
export async function fetchDocument(id: string): Promise<Document> {
  const { data } = await http.get<Document>(`/documents/${id}`);
  return data as Document;
}

/**
 * PUT /documents/:id
 * Backend returns the updated Document object.
 */
export async function updateDocument(
  id: string,
  updates: Partial<Pick<Document, "title" | "content">>
): Promise<Document> {
  const { data } = await http.put<Document>(`/documents/${id}`, updates);
  return data as Document;
}

/**
 * DELETE /documents/:id
 */
export async function deleteDocument(id: string): Promise<void> {
  await http.delete(`/documents/${id}`);
}