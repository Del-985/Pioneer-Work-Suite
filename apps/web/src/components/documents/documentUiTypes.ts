export type DocumentLibraryView =
  | "all"
  | "recent"
  | "pinned"
  | "favorites";

export interface DocumentStatistics {
  words: number;
  characters: number;
  charactersWithoutSpaces: number;
  readingMinutes: number;
  paragraphs: number;
  lines: number;
}

export interface DocumentFindState {
  query: string;
  replacement: string;
  currentIndex: number;
  totalMatches: number;
}
