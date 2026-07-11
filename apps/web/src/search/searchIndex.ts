// apps/web/src/search/searchIndex.ts

import { fetchDocuments } from "../api/documents";
import { fetchTasks } from "../api/tasks";
import {
  htmlToPlainText,
  formatDocumentDate,
} from "../utils/documentText";
import { formatTaskDueDate } from "../utils/taskDates";

import type {
  SearchResult,
  SearchSnapshot,
} from "./searchTypes";

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function tokensFor(query: string): string[] {
  return normalize(query)
    .split(/\s+/)
    .filter(Boolean);
}

function scoreField(
  value: string,
  tokens: string[],
  weight: number
): number {
  const normalized = normalize(value);

  let score = 0;

  for (const token of tokens) {
    if (normalized === token) {
      score += weight * 5;
    } else if (normalized.startsWith(token)) {
      score += weight * 3;
    } else if (normalized.includes(token)) {
      score += weight;
    }
  }

  return score;
}

function matchesAll(
  searchable: string,
  tokens: string[]
): boolean {
  const normalized = normalize(searchable);

  return tokens.every((token) =>
    normalized.includes(token)
  );
}

function buildPreview(
  text: string,
  tokens: string[]
): string {
  const plain = text.replace(/\s+/g, " ").trim();

  if (!plain) {
    return "";
  }

  const normalized = normalize(plain);

  const firstMatch = tokens
    .map((token) => normalized.indexOf(token))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (firstMatch === undefined) {
    return plain.slice(0, 140);
  }

  const start = Math.max(0, firstMatch - 55);
  const end = Math.min(
    plain.length,
    firstMatch + 85
  );

  return `${start > 0 ? "…" : ""}${plain.slice(
    start,
    end
  )}${end < plain.length ? "…" : ""}`;
}

export async function searchWorkspace(
  query: string
): Promise<SearchSnapshot> {
  const tokens = tokensFor(query);

  if (tokens.length === 0) {
    return {
      results: [],
      taskCount: 0,
      documentCount: 0,
    };
  }

  const [tasks, documents] = await Promise.all([
    fetchTasks(),
    fetchDocuments(),
  ]);

  const taskResults: SearchResult[] = tasks
    .filter((task) => {
      const status =
        task.status === "in_progress"
          ? "in progress"
          : task.status === "done"
          ? "completed"
          : "to do";

      const due = task.dueDate
        ? `${formatTaskDueDate(task.dueDate)} ${task.dueDate}`
        : "no due date";

      return matchesAll(
        `${task.title}
         ${task.priority}
         ${status}
         ${due}`,
        tokens
      );
    })
    .map((task) => {
      const status =
        task.status === "in_progress"
          ? "In Progress"
          : task.status === "done"
          ? "Completed"
          : "To Do";

      const due = task.dueDate
        ? formatTaskDueDate(task.dueDate)
        : "No due date";

      return {
        id: task.id,
        kind: "task",

        title: task.title || "Untitled Task",

        subtitle: `${task.priority} • ${status} • ${due}`,

        preview: "",

        score:
          scoreField(task.title, tokens, 18) +
          scoreField(task.priority, tokens, 6) +
          scoreField(status, tokens, 5) +
          scoreField(due, tokens, 4),

        route: `/tasks?task=${encodeURIComponent(
          task.id
        )}`,
      };
    });

  const documentResults: SearchResult[] =
    documents
      .filter((document) => {
        const plainText = htmlToPlainText(
          document.content
        );

        const flags = [
          document.isPinned
            ? "pinned"
            : "",
          document.isFavorite
            ? "favorite"
            : "",
        ].join(" ");

        return matchesAll(
          `${document.title}
           ${plainText}
           ${flags}`,
          tokens
        );
      })
      .map((document) => {
        const plainText = htmlToPlainText(
          document.content
        );

        return {
          id: document.id,

          kind: "document",

          title:
            document.title ||
            "Untitled Document",

          subtitle: `Updated ${formatDocumentDate(
            document.updatedAt ??
              document.createdAt
          )}${
            document.isPinned
              ? " • Pinned"
              : ""
          }${
            document.isFavorite
              ? " • Favorite"
              : ""
          }`,

          preview: buildPreview(
            plainText,
            tokens
          ),

          score:
            scoreField(
              document.title,
              tokens,
              20
            ) +
            scoreField(
              plainText,
              tokens,
              4
            ) +
            (document.isPinned
              ? 3
              : 0) +
            (document.isFavorite
              ? 2
              : 0),

          route: `/documents?document=${encodeURIComponent(
            document.id
          )}`,
        };
      });

  const results = [
    ...taskResults,
    ...documentResults,
  ]
    .sort(
      (left, right) =>
        right.score - left.score
    )
    .slice(0, 60);

  return {
    results,
    taskCount: taskResults.length,
    documentCount:
      documentResults.length,
  };
}