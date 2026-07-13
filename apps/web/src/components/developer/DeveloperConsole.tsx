import React, { useMemo, useState } from "react";

import {
  clearDeveloperLogs,
  formatDeveloperLogEntry,
  isDeveloperLogPersistenceEnabled,
  setDeveloperLogPersistenceEnabled,
} from "../../developer/logger";
import type {
  DeveloperLogLevel,
} from "../../developer/logTypes";
import { useDeveloperLogs } from "../../hooks/useDeveloperLogs";

import "../../styles/developer-console.css";

type LevelFilter = DeveloperLogLevel | "all";

const DeveloperConsole: React.FC = () => {
  const logs = useDeveloperLogs();
  const [level, setLevel] = useState<LevelFilter>("all");
  const [source, setSource] = useState("all");
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [persistenceEnabled, setPersistenceEnabled] = useState(
    isDeveloperLogPersistenceEnabled
  );

  const sources = useMemo(
    () => [...new Set(logs.map((entry) => entry.source))].sort(),
    [logs]
  );

  const visibleLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return logs.filter((entry) => {
      if (level !== "all" && entry.level !== level) return false;
      if (source !== "all" && entry.source !== source) return false;
      if (!normalizedQuery) return true;

      return [
        entry.message,
        entry.details,
        entry.stack,
        entry.source,
      ].some((value) =>
        value?.toLocaleLowerCase().includes(normalizedQuery)
      );
    });
  }, [level, logs, query, source]);

  async function copyEntry(id: string): Promise<void> {
    const entry = logs.find((candidate) => candidate.id === id);
    if (!entry || !navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(
        formatDeveloperLogEntry(entry)
      );
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1_500);
    } catch {
      setCopiedId(null);
    }
  }

  function exportLogs(): void {
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      entryCount: visibleLogs.length,
      entries: visibleLogs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `pioneer-diagnostics-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function togglePersistence(enabled: boolean): void {
    setDeveloperLogPersistenceEnabled(enabled);
    setPersistenceEnabled(enabled);
  }

  function generateTestError(): void {
    window.setTimeout(() => {
      throw new Error(
        "Developer console test error. This error was generated intentionally."
      );
    }, 0);
  }

  return (
    <section
      className="developer-console"
      aria-labelledby="developer-console-title"
    >
      <header className="developer-console__header">
        <div>
          <h3 id="developer-console-title">Developer console</h3>
          <p>
            Sanitized local application errors and warnings. Network traffic
            inspection is deferred to 0.2.0.
          </p>
        </div>
        <span>{logs.length}/500 entries</span>
      </header>

      <div className="developer-console__toolbar">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search diagnostics"
          aria-label="Search developer logs"
        />
        <select
          value={level}
          onChange={(event) =>
            setLevel(event.target.value as LevelFilter)
          }
          aria-label="Filter logs by severity"
        >
          <option value="all">All levels</option>
          <option value="error">Errors</option>
          <option value="warning">Warnings</option>
          <option value="info">Information</option>
        </select>
        <select
          value={source}
          onChange={(event) => setSource(event.target.value)}
          aria-label="Filter logs by source"
        >
          <option value="all">All sources</option>
          {sources.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={exportLogs}
          disabled={visibleLogs.length === 0}
        >
          Export JSON
        </button>
        <button
          className="developer-console__test-error"
          type="button"
          onClick={generateTestError}
          title="Generate a safe asynchronous error to verify logging"
        >
          Test error
        </button>
        <button
          type="button"
          onClick={clearDeveloperLogs}
          disabled={logs.length === 0}
        >
          Clear
        </button>
      </div>

      <label className="developer-console__persistence">
        <input
          type="checkbox"
          checked={persistenceEnabled}
          onChange={(event) =>
            togglePersistence(event.target.checked)
          }
        />
        Persist sanitized logs across application restarts
      </label>

      <div
        className="developer-console__viewport"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {visibleLogs.length === 0 ? (
          <p className="developer-console__empty">
            {logs.length === 0
              ? "No diagnostic entries have been recorded."
              : "No entries match the current filters."}
          </p>
        ) : (
          visibleLogs.map((entry) => (
            <article
              key={entry.id}
              className={`developer-console__entry level-${entry.level}`}
            >
              <header>
                <span>{entry.level}</span>
                <strong>{entry.source}</strong>
                <time dateTime={entry.timestamp}>
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </time>
                <button
                  type="button"
                  onClick={() => void copyEntry(entry.id)}
                >
                  {copiedId === entry.id ? "Copied" : "Copy"}
                </button>
              </header>
              <pre>{entry.message}</pre>
              {(entry.details || entry.stack) && (
                <details>
                  <summary>Technical details</summary>
                  {entry.details && <pre>{entry.details}</pre>}
                  {entry.stack && <pre>{entry.stack}</pre>}
                </details>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
};

export default DeveloperConsole;

