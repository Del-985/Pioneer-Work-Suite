// apps/web/src/pages/TasksPage.tsx
import React, { useMemo, useState } from "react";
import type { Task } from "../api/tasks";

type FilterMode = "all" | "today" | "overdue" | "completed";

interface TasksPageProps {
  tasks: Task[] | undefined | null;
  loading: boolean;
  error: string | null;
  onCreate: (title: string) => void | Promise<void>;
  onToggle: (task: Task) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  // Optional – if App doesn’t pass this, we just won’t persist due dates
  onUpdate?: (
    id: string,
    updates: Partial<Pick<Task, "title" | "status" | "dueDate">>
  ) => void | Promise<void>;
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatShortDate(value?: string | null): string | null {
  const d = parseDate(value);
  if (!d) return null;
  try {
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const TasksPage: React.FC<TasksPageProps> = ({
  tasks,
  loading,
  error,
  onCreate,
  onToggle,
  onDelete,
  onUpdate,
}) => {
  // Absolute safety: never trust the prop, always normalize.
  const safeTasks: Task[] = Array.isArray(tasks) ? tasks : [];

  // Debug: you can see this in the iOS console
  console.log("TasksPage tasks prop:", tasks);

  const [filter, setFilter] = useState<FilterMode>("all");
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState<string>("");

  const today = useMemo(() => new Date(), []);

  const { todayCount, overdueCount, completedCount } = useMemo(() => {
    let todayCount = 0;
    let overdueCount = 0;
    let completedCount = 0;

    for (const t of safeTasks) {
      const due = parseDate(t.dueDate);
      if (t.status === "done") {
        completedCount++;
      }
      if (due) {
        if (isSameDay(due, today)) {
          todayCount++;
        } else if (due < today) {
          overdueCount++;
        }
      }
    }

    return { todayCount, overdueCount, completedCount };
  }, [safeTasks, today]);

  const filtered = useMemo(() => {
    return safeTasks.filter((t) => {
      const due = parseDate(t.dueDate);

      if (filter === "completed") {
        return t.status === "done";
      }

      if (filter === "today") {
        if (!due) return false;
        return isSameDay(due, today);
      }

      if (filter === "overdue") {
        if (!due) return false;
        if (isSameDay(due, today)) return false;
        return due < today && t.status !== "done";
      }

      return true; // "all"
    });
  }, [safeTasks, filter, today]);

  const grouped = useMemo(() => {
    return {
      todo: filtered.filter((t) => t.status === "todo"),
      in_progress: filtered.filter((t) => t.status === "in_progress"),
      done: filtered.filter((t) => t.status === "done"),
    };
  }, [filtered]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;

    await onCreate(title);
    setNewTitle("");
    setNewDue("");
  }

  async function handleDueChange(task: Task, newValue: string) {
    if (!onUpdate) return; // no-op if parent didn’t wire this yet
    const formatted = newValue || null;
    await onUpdate(task.id, { dueDate: formatted ?? undefined });
  }

  function renderFilterButton(mode: FilterMode, label: string) {
    const active = filter === mode;
    return (
      <button
        type="button"
        onClick={() => setFilter(mode)}
        style={{
          padding: "4px 12px",
          borderRadius: 999,
          border: active
            ? "1px solid rgba(111, 135, 255, 0.9)"
            : "1px solid rgba(255, 255, 255, 0.16)",
          background: active ? "rgba(63, 100, 255, 0.2)" : "transparent",
          color: active ? "#ffffff" : "#d0d2ff",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    );
  }

  function renderColumn(
    title: string,
    items: Task[],
    statusLabel: string
  ): React.ReactNode {
    return (
      <div
        style={{
          flex: 1,
          minWidth: 0,
          borderRadius: 16,
          border: "1px solid rgba(255, 255, 255, 0.06)",
          background:
            "radial-gradient(circle at top left, #151b3a 0, #050713 55%)",
          padding: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
          <span style={{ fontSize: 11, color: "#9da2c8" }}>
            {items.length} {items.length === 1 ? "task" : "tasks"}
          </span>
        </div>

        {items.length === 0 ? (
          <p
            style={{
              fontSize: 12,
              color: "#9da2c8",
              margin: 0,
            }}
          >
            {title === "To-Do"
              ? "No tasks in this column."
              : title === "In Progress"
              ? "No tasks in progress."
              : "No completed tasks yet."}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((task) => {
              const dueText = formatShortDate(task.dueDate);
              return (
                <div
                  key={task.id}
                  style={{
                    borderRadius: 12,
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    background: "#050713",
                    padding: 10,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={task.status === "done"}
                        onChange={() => onToggle(task)}
                      />
                      <span
                        style={{
                          fontSize: 13,
                          textDecoration:
                            task.status === "done"
                              ? "line-through"
                              : "none",
                          color:
                            task.status === "done" ? "#6f7598" : "#f5f5f5",
                        }}
                      >
                        {task.title}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDelete(task.id)}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        fontSize: 11,
                        color: "#ff7b88",
                      }}
                    >
                      Delete
                    </button>
                  </div>

                  {/* Due date + status label row */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 11,
                      color: "#9da2c8",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span>Due:</span>
                      <input
                        type="date"
                        value={
                          task.dueDate
                            ? new Date(task.dueDate)
                                .toISOString()
                                .slice(0, 10)
                            : ""
                        }
                        onChange={(e) =>
                          handleDueChange(task, e.target.value)
                        }
                        style={{
                          fontSize: 11,
                          padding: "3px 6px",
                          borderRadius: 6,
                          border: "1px solid rgba(255, 255, 255, 0.18)",
                          background: "#02030a",
                          color: "#f5f5f5",
                        }}
                      />
                      {dueText && (
                        <span style={{ opacity: 0.7 }}>({dueText})</span>
                      )}
                    </div>

                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        border: "1px solid rgba(255, 255, 255, 0.14)",
                      }}
                    >
                      {statusLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="tasks-page">
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Tasks</h2>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 13,
            color: "#9da2c8",
          }}
        >
          Plan your work, track progress, and keep an eye on due dates.
        </p>
      </header>

      {/* Summary strip */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          fontSize: 12,
          color: "#d0d2ff",
          marginBottom: 10,
        }}
      >
        <span>
          Today: {todayCount}{" "}
          <span style={{ color: "#9da2c8" }}>
            Overdue: {overdueCount} Completed: {completedCount}
          </span>
        </span>

        <div style={{ flex: 1 }} />

        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          {renderFilterButton("all", "All")}
          {renderFilterButton("today", "Today")}
          {renderFilterButton("overdue", "Overdue")}
          {renderFilterButton("completed", "Completed")}
        </div>
      </div>

      {/* New task input */}
      <form
        onSubmit={handleAdd}
        style={{
          marginBottom: 16,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          type="text"
          placeholder="New task..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          style={{
            flex: 2,
            minWidth: 0,
            padding: "10px 14px",
            borderRadius: 999,
            border: "1px solid rgba(255, 255, 255, 0.2)",
            background: "#02030a",
            color: "#f5f5f5",
            fontSize: 13,
          }}
        />
        <input
          type="date"
          value={newDue}
          onChange={(e) => setNewDue(e.target.value)}
          style={{
            flex: 1,
            minWidth: 120,
            padding: "8px 10px",
            borderRadius: 999,
            border: "1px solid rgba(255, 255, 255, 0.2)",
            background: "#02030a",
            color: "#f5f5f5",
            fontSize: 12,
          }}
        />
        <button
          type="submit"
          style={{
            padding: "10px 18px",
            borderRadius: 999,
            border: "none",
            background: "linear-gradient(135deg, #3f64ff, #7f3dff)",
            color: "#ffffff",
            fontSize: 13,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Add
        </button>
      </form>

      {loading && (
        <p style={{ fontSize: 12, color: "#9da2c8" }}>Loading tasks…</p>
      )}

      {error && (
        <p style={{ fontSize: 12, color: "#ff7b88" }}>{error}</p>
      )}

      {/* Columns */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        {renderColumn("To-Do", grouped.todo, "To-Do")}
        {renderColumn("In Progress", grouped.in_progress, "In Progress")}
        {renderColumn("Done", grouped.done, "Done")}
      </div>
    </div>
  );
};

export default TasksPage;