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

const Dashboard: React.FC = () => {
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
    </div>
  );
};

const App: React.FC = () => {
  // start collapsed so the bottom panel isn't in your face
  const [isTodoOpen, setIsTodoOpen] = useState(false);

  const hasToken =
    typeof window !== "undefined" && !!window.localStorage.getItem("token");

  // ---- Sidebar mode: tasks vs documents ----
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("tasks");

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
                    <Dashboard />
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
            {isTodoOpen && <h2 className="todo-title">Panel</h2>}
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
                  {/* Mode selector */}
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      marginBottom: 10,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setSidebarMode("tasks")}
                      style={{
                        flex: 1,
                        padding: "4px 6px",
                        borderRadius: 999,
                        border:
                          sidebarMode === "tasks"
                            ? "1px solid rgba(63,100,255,0.9)"
                            : "1px solid rgba(255,255,255,0.18)",
                        background:
                          sidebarMode === "tasks"
                            ? "rgba(63,100,255,0.15)"
                            : "transparent",
                        color: "#f5f5f5",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Tasks
                    </button>
                    <button
                      type="button"
                      onClick={() => setSidebarMode("documents")}
                      style={{
                        flex: 1,
                        padding: "4px 6px",
                        borderRadius: 999,
                       