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
  const [creating, setCreating] = useState(false);

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;

    setCreating(true);
    setActionError(null);

    try {
      const created = await createTask(title);
      setTasks((prev) => [created, ...prev]);
      setNewTitle("");
    } catch (err) {
      console.error("Error creating task:", err);
      setActionError("Unable to create task.");
    } finally {
      setCreating(false);
    }
  }

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
      // Don't allow empty titles; just cancel
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

    const statusLabel =
      task.status === "todo"
        ? "To-Do"
        : task.status === "in_progress"
        ? "In Progress"
        : "Done";

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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          {/* Title / editor */}
          {isEditing ? (
            <input
              autoFocus
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onBlur={() => commitEditing(task)}
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
            onClick={() => handleDelete(task)}
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

        <div
          style={{
            display: "flex",
            gap: 6,
          }}
        >
          <button
            type="button"
            onClick={() => handleAdvanceStatus(task)}
            disabled={isUpdating}
            style={{
              flex: 1,
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