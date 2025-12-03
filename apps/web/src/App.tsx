// apps/web/src/App.tsx
import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import TasksPage from "./pages/TasksPage";
import DocumentsPage from "./pages/DocumentsPage";
import {
  fetchTasks,
  createTask,
  updateTask,
  deleteTask,
  Task,
} from "./api/tasks";
import {
  fetchDocuments,
  Document as Doc,
} from "./api/documents";

type SidebarMode = "tasks" | "documents";
const SIDEBAR_MODE_KEY = "pioneer-sidebar-mode";

function loadInitialSidebarMode(): SidebarMode {
  if (typeof window === "undefined") return "tasks";
  const stored = window.localStorage.getItem(SIDEBAR_MODE_KEY);
  return stored === "documents" ? "documents" : "tasks";
}

const RequireAuth: React.FC<{ children: React.ReactElement }> = ({
  children,
}) => {
  const hasToken =
    typeof window !== "undefined" && !!window.localStorage.getItem("token");

  if (!hasToken) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

interface DashboardProps {
  sidebarMode: SidebarMode;
  onSidebarModeChange: (mode: SidebarMode) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  sidebarMode,
  onSidebarModeChange,
}) => {
  const userName =
    typeof window !== "undefined"
      ? window.localStorage.getItem("userName") || "Student"
      : "Student";

  return (
    <div className="workspace-placeholder">
      <h2>Welcome, {userName}</h2>
      <p>
        This is your student workspace. In v1, you&apos;ll be able to write
        documents, track tasks, and later expand to email and spreadsheets.
      </p>

      {/* Simple “settings” for right panel content */}
      <div style={{ marginTop: 12 }}>
        <label style={{ fontSize: 13, color: "#9da2c8" }}>
          Right panel content:
          <select
            value={sidebarMode}
            onChange={(e) =>
              onSidebarModeChange(
                e.target.value === "documents" ? "documents" : "tasks"
              )
            }
            style={{
              marginLeft: 6,
              padding: "4px 6px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "#05070a",
              color: "#f5f5f5",
              fontSize: 12,
            }}
          >
            <option value="tasks">Tasks</option>
            <option value="documents">Documents</option>
          </select>
        </label>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  // start collapsed so the bottom panel isn't in your face
  const [isTodoOpen, setIsTodoOpen] = useState(false);

  const hasToken =
    typeof window !== "undefined" && !!window.localStorage.getItem("token");

  // Sidebar mode is now a user setting (Tasks vs Documents)
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() =>
    loadInitialSidebarMode()
  );

  function handleSidebarModeChange(mode: SidebarMode) {
    setSidebarMode(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SIDEBAR_MODE_KEY, mode);
    }
  }

  // ---- Tasks state for the right-hand panel ----
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  // ---- Documents state for the right-hand panel (list only) ----
  const [sidebarDocs, setSidebarDocs] = useState<Doc[]>([]);
  const [sidebarDocsLoading, setSidebarDocsLoading] = useState(false);
  const [sidebarDocsError, setSidebarDocsError] = useState<string | null>(null);

  // Load tasks + documents when authenticated
  useEffect(() => {
    if (!hasToken) {
      setTasks([]);
      setSidebarDocs([]);
      return;
    }

    (async () => {
      // Tasks
      try {
        setTasksLoading(true);
        setTasksError(null);
        const loadedTasks = await fetchTasks();
        setTasks(loadedTasks);
      } catch (err) {
        console.error("Error loading tasks:", err);
        setTasksError("Unable to load tasks.");
      } finally {
        setTasksLoading(false);
      }

      // Documents (for sidebar list)
      try {
        setSidebarDocsLoading(true);
        setSidebarDocsError(null);
        const docs = await fetchDocuments();
        setSidebarDocs(docs);
      } catch (err) {
        console.error("Error loading documents for sidebar:", err);
        setSidebarDocsError("Unable to load documents.");
      } finally {
        setSidebarDocsLoading(false);
      }
    })();
  }, [hasToken]);

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    // Clear any stale error when trying again
    setTasksError(null);

    try {
      const created = await createTask(newTaskTitle.trim());
      setTasks((prev) => [created, ...prev]);
      setNewTaskTitle("");
    } catch (err) {
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
    } catch (err) {
      console.error("Error updating task:", err);
      setTasksError("Unable to update task.");
    }
  }

  async function handleDeleteTask(id: string) {
    // Optimistic remove
    setTasks((prev) => prev.filter((t) => t.id !== id));

    try {
      await deleteTask(id);
    } catch (err) {
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
          <Link className="nav-item" to="/documents">
            Documents
          </Link>
          <Link className="nav-item" to="/tasks">
            Tasks
          </Link>
        </nav>
      </aside>

      {/* Main content + right panel wrapper */}
      <div className="main-layout">
        {/* Main workspace */}
        <main className="workspace">
          <header className="workspace-header">
            <h1>Student Workspace</h1>
            <p className="workspace-subtitle">
              Sign in, register, and access your dashboard, documents, and tasks.
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
                    <Dashboard
                      sidebarMode={sidebarMode}
                      onSidebarModeChange={handleSidebarModeChange}
                    />
                  </RequireAuth>
                }
              />
              <Route
                path="/documents"
                element={
                  <RequireAuth>
                    <DocumentsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/tasks"
                element={
                  <RequireAuth>
                    <TasksPage />
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

        {/* Right panel */}
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
            {isTodoOpen && (
              <h2 className="todo-title">
                {sidebarMode === "tasks" ? "Tasks" : "Documents"}
              </h2>
            )}
          </div>

          {isTodoOpen && (
            <div className="todo-body">
              {!hasToken ? (
                <ul className="todo-list">
                  <li>Register a student account</li>
                  <li>Log in with your new account</li>
                  <li>Come back later for documents and tasks UI</li>
                </ul>
              ) : sidebarMode === "tasks" ? (
                <>
                  {/* Tasks-only panel */}
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

                  {!tasksLoading &&
                    tasks.length === 0 &&
                    !tasksError && (
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
              ) : (
                <>
                  {/* Documents-only panel (mini list) */}
                  {sidebarDocsLoading && (
                    <p style={{ fontSize: 12, color: "#9da2c8" }}>
                      Loading documents...
                    </p>
                  )}

                  {sidebarDocsError && (
                    <p style={{ fontSize: 12, color: "#ff7b88" }}>
                      {sidebarDocsError}
                    </p>
                  )}

                  {!sidebarDocsLoading &&
                    sidebarDocs.length === 0 &&
                    !sidebarDocsError && (
                      <p style={{ fontSize: 12, color: "#9da2c8" }}>
                        No documents yet. Create one from the Documents page.
                      </p>
                    )}

                  <ul className="todo-list">
                    {sidebarDocs.map((doc) => (
                      <li
                        key={doc.id}
                        style={{
                          padding: "4px 2px",
                          fontSize: 12,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {doc.title || "Untitled document"}
                      </li>
                    ))}
                  </ul>

                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      justifyContent: "flex-end",
                    }}
                  >
                    <Link
                      to="/documents"
                      style={{
                        fontSize: 11,
                        color: "#aeb7ff",
                        textDecoration: "underline",
                      }}
                    >
                      Open Documents
                    </Link>
                  </div>
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