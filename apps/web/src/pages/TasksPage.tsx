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

type TaskView = "all" | "today" | "overdue" | "completed";

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

function localDateToIsoForApi(localValue: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localValue)) return null;
  const [y, m, d] = localValue.split("-");
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!year || !month || !day) return null;
  // Construct a local Date and let backend interpret date-only correctly
  const dt = new Date(year, month - 1, day);
  return dt.toISOString();
}

function isToday(iso: string | null | undefined): boolean {
  const local = isoToLocalDate(iso);
  if (!local) return false;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(
    local.getFullYear(),
    local.getMonth(),
    local.getDate()
  );

  return target.getTime() === today.getTime();
}

function isOverdue(iso: string | null | undefined): boolean {
  const local = isoToLocalDate(iso);
  if (!local) return false;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(
    local.getFullYear(),
    local.getMonth(),
    local.getDate()
  );

  return target.getTime() < today.getTime();
}

const TasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [view, setView] = useState<TaskView>("all");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchTasks();
        if (!cancelled) {
          setTasks(data);
        }
      } catch (err) {
        console.error("Error loading tasks:", err);
        if (!cancelled) {
          setError("Unable to load tasks.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    setError(null);
    try {
      const created = await createTask(trimmed);
      setTasks((prev) => [created, ...prev]);
      setNewTitle("");
    } catch (err) {
      console.error("Error creating task:", err);
      setError("Unable to create task.");
    }
  }

  async function handleStatusChange(task: Task, next: TaskStatus) {
    const previous = task.status;
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: next } : t))
    );

    try {
      await updateTask(task.id, { status: next });
    } catch (err) {
      console.error("Error updating task status:", err);
      setError("Unable to update task.");
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: previous } : t))
      );
    }
  }

  async function handleDueDateChange(task: Task, value: string) {
    const iso = value ? localDateToIsoForApi(value) : null;
    const previous = task.dueDate;

    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, dueDate: iso ?? null } : t))
    );

    try {
      await updateTask(task.id, { dueDate: iso ?? null });
    } catch (err) {
      console.error("Error updating task due date:", err);
      setError("Unable to update due date.");
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, dueDate: previous } : t))
      );
    }
  }

  async function handleDelete(taskId: string) {
    const previous = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    try {
      await deleteTask(taskId);
    } catch (err) {
      console.error("Error deleting task:", err);
      setError("Unable to delete task.");
      setTasks(previous);
    }
  }

  // Filter by view (all / today / overdue / completed)
  const filteredTasks = useMemo(() => {
    switch (view) {
      case "today":
        return tasks.filter((t) => isToday(t.dueDate));
      case "overdue":
        return tasks.filter(
          (t) => t.status !== "done" && isOverdue(t.dueDate)
        );
      case "completed":
        return tasks.filter((t) => t.status === "done");
      case "all":
      default:
        return tasks;
    }
  }, [tasks, view]);

  const todoTasks = filteredTasks.filter((t) => t.status === "todo");
  const inProgressTasks = filteredTasks.filter(
    (t) => t.status === "in_progress"
  );
  const doneTasks = filteredTasks.filter((t) => t.status === "done");

  const todayCount = useMemo(
    () => tasks.filter((t) => isToday(t.dueDate)).length,
    [tasks]
  );
  const overdueCount = useMemo(
    () => tasks.filter((t) => t.status !== "done" && isOverdue(t.dueDate)).length,
    [tasks]
  );
  const completedCount = useMemo(
    () => tasks.filter((t) => t.status === "done").length,
    [tasks]
  );

  return (
    <div className="tasks-page">
      <div className="tasks-header">
        <div>
          <h2>Tasks</h2>
          <p className="tasks-subtitle">
            Plan your work, track progress, and keep an eye on due dates.
          </p>
        </div>

        <div className="tasks-stats">
          <span>Today: {todayCount}</span>
          <span>Overdue: {overdueCount}</span>
          <span>Completed: {completedCount}</span>
        </div>
      </div>

      {/* View filter bar */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        {(["all", "today", "overdue", "completed"] as TaskView[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border:
                view === v
                  ? "1px solid rgba(127, 61, 255, 0.9)"
                  : "1px solid rgba(255,255,255,0.15)",
              background:
                view === v ? "rgba(127, 61, 255, 0.16)" : "transparent",
              color: view === v ? "#ffffff" : "#c3c7ee",
              fontSize: 12,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {v === "all"
              ? "All"
              : v === "today"
              ? "Today"
              : v === "overdue"
              ? "Overdue"
              : "Completed"}
          </button>
        ))}
      </div>

      {/* New task form */}
      <form
        onSubmit={handleCreate}
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New task..."
          style={{
            flex: "1 1 200px",
            minWidth: 0,
            padding: "8px 10px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "#05070a",
            color: "#f5f5f5",
            fontSize: 13,
          }}
        />
        <button
          type="submit"
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: "none",
            fontSize: 13,
            cursor: "pointer",
            background: "linear-gradient(135deg, #3f64ff, #7f3dff)",
            color: "#ffffff",
            flexShrink: 0,
          }}
        >
          Add
        </button>
      </form>

      {loading && (
        <p style={{ fontSize: 13, color: "#9da2c8" }}>Loading tasks...</p>
      )}
      {error && (
        <p style={{ fontSize: 13, color: "#ff7b88" }}>
          {error}
        </p>
      )}

      <div className="tasks-board">
        {/* To-Do column */}
        <section className="tasks-column">
          <header className="tasks-column-header">
            <h3>To-Do</h3>
            <span>{todoTasks.length}</span>
          </header>
          <div className="tasks-column-body">
            {todoTasks.map((task) => {
              const inputValue = isoToInputValue(task.dueDate ?? null) ?? "";
              return (
                <article key={task.id} className="task-card">
                  <div className="task-card-main">
                    <div className="task-title-row">
                      <span className="task-title">{task.title}</span>
                    </div>
                    <div className="task-meta-row">
                      <label className="task-due-label">
                        <span>Due</span>
                        <input
                          type="date"
                          value={inputValue}
                          onChange={(e) =>
                            handleDueDateChange(task, e.target.value)
                          }
                          className="task-due-input"
                        />
                      </label>
                    </div>
                  </div>
                  <div className="task-card-actions">
                    <select
                      value={task.status}
                      onChange={(e) =>
                        handleStatusChange(task, e.target.value as TaskStatus)
                      }
                      className="task-status-select"
                    >
                      <option value="todo">To-Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleDelete(task.id)}
                      className="task-delete-button"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
            {todoTasks.length === 0 && !loading && (
              <p className="tasks-empty">No tasks in To-Do.</p>
            )}
          </div>
        </section>

        {/* In Progress column */}
        <section className="tasks-column">
          <header className="tasks-column-header">
            <h3>In Progress</h3>
            <span>{inProgressTasks.length}</span>
          </header>
          <div className="tasks-column-body">
            {inProgressTasks.map((task) => {
              const inputValue = isoToInputValue(task.dueDate ?? null) ?? "";
              return (
                <article key={task.id} className="task-card">
                  <div className="task-card-main">
                    <div className="task-title-row">
                      <span className="task-title">{task.title}</span>
                    </div>
                    <div className="task-meta-row">
                      <label className="task-due-label">
                        <span>Due</span>
                        <input
                          type="date"
                          value={inputValue}
                          onChange={(e) =>
                            handleDueDateChange(task, e.target.value)
                          }
                          className="task-due-input"
                        />
                      </label>
                    </div>
                  </div>
                  <div className="task-card-actions">
                    <select
                      value={task.status}
                      onChange={(e) =>
                        handleStatusChange(task, e.target.value as TaskStatus)
                      }
                      className="task-status-select"
                    >
                      <option value="todo">To-Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleDelete(task.id)}
                      className="task-delete-button"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
            {inProgressTasks.length === 0 && !loading && (
              <p className="tasks-empty">No tasks in progress.</p>
            )}
          </div>
        </section>

        {/* Done column */}
        <section className="tasks-column">
          <header className="tasks-column-header">
            <h3>Done</h3>
            <span>{doneTasks.length}</span>
          </header>
          <div className="tasks-column-body">
            {doneTasks.map((task) => {
              const inputValue = isoToInputValue(task.dueDate ?? null) ?? "";
              return (
                <article key={task.id} className="task-card">
                  <div className="task-card-main">
                    <div className="task-title-row">
                      <span className="task-title">{task.title}</span>
                    </div>
                    <div className="task-meta-row">
                      <label className="task-due-label">
                        <span>Due</span>
                        <input
                          type="date"
                          value={inputValue}
                          onChange={(e) =>
                            handleDueDateChange(task, e.target.value)
                          }
                          className="task-due-input"
                        />
                      </label>
                    </div>
                  </div>
                  <div className="task-card-actions">
                    <select
                      value={task.status}
                      onChange={(e) =>
                        handleStatusChange(task, e.target.value as TaskStatus)
                      }
                      className="task-status-select"
                    >
                      <option value="todo">To-Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleDelete(task.id)}
                      className="task-delete-button"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
            {doneTasks.length === 0 && !loading && (
              <p className="tasks-empty">No completed tasks yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default TasksPage;