import {
  deleteStoredDocumentRecovery,
  readStoredDocumentRecovery,
  writeStoredDocumentRecovery,
} from "../api/storage";
import { developerLogger } from "../developer/logger";

export interface DocumentRecoveryDraft {
  schemaVersion: 1;
  documentId: string;
  title: string;
  content: string;
  baseUpdatedAt: string | null;
  capturedAt: string;
}

function isRecoveryDraft(
  value: unknown,
  documentId: string
): value is DocumentRecoveryDraft {
  if (!value || typeof value !== "object") return false;

  const draft = value as Partial<DocumentRecoveryDraft>;
  return (
    draft.schemaVersion === 1 &&
    draft.documentId === documentId &&
    typeof draft.title === "string" &&
    typeof draft.content === "string" &&
    (draft.baseUpdatedAt === null ||
      typeof draft.baseUpdatedAt === "string") &&
    typeof draft.capturedAt === "string" &&
    !Number.isNaN(new Date(draft.capturedAt).getTime())
  );
}

export async function readDocumentRecoveryDraft(
  documentId: string
): Promise<DocumentRecoveryDraft | null> {
  try {
    const value = await readStoredDocumentRecovery<unknown>(documentId);

    if (value === null) return null;
    if (isRecoveryDraft(value, documentId)) return value;

    developerLogger.warning(
      "recovery.document",
      "Discarding malformed document recovery metadata",
      { documentId }
    );
    await deleteStoredDocumentRecovery(documentId);
    return null;
  } catch (error) {
    developerLogger.error(
      "recovery.document",
      "Unable to read a document recovery snapshot",
      { documentId, error }
    );
    throw error;
  }
}

export async function writeDocumentRecoveryDraft(
  draft: DocumentRecoveryDraft
): Promise<void> {
  try {
    await writeStoredDocumentRecovery(draft.documentId, draft);
  } catch (error) {
    developerLogger.error(
      "recovery.document",
      "Unable to write a document recovery snapshot",
      { documentId: draft.documentId, error }
    );
    throw error;
  }
}

export async function deleteDocumentRecoveryDraft(
  documentId: string
): Promise<void> {
  try {
    await deleteStoredDocumentRecovery(documentId);
  } catch (error) {
    developerLogger.error(
      "recovery.document",
      "Unable to remove a document recovery snapshot",
      { documentId, error }
    );
    throw error;
  }
}
