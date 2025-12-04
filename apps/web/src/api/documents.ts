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
 * Very defensive: never throws, returns [] on error.
 */
export async function fetchDocuments(): Promise<Document[]> {
  try {
    const { data } = await http.get("/documents");

    // Backend may return an array directly
    if (Array.isArray(data)) {
      return data as Document[];
    }

    // Or { documents: [...] }
    if (data && Array.isArray((data as any).documents)) {
      return (data as any).documents as Document[];
    }

    console.error("Unexpected /documents response shape:", data);
    return [];
  } catch (err) {
    console.error("fetchDocuments error:", err);
    return [];
  }
}

/**
 * POST /documents
 * Returns the created document, or throws if something is badly wrong.
 */
export async function createDocument(
  title: string,
  content: string = ""
): Promise<Document> {
  const { data } = await http.post("/documents", { title, content });

  // { document: {...} }
  if (data && (data as any).document) {
    return (data as any).document as Document;
  }

  // Or bare document object
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

  if (data && (data as any).document) {
    return (data as any).document as Document;
  }

  return data as Document;
}

/**
 * DELETE /documents/:id
 */
export async function deleteDocument(id: string): Promise<void> {
  await http.delete(`/documents/${id}`);
}