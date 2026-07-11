// apps/web/src/search/searchTypes.ts

export type SearchResultKind = "task" | "document";

export interface SearchResult {
  id: string;
  kind: SearchResultKind;
  title: string;
  subtitle: string;
  preview: string;
  score: number;
  route: string;
}

export interface SearchSnapshot {
  results: SearchResult[];
  taskCount: number;
  documentCount: number;
}