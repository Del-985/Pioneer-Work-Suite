interface SortableDocument {
  isPinned: boolean;
  createdAt: string;
  updatedAt?: string | null;
}

function getDocumentTimestamp(
  document: SortableDocument
): number {
  const timestamp = new Date(
    document.updatedAt || document.createdAt
  ).getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function sortDocumentsByUpdated<
  T extends SortableDocument,
>(documents: T[]): T[] {
  return [...documents].sort(
    (left, right) =>
      getDocumentTimestamp(right) -
      getDocumentTimestamp(left)
  );
}

export function sortDocumentsByPinnedThenUpdated<
  T extends SortableDocument,
>(documents: T[]): T[] {
  return [...documents].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }

    return (
      getDocumentTimestamp(right) -
      getDocumentTimestamp(left)
    );
  });
}

