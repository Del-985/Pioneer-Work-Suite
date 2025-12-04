// apps/web/src/pages/TasksPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  fetchTasks,
  createTask,
  updateTask,
  deleteTask,
  Task,
  TaskStatus,
} from "../api/tasks";

const TasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newDueDate, setNewDueDate] = useState<string>(""); // yyyy-mm-dd from input
  const [creating, setCreating] = useState(false);

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // Inline due date editing
  const [editingDueId, setEditingDueId] = useState<string | null>(null);
  const [editingDueValue, setEditingDueValue] = useState<string>("");

  // Load tasks once
  useEffect(() => {
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchTasks();
        setTasks(data);
      } catch (err) {
        console.error("Error loading tasks:", err);
        setLoadError("Failed to load tasks.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Derived lists
  const todoTasks = useMemo(
    () => tasks.filter((t) => t.status === "todo"),
    [tasks]
  );
  const inProgressTasks = useMemo(
    () => tasks.filter((t) => t.status === "in_progress"),
    [tasks]
  );
  const doneTasks = useMemo(
    () => tasks.filter((t) => t.status === "done"),
    [tasks]
  );

  // --- Date helpers: avoid timezone shifts ---

  /**
   * Turn a yyyy-mm-dd string (from <input type="date">) into an ISO string.
   * We still use Date + toISOString for the backend, but all *display*
   * logic below ignores the timezone and only uses the yyyy-mm-dd part.
   */
  function dateInputToIso(value: string): string | null {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  /**
   * Given an ISO-ish string, pull out yyyy-mm-dd.
   * If it doesn't look valid, return null.
   */
  function isoToInputValue(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const parts = iso.split("T")[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parts)) return null;
    return parts;
  }

  /**
   * Convert an ISO date string into a Date object *using only the date part*
   * as a local date (ignores timezone, fixes off-by-one issues).
   */
  function isoToLocalDate(iso: string | null | undefined): Date | null {
    const ymd = isoToInputValue(iso);
    if (!ymd) return null;
    const [y, m, d] = ymd.split("-");
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day); // local date
  }

  /**
   * Format a due date as label + tone, using local date only.
   */
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

  // --- Create task ---

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;

    setCreating(true);
    setActionError(null);

    try {
      const iso = dateInputToIso(newDueDate);
      const created = await createTask(title, iso ?? undefined);
      setTasks((prev) => [created, ...prev]);
      setNewTitle("");
      setNewDueDate("");
    } catch (err) {
      console.error("Error creating task:", err);
      setActionError("Unable to create task.");
    } finally {
      setCreating(false);
    }
  }

  // --- Status changes ---

  function nextStatus(status: TaskStatus): TaskStatus {
    if (status === "todo") return "in_progress";
    if (status === "in_progress") return "done";
    return "todo";
  }

  async function handleAdvanceStatus(task: Task) {
    const newStatus = nextStatus(task.status);
    setUpdatingId(task.id);
    setActionError(null);

    const previous = tasks;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status: newStatus,
            }
          : t
      )
    );

    try {
      const updated = await updateTask(task.id, { status: newStatus });
      setTasks((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t))
      );
    } catch (err) {
      console.error("Error updating task status:", err);
      setTasks(previous);
      setActionError("Unable to update task.");
    } finally {
      setUpdatingId(null);
    }
  }

  // --- Delete ---

  async function handleDelete(task: Task) {
    setDeletingId(task.id);
    setActionError(null);

    const previous = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== task.id));

    try {
      await deleteTask(task.id);
    } catch (err) {
      console.error("Error deleting task:", err);
      setTasks(previous);
      setActionError("Unable to delete task.");
    } finally {
      setDeletingId(null);
    }
  }

  // --- Inline title editing ---

  function startEditing(task: Task) {
    setEditingId(task.id);
    setEditingTitle(task.title);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingTitle("");
  }

  async function commitEditing(task: Task) {
    const trimmed = editingTitle.trim();
    if (!trimmed) {
      cancelEditing();
      return;
    }
    if (trimmed === task.title) {
      cancelEditing();
      return;
    }

    setUpdatingId(task.id);
    setActionError(null);

    const previous = tasks;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              title: trimmed,
            }
          : t
      )
    );

    try {
      const updated = await updateTask(task.id, { title: trimmed });
      setTasks((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t))
      );
    } catch (err) {
      console.error("Error updating task title:", err);
      setTasks(previous);
      setActionError("Unable to rename task.");
    } finally {
      setUpdatingId(null);
      cancelEditing();
    }
  }

  // --- Inline due date editing ---

  function startEditingDue(task: Task) {
    setEditingDueId(task.id);
    const inputVal = isoToInputValue(task.dueDate || null);
    setEditingDueValue(inputVal ?? "");
  }

  function cancelEditingDue() {
    setEditingDueId(null);
    setEditingDueValue("");
  }

  async function commitEditingDue(task: Task) {
    const iso = dateInputToIso(editingDueValue || "");

    setUpdatingId(task.id);
    setActionError(null);

    const previous = tasks;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              dueDate: iso,
            }
          : t
      )
    );

    try {
      const updated = await updateTask(task.id, { dueDate: iso });
      setTasks((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t))
      );
    } catch (err) {
      console.error("Error updating task due date:", err);
      setTasks(previous);
      setActionError("Unable to update due date.");
    } finally {
      setUpdatingId(null);
      cancelEditingDue();
    }
  }

  // --- UI helpers ---

  function renderColumnHeader(label: string, count: number) {
    return (
      <div
        style={{
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontSize: 12,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: "#9da2c8",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#6f7598",
          }}
        >
          {count} task{count === 1 ? "" : "s"}
        </div>
      </div>
    );
  }

  function renderTaskCard(task: Task) {
    const isUpdating = updatingId === task.id;
    const isDeleting = deletingId === task.id;
    const isEditing = editingId === task.id;
    const isEditingDue = editingDueId === task.id;

    const statusLabel =
      task.status === "todo"
        ? "To-Do"
        : task.status === "in_progress"
        ? "In Progress"
        : "Done";

    const { label: dueLabel, tone } = formatDueLabel(task.dueDate);
    const dueColor =
      tone === "overdue"
        ? "#ff7b88"
        : tone === "today"
        ? "#f0c36a"
        : "#6f7598";

    return (
      <div
        key={task.id}
        style={{
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "#050713",
          padding: 8,
          marginBottom: 8,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {/* Title row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          {isEditing ? (
            <input
              autoFocus
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onBlur={() => void commitEditing(task)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitEditing(task);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEditing();
                }
              }}
              style={{
                flex: 1,
                padding: "4px 6px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "#050713",
                color: "#f5f5f5",
                fontSize: 13,
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => startEditing(task)}
              style={{
                flex: 1,
                textAlign: "left",
                border: "none",
                background: "transparent",
                padding: 0,
                margin: 0,
                fontSize: 13,
                color: "#f5f5f5",
                cursor: "pointer",
                wordBreak: "break-word",
              }}
            >
              {task.title}
            </button>
          )}

          {/* Delete */}
          <button
            type="button"
            onClick={() => void handleDelete(task)}
            disabled={isDeleting}
            style={{
              all: "unset",
              cursor: isDeleting ? "default" : "pointer",
              fontSize: 12,
              opacity: 0.8,
            }}
            aria-label="Delete task"
          >
            {isDeleting ? "…" : "✕"}
          </button>
        </div>

        {/* Due + status row */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 6,
            alignItems: "center",
          }}
        >
          {/* Due date */}
          {isEditingDue ? (
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                gap: 4,
                alignItems: "center",
                flex: 1,
              }}
            >
              <input
                type="date"
                value={editingDueValue}
                onChange={(e) => setEditingDueValue(e.target.value)}
                onBlur={() => void commitEditingDue(task)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitEditingDue(task);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEditingDue();
                  }
                }}
                style={{
                  flex: 1,
                  padding: "4px 6px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "#050713",
                  color: "#f5f5f5",
                  fontSize: 11,
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => startEditingDue(task)}
              style={{
                flex: 1,
                textAlign: "left",
                border: "none",
                background: "transparent",
                padding: 0,
                margin: 0,
                fontSize: 11,
                color: dueColor,
                cursor: "pointer",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {dueLabel}
            </button>
          )}

          {/* Status */}
          <button
            type="button"
            onClick={() => void handleAdvanceStatus(task)}
            disabled={isUpdating}
            style={{
              flexBasis: "40%",
              padding: "4px 6px",
              borderRadius: 999,
              border: "none",
              fontSize: 11,
              cursor: isUpdating ? "default" : "pointer",
              background:
                task.status === "done"
                  ? "rgba(88, 199, 137, 0.18)"
                  : "rgba(127,61,255,0.18)",
              color: task.status === "done" ? "#79f0b4" : "#d0b8ff",
              whiteSpace: "nowrap",
            }}
          >
            {isUpdating ? "Updating…" : statusLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <section className="workspace-header">
        <h1>Tasks</h1>
        <p className="workspace-subtitle">
          Track what you need to get done. Organize by status and keep your
          student work moving.
        </p>
      </section>

      <section
        style={{
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "#050713",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Add task */}
        <form
          onSubmit={handleCreate}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <label
            htmlFor="new-task"
            style={{ fontSize: 12, color: "#9da2c8" }}
          >
            Add a task
          </label>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <input
                id="new-task"
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., Finish math homework"
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "#050713",
                  color: "#f5f5f5",
                  fontSize: 13,
                }}
              />
              <button
                type="submit"
                disabled={creating || !newTitle.trim()}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "none",
                  fontSize: 12,
                  cursor:
                    creating || !newTitle.trim() ? "default" : "pointer",
                  background:
                    creating || !newTitle.trim()
                      ? "rgba(127,61,255,0.5)"
                      : "linear-gradient(135deg, #3f64ff, #7f3dff)",
                  color: "#ffffff",
                  whiteSpace: "nowrap",
                }}
              >
                {creating ? "Adding…" : "Add"}
              </button>
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <label
                htmlFor="new-task-due"
                style={{ fontSize: 11, color: "#9da2c8", minWidth: 64 }}
              >
                Due
              </label>
              <input
                id="new-task-due"
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "#050713",
                  color: "#f5f5f5",
                  fontSize: 12,
                }}
              />
            </div>
          </div>
        </form>

        {loading && (
          <p style={{ fontSize: 12, color: "#9da2c8" }}>Loading tasks…</p>
        )}
        {loadError && (
          <p style={{ fontSize: 12, color: "#ff7b88" }}>{loadError}</p>
        )}
        {actionError && (
          <p style={{ fontSize: 12, color: "#ff7b88" }}>{actionError}</p>
        )}

        {/* Columns – stacked vertically for mobile friendliness */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* To-Do */}
          <div
            style={{
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "#040610",
              padding: 10,
            }}
          >
            {renderColumnHeader("To-Do", todoTasks.length)}
            {todoTasks.length === 0 ? (
              <p
                style={{
                  fontSize: 12,
                  color: "#6f7598",
                }}
              >
                No tasks in this column.
              </p>
            ) : (
              todoTasks.map(renderTaskCard)
            )}
          </div>

          {/* In Progress */}
          <div
            style={{
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "#040610",
              padding: 10,
            }}
          >
            {renderColumnHeader("In Progress", inProgressTasks.length)}
            {inProgressTasks.length === 0 ? (
              <p
                style={{
                  fontSize: 12,
                  color: "#6f7598",
                }}
              >
                No tasks in this column.
              </p>
            ) : (
              inProgressTasks.map(renderTaskCard)
            )}
          </div>

          {/* Done */}
          <div
            style={{
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "#040610",
              padding: 10,
            }}
          >
            {renderColumnHeader("Done", doneTasks.length)}
            {doneTasks.length === 0 ? (
              <p
                style={{
                  fontSize: 12,
                  color: "#6f7598",
                }}
              >
                No tasks in this column.
              </p>
            ) : (
              doneTasks.map(renderTaskCard)
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default TasksPage;