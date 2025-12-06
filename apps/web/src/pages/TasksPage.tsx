// apps/web/src/pages/TasksPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  fetchTasks,
  createTask,
  updateTask,
  deleteTask,
  Task,
  TaskPriority,
} from "../api/tasks";

type TaskFilter = "all" | "today" | "overdue" | "completed";

function isoToDateInput(iso?: string | null): string {
  if (!iso) return "";
  // ISO like 2025-12-04T00:00:00.000Z → keep YYYY-MM-DD to avoid TZ shift
  return iso.slice(0, 10);
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getTaskDateKey(task: Task): string | null {
  if (!task.dueDate) return null;
  return String(task.dueDate).slice(0, 10);
}

function isOverdue(task: Task): boolean {
  const key = getTaskDateKey(task);
  if (!key) return false;
  return key < todayKey();
}

function isDueToday(task: Task): boolean {
  const key = getTaskDateKey(task);
  if (!key) return false;
  return key === todayKey();
}

const TasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("all");

  // Initial load
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const loaded = await fetchTasks();
        setTasks(loaded);
      } catch (err) {
        console.error("Error loading tasks:", err);
        setError("Unable to load tasks.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    try {
      setError(null);
      // priority defaults to "normal" inside createTask
      const created = await createTask(trimmed);
      setTasks((prev) => [created, ...prev]);
      setNewTitle("");
    } catch (err) {
      console.error("Error creating task:", err);
      setError("Unable to create task.");
    }
  }

  async function handleStatusChange(task: Task, nextStatus: Task["status"]) {
    if (task.status === nextStatus) return;

    const prevTasks = tasks;
    setTasks((curr) =>
      curr.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
    );

    try {
      await updateTask(task.id, { status: nextStatus });
    } catch (err) {
      console.error("Error updating task status:", err);
      setError("Unable to update task.");
      setTasks(prevTasks);
    }
  }

  async function handlePriorityChange(task: Task, value: TaskPriority) {
    const prevTasks = tasks;
    setTasks((curr) =>
      curr.map((t) => (t.id === task.id ? { ...t, priority: value } : t))
    );

    try {
      await updateTask(task.id, { priority: value });
    } catch (err) {
      console.error("Error updating task priority:", err);
      setError("Unable to update priority.");
      setTasks(prevTasks);
    }
  }

  async function handleDueDateChange(task: Task, value: string) {
    // value is YYYY-MM-DD or ""
    const prevTasks = tasks;
    const nextDue = value || null;

    setTasks((curr) =>
      curr.map((t) =>
        t.id === task.id ? { ...t, dueDate: nextDue } : t
      )
    );

    try {
      await updateTask(task.id, { dueDate: nextDue });
    } catch (err) {
      console.error("Error updating task due date:", err);
      setError("Unable to update due date.");
      setTasks(prevTasks);
    }
  }

  async function handleDelete(taskId: string) {
    const prevTasks = tasks;
    setTasks((curr) => curr.filter((t) => t.id !== taskId));
    try {
      await deleteTask(taskId);
    } catch (err) {
      console.error("Error deleting task:", err);
      setError("Unable to delete task.");
      setTasks(prevTasks);
    }
  }

  // Derived stats
  const todayCount = useMemo(
    () => tasks.filter((t) => t.status !== "done" && isDueToday(t)).length,
    [tasks]
  );
  const overdueCount = useMemo(
    () => tasks.filter((t) => t.status !== "done" && isOverdue(t)).length,
    [tasks]
  );
  const completedCount = useMemo(
    () => tasks.filter((t) => t.status === "done").length,
    [tasks]
  );

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filter === "completed") {
        return task.status === "done";
      }
      if (filter === "today") {
        return task.status !== "done" && isDueToday(task);
      }
      if (filter === "overdue") {
        return task.status !== "done" && isOverdue(task);
      }
      return true; // all
    });
  }, [tasks, filter]);

  const todoTasks = filteredTasks.filter((t) => t.status === "todo");
  const inProgressTasks = filteredTasks.filter(
    (t) => t.status === "in_progress"
  );
  const doneTasks = filteredTasks.filter((t) => t.status === "done");

  return (
    <div>
      <h2>Tasks</h2>
      <p className="workspace-subtitle">
        Plan your work, track progress, and keep an eye on due dates and priority.
      </p>

      {/* Summary + filters */}
      <div
        style={{
          marginTop: 12,
          marginBottom: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 13 }}>
          <span style={{ marginRight: 16 }}>Today: {todayCount}</span>
          <span style={{ marginRight: 16 }}>Overdue: {overdueCount}</span>
          <span>Completed: {completedCount}</span>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            fontSize: 13,
          }}
        >
          {(["all", "today", "overdue", "completed"] as TaskFilter[]).map(
            (f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border:
                    filter === f
                      ? "1px solid rgba(255,255,255,0.7)"
                      : "1px solid rgba(255,255,255,0.18)",
                  background:
                    filter === f ? "rgba(63,100,255,0.32)" : "transparent",
                  color: "#f5f5f5",
                  cursor: "pointer",
                }}
              >
                {f === "all"
                  ? "All"
                  : f === "today"
                  ? "Today"
                  : f === "overdue"
                  ? "Overdue"
                  : "Completed"}
              </button>
            )
          )}
        </div>
      </div>

      {/* New task input */}
      <form
        onSubmit={handleAddTask}
        style={{
          marginBottom: 18,
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New task..."
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.18)",
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
            cursor: "pointer",
            background: "linear-gradient(135deg,#3f64ff,#7f3dff)",
            color: "#ffffff",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Add
        </button>
      </form>

      {loading && <p style={{ fontSize: 13 }}>Loading tasks...</p>}
      {error && (
        <p style={{ fontSize: 13, color: "#ff7b88" }}>{error}</p>
      )}

      {/* Columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 16,
        }}
      >
        {/* To-Do */}
        <TasksColumn
          title="To-Do"
          tasks={todoTasks}
          emptyText="No tasks in this column."
          onStatusChange={handleStatusChange}
          onPriorityChange={handlePriorityChange}
          onDueDateChange={handleDueDateChange}
          onDelete={handleDelete}
        />

        {/* In Progress */}
        <TasksColumn
          title="In Progress"
          tasks={inProgressTasks}
          emptyText="No tasks in progress."
          onStatusChange={handleStatusChange}
          onPriorityChange={handlePriorityChange}
          onDueDateChange={handleDueDateChange}
          onDelete={handleDelete}
        />

        {/* Done */}
        <TasksColumn
          title="Done"
          tasks={doneTasks}
          emptyText="No completed tasks yet."
          onStatusChange={handleStatusChange}
          onPriorityChange={handlePriorityChange}
          onDueDateChange={handleDueDateChange}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
};

interface TasksColumnProps {
  title: string;
  tasks: Task[];
  emptyText: string;
  onStatusChange: (task: Task, nextStatus: Task["status"]) => void;
  onPriorityChange: (task: Task, value: TaskPriority) => void;
  onDueDateChange: (task: Task, value: string) => void;
  onDelete: (id: string) => void;
}

const TasksColumn: React.FC<TasksColumnProps> = ({
  title,
  tasks,
  emptyText,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onDelete,
}) => {
  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        padding: 12,
        background:
          "radial-gradient(circle at top, #131731 0, #050713 60%)",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: 4 }}>{title}</h3>
      <p
        style={{
          marginTop: 0,
          marginBottom: 10,
          fontSize: 12,
          color: "#9da2c8",
        }}
      >
        {tasks.length} task{tasks.length === 1 ? "" : "s"}
      </p>
      {tasks.length === 0 ? (
        <p style={{ fontSize: 12, color: "#9da2c8" }}>{emptyText}</p>
      ) : (
        tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onStatusChange={onStatusChange}
            onPriorityChange={onPriorityChange}
            onDueDateChange={onDueDateChange}
            onDelete={onDelete}
          />
        ))
      )}
    </div>
  );
};

interface TaskCardProps {
  task: Task;
  onStatusChange: (task: Task, nextStatus: Task["status"]) => void;
  onPriorityChange: (task: Task, value: TaskPriority) => void;
  onDueDateChange: (task: Task, value: string) => void;
  onDelete: (id: string) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onDelete,
}) => {
  return (
    <div
      style={{
        marginBottom: 10,
        padding: 10,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.16)",
        background: "#050713",
        fontSize: 13,
      }}
    >
      <div
        style={{
          marginBottom: 6,
          fontWeight: 500,
          color: "#f5f5f5",
          wordBreak: "break-word",
        }}
      >
        {task.title}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <label
          style={{
            fontSize: 11,
            color: "#9da2c8",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <span>Due date</span>
          <input
            type="date"
            value={isoToDateInput(task.dueDate ?? null)}
            onChange={(e) => onDueDateChange(task, e.target.value)}
            style={{
              padding: "4px 6px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.24)",
              background: "#050713",
              color: "#f5f5f5",
              fontSize: 12,
            }}
          />
        </label>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <select
            value={task.status}
            onChange={(e) =>
              onStatusChange(
                task,
                e.target.value as Task["status"]
              )
            }
            style={{
              flex: 1,
              padding: "4px 6px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.24)",
              background: "#050713",
              color: "#f5f5f5",
              fontSize: 12,
            }}
          >
            <option value="todo">To-Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>

          <select
            value={task.priority}
            onChange={(e) =>
              onPriorityChange(
                task,
                e.target.value as TaskPriority
              )
            }
            style={{
              flex: 1,
              padding: "4px 6px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.24)",
              background: "#050713",
              color: "#f5f5f5",
              fontSize: 12,
            }}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>

          <button
            type="button"
            onClick={() => onDelete(task.id)}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "none",
              background: "rgba(255, 107, 120, 0.16)",
              color: "#ff9aa7",
              fontSize: 12,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default TasksPage;