import React, { useEffect, useState } from "react";
import {
  fetchTasks,
  createTask,
  updateTask,
  deleteTask,
  Task,
  TaskStatus,
} from "../api/tasks";

const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To-Do",
  in_progress: "In Progress",
  done: "Done",
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "#6f7598",
  in_progress: "#f0c36a",
  done: "#4fd18b",
};

const TasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load tasks once on mount
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

  // Create a new task (defaults to "todo" on the backend)
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;

    setCreating(true);
    try {
      const created = await createTask(title);
      setTasks((prev) => [created, ...prev]);
      setNewTitle("");
    } catch (err) {
      console.error("Error creating task:", err);
      // Optional: set some UI error
    } finally {
      setCreating(false);
    }
  }

  // Change status (To-Do / In Progress / Done)
  async function handleChangeStatus(id: string, status: TaskStatus) {
    setUpdatingId(id);
    try {
      const updated = await updateTask(id, { status });
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      console.error("Error updating task status:", err);
    } finally {
      setUpdatingId(null);
    }
  }

  // Delete task
  async function handleDelete(id: string) {
    setDeletingId(id);
    const previous = tasks;
    const remaining = tasks.filter((t) => t.id !== id);
    setTasks(remaining);

    try {
      await deleteTask(id);
    } catch (err: any) {
      console.error("Error deleting task:", err);
      const status = err?.response?.status;
      if (!status || status !== 404) {
        // rollback if delete failed for a reason other than "already gone"
        setTasks(previous);
      }
    } finally {
      setDeletingId(null);
    }
  }

  // Group tasks by status
  const grouped: Record<TaskStatus, Task[]> = {
    todo: [],
    in_progress: [],
    done: [],
  };

  tasks.forEach((task) => {
    const status: TaskStatus =
      task.status === "in_progress" || task.status === "done"
        ? task.status
        : "todo";
    grouped[status].push(task);
  });

  function renderStatusPill(status: TaskStatus, active: boolean) {
    return {
      padding: "3px 8px",
      borderRadius: 999,
      border: active ? "none" : "1px solid rgba(255,255,255,0.16)",
      background: active ? "rgba(127,61,255,0.2)" : "transparent",
      color: active ? "#ffffff" : STATUS_COLORS[status],
      fontSize: 11,
      cursor: "pointer",
      whiteSpace: "nowrap" as const,
    };
  }

  function formatCreatedAt(task: Task): string {
    if (!task.createdAt) return "";
    const d = new Date(task.createdAt);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        height: "100%",
      }}
    >
      {/* Header / intro */}
      <div className="workspace-header">
        <h1>Tasks</h1>
        <p className="workspace-subtitle">
          Track what you need to get done. Organize by status and keep your
          student work moving.
        </p>
      </div>

      {/* Main card */}
      <div
        style={{
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "#050713",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: 220,
        }}
      >
        {/* New task form */}
        <form
          onSubmit={handleCreate}
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 8,
            alignItems: "center",
          }}
        >
          <div style={{ flex: 1 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                color: "#9da2c8",
                marginBottom: 4,
              }}
            >
              Add a task
            </label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g., Finish math homework"
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "#050713",
                color: "#f5f5f5",
                fontSize: 13,
              }}
            />
          </div>
          <button
            type="submit"
            disabled={creating || !newTitle.trim()}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "none",
              cursor: creating || !newTitle.trim() ? "default" : "pointer",
              background: creating
                ? "rgba(127,61,255,0.6)"
                : "linear-gradient(135deg, #3f64ff, #7f3dff)",
              color: "#ffffff",
              fontSize: 12,
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {creating ? "Adding…" : "Add"}
          </button>
        </form>

        {/* Load status */}
        {loading && (
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: "#9da2c8",
            }}
          >
            Loading tasks…
          </p>
        )}
        {loadError && (
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: "#ff7b88",
            }}
          >
            {loadError}
          </p>
        )}

        {/* Grouped tasks */}
        {!loading && tasks.length === 0 && !loadError && (
          <p
            style={{
              marginTop: 4,
              fontSize: 12,
              color: "#9da2c8",
            }}
          >
            You don&apos;t have any tasks yet. Add your first one above.
          </p>
        )}

        {!loading && tasks.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(0, 1fr))",
              gap: 12,
              marginTop: 4,
            }}
          >
            {STATUS_ORDER.map((status) => {
              const bucket = grouped[status];
              return (
                <div
                  key={status}
                  style={{
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.06)",
                    background: "#050813",
                    padding: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    minHeight: 80,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: STATUS_COLORS[status],
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                      }}
                    >
                      {STATUS_LABELS[status]}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "#6f7598",
                      }}
                    >
                      {bucket.length} task{bucket.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {bucket.length === 0 ? (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 11,
                        color: "#6f7598",
                      }}
                    >
                      No tasks in this column.
                    </p>
                  ) : (
                    bucket.map((task) => {
                      const isUpdating = updatingId === task.id;
                      const isDeleting = deletingId === task.id;
                      const createdLabel = formatCreatedAt(task);

                      return (
                        <div
                          key={task.id}
                          style={{
                            borderRadius: 8,
                            border: "1px solid rgba(255,255,255,0.12)",
                            background: "#050713",
                            padding: 8,
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 13,
                                color: "#f5f5f5",
                                wordBreak: "break-word",
                              }}
                            >
                              {task.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDelete(task.id)}
                              disabled={isDeleting}
                              style={{
                                all: "unset",
                                fontSize: 11,
                                cursor: isDeleting ? "default" : "pointer",
                                opacity: 0.75,
                              }}
                              aria-label="Delete task"
                            >
                              {isDeleting ? "…" : "✕"}
                            </button>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                gap: 4,
                              }}
                            >
                              {STATUS_ORDER.map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() =>
                                    s === status
                                      ? undefined
                                      : handleChangeStatus(task.id, s)
                                  }
                                  style={renderStatusPill(
                                    s,
                                    s === status
                                  )}
                                >
                                  {STATUS_LABELS[s]}
                                </button>
                              ))}
                            </div>
                            {createdLabel && (
                              <span
                                style={{
                                  fontSize: 10,
                                  color: "#6f7598",
                                }}
                              >
                                Created {createdLabel}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TasksPage;