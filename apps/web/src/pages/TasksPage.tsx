// apps/web/src/pages/TasksPage.tsx
import React, { useMemo, useState } from "react";
import { Task } from "../api/tasks";

export type TaskFilter = "all" | "today" | "overdue" | "completed";

export interface TasksPageProps {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  onCreate: (title: string) => void;
  onToggle: (task: Task) => void;
  onDelete: (id: string) => void;
}

function normalizeDateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function parseDue(due?: string | null): Date | null {
  if (!due) return null;
  const d = new Date(due);
  return isNaN(d.getTime()) ? null : d;
}

const TasksPage: React.FC<TasksPageProps> = ({
  tasks,
  loading,
  error,
  onCreate,
  onToggle,
  onDelete,
}) => {
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [newTitle, setNewTitle] = useState("");

  const today = useMemo(() => normalizeDateOnly(new Date()), []);

  const stats = useMemo(() => {
    let todayCount = 0;
    let overdueCount = 0;
    let completedCount = 0;

    for (const t of tasks) {
      const due = parseDue(t.dueDate);
      if (t.status === "done") completedCount++;
      if (due) {
        const dueOnly = normalizeDateOnly(due);
        if (isSameDay(dueOnly, today)) todayCount++;
        if (dueOnly < today && t.status !== "done") overdueCount++;
      }
    }

    return { todayCount, overdueCount, completedCount };
  }, [tasks, today]);

  const filteredTasks = useMemo(() => {
    switch (filter) {
      case "today":
        return tasks.filter((t) => {
          const due = parseDue(t.dueDate);
          if (!due) return false;
          return isSameDay(normalizeDateOnly(due), today);
        });
      case "overdue":
        return tasks.filter((t) => {
          const due = parseDue(t.dueDate);
          if (!due) return false;
          return normalizeDateOnly(due) < today && t.status !== "done";
        });
      case "completed":
        return tasks.filter((t) => t.status === "done");
      case "all":
      default:
        return tasks;
    }
  }, [tasks, filter, today]);

  const todo = filteredTasks.filter((t) => t.status === "todo");
  const inProgress = filteredTasks.filter((t) => t.status === "in_progress");
  const done = filteredTasks.filter((t) => t.status === "done");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    await onCreate(trimmed);
    setNewTitle("");
  }

  function formatDue(due?: string | null) {
    if (!due) return "No due date";
    const d = parseDue(due);
    if (!d) return "No due date";
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function sectionTitle(label: string, count: number) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginTop: 18,
          marginBottom: 4,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>{label}</h2>
        <span style={{ fontSize: 12, color: "#9da2c8" }}>{count}</span>
      </div>
    );
  }

  return (
    <section className="tasks-page">
      <div className="workspace-placeholder" style={{ marginBottom: 16 }}>
        <h2>Tasks</h2>
        <p>
          Plan your work, track progress, and keep an eye on due dates.
          <br />
          <span style={{ fontSize: 12, color: "#9da2c8" }}>
            Today: {stats.todayCount} · Overdue: {stats.overdueCount} ·
            Completed: {stats.completedCount}
          </span>
        </p>
      </div>

      {/* Filter pills */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        {(["all", "today", "overdue", "completed"] as TaskFilter[]).map(
          (key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                border:
                  filter === key
                    ? "1px solid rgba(111, 122, 255, 0.8)"
                    : "1px solid rgba(255,255,255,0.12)",
                background:
                  filter === key ? "rgba(63, 100, 255, 0.16)" : "transparent",
                color: "#f5f5f5",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {key === "all"
                ? "All"
                : key === "today"
                ? "Today"
                : key === "overdue"
                ? "Overdue"
                : "Completed"}
            </button>
          )
        )}
      </div>

      {/* New task form */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="New task..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          style={{
            flex: "1 1 180px",
            padding: "10px 12px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "#050713",
            color: "#f5f5f5",
            fontSize: 14,
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
            fontSize: 14,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          Add
        </button>
      </form>

      {loading && (
        <p style={{ fontSize: 13, color: "#9da2c8" }}>Loading tasks…</p>
      )}
      {error && (
        <p style={{ fontSize: 13, color: "#ff7b88" }}>{error}</p>
      )}

      {/* Columns */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* To-Do */}
        <div>
          {sectionTitle("To-Do", todo.length)}
          {todo.length === 0 ? (
            <p style={{ fontSize: 13, color: "#9da2c8" }}>
              No tasks in this column.
            </p>
          ) : (
            todo.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={onToggle}
                onDelete={onDelete}
                formatDue={formatDue}
              />
            ))
          )}
        </div>

        {/* In Progress */}
        <div>
          {sectionTitle("In Progress", inProgress.length)}
          {inProgress.length === 0 ? (
            <p style={{ fontSize: 13, color: "#9da2c8" }}>
              No tasks in progress.
            </p>
          ) : (
            inProgress.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={onToggle}
                onDelete={onDelete}
                formatDue={formatDue}
              />
            ))
          )}
        </div>

        {/* Done */}
        <div>
          {sectionTitle("Done", done.length)}
          {done.length === 0 ? (
            <p style={{ fontSize: 13, color: "#9da2c8" }}>
              No completed tasks yet.
            </p>
          ) : (
            done.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={onToggle}
                onDelete={onDelete}
                formatDue={formatDue}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
};

interface TaskRowProps {
  task: Task;
  onToggle: (task: Task) => void;
  onDelete: (id: string) => void;
  formatDue: (due?: string | null) => string;
}

const TaskRow: React.FC<TaskRowProps> = ({
  task,
  onToggle,
  onDelete,
  formatDue,
}) => {
  const label =
    task.status === "todo"
      ? "To-Do"
      : task.status === "in_progress"
      ? "In Progress"
      : "Done";

  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.12)",
        padding: "10px 12px",
        marginBottom: 8,
        background:
          "radial-gradient(circle at top left, #151b3a 0, #050713 55%)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 14 }}>{task.title}</span>
        <button
          type="button"
          onClick={() => onDelete(task.id)}
          style={{
            all: "unset",
            cursor: "pointer",
            fontSize: 12,
            color: "#ff7b88",
          }}
        >
          Delete
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          fontSize: 12,
          color: "#9da2c8",
        }}
      >
        <span>Due {formatDue(task.dueDate)}</span>
        <button
          type="button"
          onClick={() => onToggle(task)}
          style={{
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.16)",
            padding: "4px 10px",
            background: "transparent",
            color: "#f5f5f5",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          {label}
        </button>
      </div>
    </div>
  );
};

export default TasksPage;