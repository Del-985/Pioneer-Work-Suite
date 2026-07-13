// apps/web/src/components/GlobalSearch.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchWorkspace } from "../search/searchIndex";
import type {
  SearchResult,
  SearchResultKind,
  SearchSnapshot,
} from "../search/searchTypes";
import { useAccessibleDialog } from "../hooks/useAccessibleDialog";
import { toast } from "../toasts/toastStore";
import "../styles/global-search.css";

const GLOBAL_SEARCH_OPEN_EVENT = "pioneer:open-global-search";

export function openGlobalSearch(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(GLOBAL_SEARCH_OPEN_EVENT));
  }
}

type SearchFilter = "all" | SearchResultKind;

const EMPTY: SearchSnapshot = {
  results: [],
  taskCount: 0,
  documentCount: 0,
};

const GlobalSearch: React.FC = () => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const requestRef = useRef(0);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [snapshot, setSnapshot] = useState<SearchSnapshot>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const visibleResults = useMemo(
    () =>
      filter === "all"
        ? snapshot.results
        : snapshot.results.filter((result) => result.kind === filter),
    [filter, snapshot.results]
  );

  useEffect(() => {
    const show = () => {
      setOpen(true);
      setError(null);
      window.setTimeout(
        () => inputRef.current?.focus(),
        0
      );
    };

    window.addEventListener(
      GLOBAL_SEARCH_OPEN_EVENT,
      show
    );

    return () => {
      window.removeEventListener(
        GLOBAL_SEARCH_OPEN_EVENT,
        show
      );
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();
    const requestId = ++requestRef.current;
    setActiveIndex(0);

    if (!trimmed) {
      setSnapshot(EMPTY);
      setLoading(false);
      setError(null);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await searchWorkspace(trimmed);
        if (requestRef.current === requestId) {
          setSnapshot(result);
        }
      } catch (searchError) {
        console.error("Global search failed:", searchError);
        toast.error("Search unavailable", {
          description: "Pioneer could not search the local workspace.",
        });
        if (requestRef.current === requestId) {
          setSnapshot(EMPTY);
          setError("Unable to search the workspace.");
        }
      } finally {
        if (requestRef.current === requestId) {
          setLoading(false);
        }
      }
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [open, query]);

  useAccessibleDialog({
    open,
    containerRef: dialogRef,
    initialFocusRef: inputRef,
    onClose: close,
    source: "accessibility.global-search",
  });

  function close(): void {
    setOpen(false);
    setQuery("");
    setFilter("all");
    setSnapshot(EMPTY);
    setError(null);
    setActiveIndex(0);
  }

  function choose(result: SearchResult): void {
    close();
    navigate(result.route);
  }

  function handleKeyDown(event: React.KeyboardEvent): void {
    if (visibleResults.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % visibleResults.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (current) =>
          (current - 1 + visibleResults.length) % visibleResults.length
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const result = visibleResults[activeIndex];
      if (result) choose(result);
    }
  }

  if (!open) return null;

  return (
    <div
      className="global-search-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        ref={dialogRef}
        className="global-search"
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-search-title"
        aria-describedby="global-search-description"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="global-search__header">
          <div>
            <p id="global-search-description">Workspace search</p>
            <h2 id="global-search-title">Search everything</h2>
          </div>
          <button type="button" onClick={close} aria-label="Close search">
            ×
          </button>
        </header>

        <div className="global-search__input-row">
          <span aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks and documents"
            aria-label="Search tasks and documents"
            autoComplete="off"
          />
          <kbd>Ctrl K</kbd>
        </div>

        <nav className="global-search__filters" aria-label="Result type">
          {[
            ["all", "All", snapshot.results.length],
            ["task", "Tasks", snapshot.taskCount],
            ["document", "Documents", snapshot.documentCount],
          ].map(([value, label, count]) => (
            <button
              key={String(value)}
              type="button"
              className={filter === value ? "is-active" : ""}
              onClick={() => setFilter(value as SearchFilter)}
            >
              {label} <small>{count}</small>
            </button>
          ))}
        </nav>

        <div
          className="global-search__results"
          role="listbox"
          aria-label={`${visibleResults.length} search results`}
          aria-busy={loading}
        >
          {!query.trim() ? (
            <Empty
              title="Start typing to search"
              detail="Search task titles, priorities, statuses, due dates, document titles, and document content."
            />
          ) : loading ? (
            <div className="global-search__loading" aria-label="Searching">
              <span />
              <span />
              <span />
            </div>
          ) : error ? (
            <Empty title="Search unavailable" detail={error} error />
          ) : visibleResults.length === 0 ? (
            <Empty
              title="No matching results"
              detail={`Nothing matched “${query.trim()}”.`}
            />
          ) : (
            visibleResults.map((result, index) => (
              <button
                key={`${result.kind}:${result.id}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={
                  index === activeIndex
                    ? "global-search__result is-active"
                    : "global-search__result"
                }
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(result)}
              >
                <span className={`global-search__kind kind-${result.kind}`}>
                  {result.kind === "task" ? "Task" : "Document"}
                </span>
                <span className="global-search__result-main">
                  <strong>{result.title}</strong>
                  <small>{result.subtitle}</small>
                  {result.preview && (
                    <span className="global-search__preview">
                      {result.preview}
                    </span>
                  )}
                </span>
                <span aria-hidden="true">→</span>
              </button>
            ))
          )}
        </div>

        <footer className="global-search__footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span><kbd>Enter</kbd> Open</span>
          <span><kbd>Esc</kbd> Close</span>
        </footer>
      </section>
    </div>
  );
};

const Empty: React.FC<{
  title: string;
  detail: string;
  error?: boolean;
}> = ({ title, detail, error = false }) => (
  <div className={error ? "global-search__empty is-error" : "global-search__empty"}>
    <strong>{title}</strong>
    <p>{detail}</p>
  </div>
);

export default GlobalSearch;

