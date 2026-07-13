interface SortableDocument {
  isPinned: boolean;
  createdAt: string;
  updatedAt?: string | null;
}

export function sortDocumentsByPinnedThenUpdated<
  T extends SortableDocument,
>(documents: T[]): T[] {
  return [...documents].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }

    const leftTime = new Date(
      left.updatedAt || left.createdAt
    ).getTime();
    const rightTime = new Date(
      right.updatedAt || right.createdAt
    ).getTime();

    return rightTime - leftTime;
  });
}

