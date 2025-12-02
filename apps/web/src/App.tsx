import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import type { Task } from "./api/tasks";
import { getTasks, createTask, updateTask, deleteTask } from "./api/tasks";

const RequireAuth: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const hasToken =
    typeof window !== "undefined" && !!window.localStorage.getItem("token");

  if (!hasToken) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const Dashboard: React.FC = () => {
  const userName =
    typeof window !== "undefined"
      ? window.localStorage.getItem("userName") || "Student"
      : "Student";

  return (
    <div className="workspace-placeholder">
      <h2>Welcome, {userName}</h2>
      <p>
        This is your student workspace. In v1, you&apos;ll be able to write documents,
        track tasks, and later expand to email and spreadsheets.
      </p>
    </div>
  );
};

const App: React.FC = () => {
  const [isTodoOpen, setIsTodoOpen] = useState(true);

  // Tasks state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const hasToken =
    typeof window !== "undefined" && !!window.localStorage.getItem("token");

  // Load tasks when user is authenticated
  useEffect(() => {
    if (!hasToken) {
      setTasks([]);
      return;
    }

    (async () => {
      try {
        setTasksLoading(true);
        setTasksError(null);
        const data = await getTasks();
        setTasks(data);
      } catch (err: any) {
        console.error("Error loading tasks:", err);
        setTasksError("Unable to load tasks.");
      } finally {
        setTasksLoading(false);
      }
    })();
  }, [hasToken]);

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    try {
      const created = await createTask(newTaskTitle.trim());
      setTasks((prev) => [created, ...prev]);
      setNewTaskTitle("");
    } catch (err: any) {
      console.error("Error creating task:", err);
      setTasksError("Unable to create task.");
    }
  }

  async function handleToggleTask(task: Task) {
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
    } catch (err: any) {
      console.error("Error updating task:", err);
      setTasksError("Unable to update task.");
    }
  }

  async function handleDeleteTask(id: string) {
    // Optimistic remove
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteTask(id);
    } catch (err: any) {
      console.error("Error deleting task:", err);
      setTasksError("Unable to delete task.");
    }
  }

  return (
    <div className="app app-dark">
      {/* Left sidebar */}
      <aside className="sidebar-left">
        <div className="sidebar-logo">
          <span className="app-name">Pioneer Work Suite</span>
          <span className="app-tagline">Student</span>
        </div>

        <nav className="sidebar-nav">
          <Link className="nav-item" to="/dashboard">
            Dashboard
          </Link>
          <button className="nav-item" type="button" disabled>
            Documents (coming soon)
          </button>
          <button className="nav-item" type="button" disabled>
            Tasks (coming soon)
          </button>
        </nav>
      </aside>

      {/* Main content + right panel wrapper */}
      <div className="main-layout">
        {/* Main workspace */}
        <main className="workspace">
          <header className="workspace-header">
            <h1>Student Workspace</h1>
            <p className="workspace-subtitle">
              Sign in, register, and access your student dashboard.
            </p>
          </header>

          <section className="workspace-body">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route
                path="/dashboard"
                element={
                  <RequireAuth>
                    <Dashboard />
                  </RequireAuth>
                }
              />
              {/* Default route: if token, go to dashboard; else go to login */}
              <Route
                path="/"
                element={
                  hasToken ? (
                    <Navigate to="/dashboard" replace />
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />
              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </section>
        </main>

        {/* Right to-do panel */}
        <aside
          className={
            "sidebar-right" +
            (isTodoOpen ? " sidebar-right-open" : " sidebar-right-collapsed")
          }
        >
          <div className="todo-header">
            <button
              className="todo-toggle"
              onClick={() => setIsTodoOpen((open) => !open)}
              type="button"
            >
              {isTodoOpen ? "➜" : "⬅"}
            </button>
            {isTodoOpen && <h2 className="todo-title">To-Do</h2>}
          </div>

          {isTodoOpen && (
            <div className="todo-body">
              {!hasToken ? (
                <ul className="todo-list">
                  <li>Register a student account</li>
                  <li>Log in with your new account</li>
                  <li>Come back later for documents and tasks UI</li>
                </ul>
              ) : (
                <>
                  <form
                    onSubmit={handleAddTask}
                    style={{
                      display: "flex",
                      gap: 6,
                      marginBottom: 10,
                    }}
                  >
                    <input
                      type="text"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="Add a task..."
                      style={{
                        flex: 1,
                        padding: "6px 8px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "#05070a",
                        color: "#f5f5f5",
                        fontSize: 12,
                      }}
                    />
                    <button
                      type="submit"
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "none",
                        fontSize: 12,
                        cursor: "pointer",
                        background:
                          "linear-gradient(135deg, #3f64ff, #7f3dff)",
                        color: "#ffffff",
                      }}
                    >
                      +
                    </button>
                  </form>

                  {tasksLoading && (
                    <p style={{ fontSize: 12, color: "#9da2c8" }}>
                      Loading tasks...
                    </p>
                  )}

                  {tasksError && (
                    <p style={{ fontSize: 12, color: "#ff7b88" }}>
                      {tasksError}
                    </p>
                  )}

                  {!tasksLoading && tasks.length === 0 && !tasksError && (
                    <p style={{ fontSize: 12, color: "#9da2c8" }}>
                      No tasks yet. Add your first one above.
                    </p>
                  )}

                  <ul className="todo-list">
                    {tasks.map((task) => (
                      <li
                        key={task.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
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
                            onChange={() => handleToggleTask(task)}
                          />
                          <span
                            style={{
                              fontSize: 13,
                              textDecoration:
                                task.status === "done"
                                  ? "line-through"
                                  : "none",
                              color:
                                task.status === "done"
                                  ? "#6f7598"
                                  : "#f5f5f5",
                            }}
                          >
                            {task.title}
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => handleDeleteTask(task.id)}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            fontSize: 11,
                            opacity: 0.7,
                          }}
                          aria-label="Delete task"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default App;