// apps/web/src/pages/TasksPage.tsx
import React, { useEffect, useState } from "react";
import {
  fetchTasks,
  createTask,
  updateTask,
  deleteTask,
  Task,
} from "../api/tasks";

const TasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setError(null);
    try {
      const created = await createTask(newTitle.trim());
      setTasks((prev) => [created, ...prev]);
      setNewTitle("");
    } catch (err) {
      console.error("Error creating task:", err);
      setError("Unable to create task.");
    }
  }

  async function handleToggle(task: Task) {
    const nextStatus: Task["status"] =
      task.status === "done" ? "todo" : "done";

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, status: nextStatus } : t
      )
    );

    try {
      await updateTask(task.id, { status: nextStatus });
    } catch (err) {
      console.error("Error updating task:", err);
      setError("Unable to update task.");
    }
  }

  async function handleDelete(id: string) {
    // Optimistic remove
    setTasks((prev) => prev.filter((t) => t.id !== id));

    try {
      await deleteTask(id);
    } catch (err) {
      console.error("Error deleting task:", err);
      setError("Unable to delete task.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="workspace-placeholder" style={{ marginBottom: 8 }}>
        <h2>Tasks</h2>
        <p>
          Track your work here. These tasks are stored in your account and also
          appear in the right-hand Tasks panel when it&apos;s set to Tasks mode.
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a task..."
          style={{
            flex: 1,
            padding: "8px 10px",
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
            padding: "8px 14px",
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            background: "linear-gradient(135deg, #3f64ff, #7f3dff)",
            color: "#ffffff",
            fontWeight: 500,
            fontSize: 13,
          }}
        >
          Add
        </button>
      </form>

      {loading && (
        <p style={{ fontSize: 13, color: "#9da2c8" }}>Loading tasks...</p>
      )}

      {error && (
        <p style={{ fontSize: 13, color: "#ff7b88" }}>{error}</p>
      )}

      {!loading && tasks.length === 0 && !error && (
        <p style={{ fontSize: 13, color: "#9da2c8" }}>
          No tasks yet. Create your first one above.
        </p>
      )}

      <div>
        {tasks.map((task) => (
          <div
            key={task.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.06)",
              background: "#050713",
              marginBottom: 6,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={task.status === "done"}
                onChange={() => handleToggle(task)}
              />
              <span
                style={{
                  fontSize: 13,
                  textDecoration:
                    task.status === "done" ? "line-through" : "none",
                  color:
                    task.status === "done" ? "#6f7598" : "#f5f5f5",
                }}
              >
                {task.title}
              </span>
            </label>
            <button
              type="button"
              onClick={() => handleDelete(task.id)}
              style={{
                all: "unset",
                cursor: "pointer",
                fontSize: 11,
                opacity: 0.75,
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TasksPage;