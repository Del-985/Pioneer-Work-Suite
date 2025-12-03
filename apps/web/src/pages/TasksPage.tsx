// apps/web/src/pages/TasksPage.tsx
import React, { useState } from "react";
import { Task } from "../api/tasks";

interface TasksPageProps {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  onCreate: (title: string) => Promise<void> | void;
  onToggle: (task: Task) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}

const TasksPage: React.FC<TasksPageProps> = ({
  tasks,
  loading,
  error,
  onCreate,
  onToggle,
  onDelete,
}) => {
  const [newTitle, setNewTitle] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    await onCreate(trimmed);
    setNewTitle("");
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
                onChange={() => onToggle(task)}
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
              onClick={() => onDelete(task.id)}
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