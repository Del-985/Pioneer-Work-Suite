// apps/web/src/components/RightSidebar.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchTasks,
  Task,
} from "../api/tasks";
import {
  fetchDocuments,
  Document,
} from "../api/documents";

type SidebarMode = "tasks" | "documents";

const RightSidebar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [mode, setMode] = useState<SidebarMode>("tasks");

  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const [docs, setDocs] = useState<Document[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  const navigate = useNavigate();

  // --- Date helpers (same behavior as TasksPage) ---

  function isoToInputValue(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const parts = iso.split("T")[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parts)) return null;
    return parts;
  }

  function isoToLocalDate(iso: string | null | undefined): Date | null {
    const ymd = isoToInputValue(iso);
    if (!ymd) return null;
    const [y, m, d] = ymd.split("-");
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  function formatDueLabel(
    dueDate?: string | null
  ): { label: string; tone: "neutral" | "overdue" | "today" } {
    const local = isoToLocalDate(dueDate || null);
    if (!local) return { label: "No due date", tone: "neutral" };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(
      local.getFullYear(),
      local.getMonth(),
      local.getDate()
    );

    const diffMs = target.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        label: `Overdue (${local.toLocaleDateString()})`,
        tone: "overdue",
      };
    }
    if (diffDays === 0) {
      return { label: "Due today", tone: "today" };
    }
    return {
      label: `Due ${local.toLocaleDateString()}`,
      tone: "neutral",
    };
  }

  // --- Load tasks once (for sidebar) ---

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setTasksLoading(true);
      setTasksError(null);
      try {
        const data = await fetchTasks();
        if (!cancelled) setTasks(data);
      } catch (err) {
        console.error("Sidebar tasks load error:", err);
        if (!cancelled) setTasksError("Unable to load tasks.");
      } finally {
        if (!cancelled) setTasksLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // --- Load documents once (for sidebar docs mode) ---

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setDocsLoading(true);
      setDocsError(null);
      try {
        const data = await fetchDocuments();
        if (!cancelled) setDocs(data);
      } catch (err) {
        console.error("Sidebar docs load error:", err);
        if (!cancelled) setDocsError("Unable to load documents.");
      } finally {
        if (!cancelled) setDocsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // --- Today / overdue radar (for tasks mode) ---

  const { todayCount, overdueCount } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let todayC = 0;
    let overdueC = 0;

    for (const t of tasks) {
      const local = isoToLocalDate(t.dueDate || null);
      if (!local) continue;

      const target = new Date(
        local.getFullYear(),
        local.getMonth(),
        local.getDate()
      );
      const diffMs = target.getTime() - today.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        overdueC += 1;
      } else if (diffDays === 0) {
        todayC += 1;
      }
    }

    return { todayCount: todayC, overdueCount: overdueC };
  }, [tasks]);

  // Sort tasks for sidebar: overdue + today first, then others
  const sortedSidebarTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const da = isoToLocalDate(a.dueDate || null);
      const db = isoToLocalDate(b.dueDate || null);

      // Tasks with due dates first
      if (da && !db) return -1;
      if (!da && db) return 1;
      if (!da && !db) return 0;

      if (!da || !db) return 0;

      return da.getTime() - db.getTime();
    });
  }, [tasks]);

  function renderTasksMode() {
    return (
      <div className="todo-body">
        {/* Radar summary */}
        <div
          style={{
            marginBottom: 10,
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "#050713",
            fontSize: 11,
            display: "flex",
            justifyContent: "space-between",
            gap: 6,
          }}
        >
          <span style={{ color: "#9da2c8" }}>
            Today:{" "}
            <strong style={{ color: "#f5f5f5" }}>{todayCount}</strong>
          </span>
          <span
            style={{
              color: overdueCount > 0 ? "#ff7b88" : "#6f7598",
            }}
          >
            Overdue:{" "}
            <strong>{overdueCount}</strong>
          </span>
        </div>

        {tasksLoading && (
          <p style={{ fontSize: 11, color: "#9da2c8" }}>Loading tasks…</p>
        )}
        {tasksError && (
          <p style={{ fontSize: 11, color: "#ff7b88" }}>{tasksError}</p>
        )}

        {!tasksLoading && !tasksError && tasks.length === 0 && (
          <p style={{ fontSize: 11, color: "#6f7598" }}>
            No tasks yet. Create some on the Tasks page.
          </p>
        )}

        <ul
          className="todo-list"
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {sortedSidebarTasks.slice(0, 12).map((task) => {
            const { label: dueLabel, tone } = formatDueLabel(task.dueDate);
            const dueColor =
              tone === "overdue"
                ? "#ff7b88"
                : tone === "today"
                ? "#f0c36a"
                : "#6f7598";

            return (
              <li
                key={task.id}
                style={{
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.08)",
                  padding: "6px 8px",
                  background: "#050713",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "#f5f5f5",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {task.title}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 10,
                    color: "#6f7598",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      color: dueColor,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {dueLabel}
                  </span>
                  <span
                    style={{
                      padding: "1px 6px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.12)",
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {task.status === "todo"
                      ? "To-Do"
                      : task.status === "in_progress"
                      ? "In Progress"
                      : "Done"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={() => navigate("/tasks")}
          style={{
            marginTop: 10,
            width: "100%",
            padding: "6px 8px",
            borderRadius: 999,
            border: "none",
            fontSize: 11,
            cursor: "pointer",
            background: "rgba(127,61,255,0.9)",
            color: "#ffffff",
            whiteSpace: "nowrap",
          }}
        >
          Open full tasks
        </button>
      </div>
    );
  }

  function renderDocsMode() {
    const recentDocs = docs.slice(0, 10);

    return (
      <div className="todo-body">
        {docsLoading && (
          <p style={{ fontSize: 11, color: "#9da2c8" }}>
            Loading documents…
          </p>
        )}
        {docsError && (
          <p style={{ fontSize: 11, color: "#ff7b88" }}>{docsError}</p>
        )}
        {!docsLoading && !docsError && recentDocs.length === 0 && (
          <p style={{ fontSize: 11, color: "#6f7598" }}>
            No documents yet. Create one on the Documents page.
          </p>
        )}

        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {recentDocs.map((doc) => (
            <li
              key={doc.id}
              style={{
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.08)",
                padding: "6px 8px",
                background: "#050713",
              }}
            >
              <button
                type="button"
                onClick={() => navigate("/documents")}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: "#f5f5f5",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {doc.title || "Untitled document"}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: "#6f7598",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {doc.updatedAt
                    ? new Date(doc.updatedAt).toLocaleDateString()
                    : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => navigate("/documents")}
          style={{
            marginTop: 10,
            width: "100%",
            padding: "6px 8px",
            borderRadius: 999,
            border: "none",
            fontSize: 11,
            cursor: "pointer",
            background: "rgba(127,61,255,0.9)",
            color: "#ffffff",
            whiteSpace: "nowrap",
          }}
        >
          Open documents
        </button>
      </div>
    );
  }

  return (
    <aside
      className={
        "sidebar-right" +
        (isOpen ? " sidebar-right-open" : " sidebar-right-collapsed")
      }
    >
      <div className="todo-header">
        <button
          className="todo-toggle"
          onClick={() => setIsOpen((open) => !open)}
          type="button"
        >
          {isOpen ? "➜" : "⬅"}
        </button>
        {isOpen && (
          <>
            <h2 className="todo-title" style={{ marginRight: 8 }}>
              {mode === "tasks" ? "Tasks" : "Documents"}
            </h2>

            {/* Mode toggle */}
            <div
              style={{
                display: "inline-flex",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                overflow: "hidden",
                fontSize: 10,
              }}
            >
              <button
                type="button"
                onClick={() => setMode("tasks")}
                style={{
                  padding: "2px 8px",
                  border: "none",
                  background:
                    mode === "tasks"
                      ? "rgba(127,61,255,0.9)"
                      : "transparent",
                  color: mode === "tasks" ? "#ffffff" : "#9da2c8",
                  cursor: "pointer",
                }}
              >
                Tasks
              </button>
              <button
                type="button"
                onClick={() => setMode("documents")}
                style={{
                  padding: "2px 8px",
                  border: "none",
                  background:
                    mode === "documents"
                      ? "rgba(127,61,255,0.9)"
                      : "transparent",
                  color: mode === "documents" ? "#ffffff" : "#9da2c8",
                  cursor: "pointer",
                }}
              >
                Docs
              </button>
            </div>
          </>
        )}
      </div>

      {isOpen && (mode === "tasks" ? renderTasksMode() : renderDocsMode())}
    </aside>
  );
};

export default RightSidebar;