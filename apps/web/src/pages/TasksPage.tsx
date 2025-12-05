// apps/web/src/pages/TasksPage.tsx 
import React, { useEffect, useMemo, useState } from "react";
import { Task, TaskStatus, updateTask } from "../api/tasks";

interface TasksPageProps {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  onCreate: (title: string) => Promise<void> | void;
  onToggle: (task: Task) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}

type FilterMode = "all" | "today" | "overdue" | "completed";

function normalizeDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDue(due?: string | null): Date | null {
  if (!due) return null;
  const parsed = new Date(due);
  if (Number.isNaN(parsed.getTime())) return null;
  return normalizeDay(parsed);
}

function formatDue(due?: string | null): string {
  const date = parseDue(due);
  if (!date) return "No due date";
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  return date.toLocaleDateString(undefined, opts);
}

const todayMid = normalizeDay(new Date());

const TasksPage: React.FC<TasksPageProps> = ({
  tasks,
  loading,
  error,
  onCreate,
  onToggle,
  onDelete,
}) => {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Keep localTasks in sync with parent when parent updates
  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const stats = useMemo(() => {
    let todayCount = 0;
    let overdueCount = 0;
    let completedCount = 0;

    for (const t of localTasks) {
      const due = parseDue(t.dueDate);

      if (t.status === "done") {
        completedCount += 1;
      }

      if (due) {
        if (due.getTime() === todayMid.getTime()) {
          todayCount += 1;
        } else if (due < todayMid) {
          overdueCount += 1;
        }
      }
    }

    return { todayCount, overdueCount, completedCount };
  }, [localTasks]);

  const filteredTasks = useMemo(() => {
    return localTasks.filter((t) => {
      const due = parseDue(t.dueDate);

      switch (filter) {
        case "today":
          return !!due && due.getTime() === todayMid.getTime();
        case "overdue":
          return !!due && due < todayMid && t.status !== "done";
        case "completed":
          return t.status === "done";
        case "all":
        default:
          return true;
      }
    });
  }, [localTasks, filter]);

  const todoTasks = filteredTasks.filter((t) => t.status === "todo");
  const inProgressTasks = filteredTasks.filter(
    (t) => t.status === "in_progress"
  );
  const doneTasks = filteredTasks.filter((t) => t.status === "done");

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newTaskTitle.trim();
    if (!trimmed) return;
    setNewTaskTitle("");
    await onCreate(trimmed);
  }

  function nextStatus(status: TaskStatus): TaskStatus {
    if (status === "todo") return "in_progress";
    if (status === "in_progress") return "done";
    return "todo";
  }

  async function handleCycleStatus(task: Task) {
    const newStatus = nextStatus(task.status);

    // Optimistic local update
    setLocalTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, status: newStatus } : t
      )
    );

    setSavingId(task.id);
    try {
      await updateTask(task.id, { status: newStatus });

      // Keep right sidebar in sync when "done" toggles
      if (
        (task.status === "done" && newStatus !== "done") ||
        (task.status !== "done" && newStatus === "done")
      ) {
        await onToggle({ ...task, status: newStatus });
      }
    } catch (err) {
      console.error("Error updating status:", err);
    } finally {
      setSavingId((id) => (id === task.id ? null : id));
    }
  }

  async function handleChangeDueDate(task: Task) {
    const current = parseDue(task.dueDate);
    const defaultValue = current
      ? `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(current.getDate()).padStart(2, "0")}`
      : "";

    const input = window.prompt(
      "Set due date (YYYY-MM-DD). Leave blank to clear.",
      defaultValue
    );
    if (input === null) return;

    const trimmed = input.trim();
    let nextDue: string | null = null;

    if (trimmed !== "") {
      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) {
        window.alert("Could not understand that date. Use YYYY-MM-DD.");
        return;
      }
      // Store raw string – backend already parses with new Date()
      nextDue = trimmed;
    }

    setLocalTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, dueDate: nextDue } : t
      )
    );

    setSavingId(task.id);
    try {
      await updateTask(task.id, { dueDate: nextDue ?? null });
    } catch (err) {
      console.error("Error updating due date:", err);
    } finally {
      setSavingId((id) => (id === task.id ? null : id));
    }
  }

  async function handleDelete(task: Task) {
    await onDelete(task.id);
  }

  function renderTaskCard(task: Task) {
    const isSaving = savingId === task.id;

    return (
      <div
        key={task.id}
        style={{
          borderRadius: 16,
          padding: "10px 12px",
          marginBottom: 10,
          background:
            task.status === "done"
              ? "linear-gradient(135deg, rgba(63,100,255,0.14), rgba(127,61,255,0.12))"
              : "rgba(5,7,19,0.9)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 10px 25px rgba(0,0,0,0.45)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            textDecoration: task.status === "done" ? "line-through" : "none",
          }}
        >
          {task.title}
        </div>

        <div
          style={{
            fontSize: 11,
            color: "#9da2c8",
          }}
        >
          {formatDue(task.dueDate)}
        </div>

        <div
          style={{
            display: "flex",
            gap: 6,
            marginTop: 4,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => handleChangeDueDate(task)}
            style={{
              padding: "4px 8px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "#05070a",
              color: "#f5f5f5",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {task.dueDate ? "Change due date" : "Set due date"}
          </button>

          <button
            type="button"
            onClick={() => handleCycleStatus(task)}
            disabled={isSaving}
            style={{
              padding: "4px 8px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "#05070a",
              color: "#f5f5f5",
              fontSize: 11,
              cursor: "pointer",
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            {task.status === "todo"
              ? "To-Do"
              : task.status === "in_progress"
              ? "In Progress"
              : "Done"}
          </button>

          <button
            type="button"
            onClick={() => handleDelete(task)}
            style={{
              padding: "4px 8px",
              borderRadius: 999,
              border: "1px solid rgba(255,123,136,0.5)",
              background: "#05070a",
              color: "#ff7b88",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        borderRadius: 20,
        padding: 18,
        background:
          "radial-gradient(circle at top left, rgba(21,27,58,0.9), #050713 60%)",
        border: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 18px 45px rgba(0,0,0,0.65)",
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Tasks</h2>
        <p
          style={{
            margin: "4px 0 10px",
            fontSize: 13,
            color: "#9da2c8",
          }}
        >
          Plan your work, track progress, and keep an eye on due dates.
        </p>

        <div
          style={{
            fontSize: 12,
            color: "#9da2c8",
            marginBottom: 8,
          }}
        >
          Today: {stats.todayCount} | Overdue: {stats.overdueCount} | Completed:{" "}
          {stats.completedCount}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          {(["all", "today", "overdue", "completed"] as FilterMode[]).map(
            (mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilter(mode)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border:
                    filter === mode
                      ? "1px solid rgba(127,61,255,0.9)"
                      : "1px solid rgba(255,255,255,0.12)",
                  background:
                    filter === mode
                      ? "linear-gradient(135deg,#3f64ff,#7f3dff)"
                      : "transparent",
                  color: filter === mode ? "#ffffff" : "#d0d2ff",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {mode === "all"
                  ? "All"
                  : mode === "today"
                  ? "Today"
                  : mode === "overdue"
                  ? "Overdue"
                  : "Completed"}
              </button>
            )
          )}
        </div>

        <form
          onSubmit={handleAddTask}
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="New task..."
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "#05070a",
              color: "#f5f5f5",
              fontSize: 13,
            }}
          />
          <button
            type="submit"
            style={{
              padding: "8px 18px",
              borderRadius: 999,
              border: "none",
              background:
                "linear-gradient(135deg, #3f64ff, #7f3dff)",
              color: "#ffffff",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Add
          </button>
        </form>

        {loading && (
          <p style={{ fontSize: 12, color: "#9da2c8" }}>Loading tasks...</p>
        )}
        {error && (
          <p style={{ fontSize: 12, color: "#ff7b88" }}>{error}</p>
        )}
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        {/* To-Do column */}
        <section>
          <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>To-Do</h3>
          <p
            style={{
              margin: 0,
              marginBottom: 8,
              fontSize: 11,
              color: "#9da2c8",
            }}
          >
            {todoTasks.length} task{todoTasks.length === 1 ? "" : "s"}
          </p>
          {todoTasks.length === 0 ? (
            <p style={{ fontSize: 12, color: "#6f7598" }}>
              No tasks in this column.
            </p>
          ) : (
            todoTasks.map(renderTaskCard)
          )}
        </section>

        {/* In Progress column */}
        <section>
          <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>In Progress</h3>
          <p
            style={{
              margin: 0,
              marginBottom: 8,
              fontSize: 11,
              color: "#9da2c8",
            }}
          >
            {inProgressTasks.length} task
            {inProgressTasks.length === 1 ? "" : "s"}
          </p>
          {inProgressTasks.length === 0 ? (
            <p style={{ fontSize: 12, color: "#6f7598" }}>
              No tasks in progress.
            </p>
          ) : (
            inProgressTasks.map(renderTaskCard)
          )}
        </section>

        {/* Done column */}
        <section>
          <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Done</h3>
          <p
            style={{
              margin: 0,
              marginBottom: 8,
              fontSize: 11,
              color: "#9da2c8",
            }}
          >
            {doneTasks.length} task{doneTasks.length === 1 ? "" : "s"}
          </p>
          {doneTasks.length === 0 ? (
            <p style={{ fontSize: 12, color: "#6f7598" }}>
              No completed tasks yet.
            </p>
          ) : (
            doneTasks.map(renderTaskCard)
          )}
        </section>
      </div>
    </div>
  );
};

export default TasksPage;