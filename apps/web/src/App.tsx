// apps/web/src/App.tsx
import React, { useState, useEffect } from "react";
import {
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate,
} from "react-router-dom";

import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import TasksPage from "./pages/TasksPage";
import DocumentsPage from "./pages/DocumentsPage";
import CalendarPage from "./pages/CalendarPage";
import MailPage from "./pages/MailPage";

import {
  fetchTasks,
  createTask,
  updateTask,
  deleteTask,
  Task,
} from "./api/tasks";
import { fetchDocuments, Document as Doc } from "./api/documents";

// ---- Right-sidebar mode ----
type SidebarMode = "tasks" | "documents";
const SIDEBAR_MODE_KEY = "pioneer-sidebar-mode";

function loadInitialSidebarMode(): SidebarMode {
  if (typeof window === "undefined") return "tasks";
  const stored = window.localStorage.getItem(SIDEBAR_MODE_KEY);
  return stored === "documents" ? "documents" : "tasks";
}

// ---- Auth guard ----
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

// ---- Dashboard v3 ----
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

  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [todayCount, setTodayCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  const [recentDocs, setRecentDocs] = useState<Doc[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // Load tasks for summary
        const tasks = await fetchTasks();

        const now = new Date();
        const todayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD

        let today = 0;
        let overdue = 0;
        let completed = 0;

        for (const t of tasks) {
          if (t.status === "done") {
            completed++;
          }

          if (!t.dueDate) continue;

          const d = new Date(t.dueDate);
          if (isNaN(d.getTime())) continue;

          const key = d.toISOString().slice(0, 10);

          if (key === todayKey) {
            today++;
          } else if (d < now && t.status !== "done") {
            overdue++;
          }
        }

        // Load recent documents
        const docs = await fetchDocuments();
        const sortedDocs = [...docs].sort((a, b) => {
          const aTime = new Date(a.updatedAt || a.createdAt).getTime();
          const bTime = new Date(b.updatedAt || b.createdAt).getTime();
          return bTime - aTime;
        });

        if (!cancelled) {
          setTodayCount(today);
          setOverdueCount(overdue);
          setCompletedCount(completed);
          setRecentDocs(sortedDocs.slice(0, 3));
        }
      } catch (err) {
        console.error("Error loading dashboard data:", err);
        if (!cancelled) {
          setError("Unable to load dashboard data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  function formatDocDate(raw: string): string {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  function goToTasks() {
    navigate("/tasks");
  }

  return (
    <div className="workspace-placeholder">
      <h2>Welcome, {userName}</h2>
      <p>
        This is your student workspace. Track your tasks, jump into recent
        documents, and choose what you want in the right sidebar.
      </p>

      {/* Summary row */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          marginTop: 16,
        }}
      >
        {/* Today card */}
        <div
          onClick={goToTasks}
          style={{
            flex: "1 1 120px",
            minWidth: 120,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)",
            background:
              "radial-gradient(circle at top, rgba(63,100,255,0.35), #050713)",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#c7ceff",
              marginBottom: 4,
            }}
          >
            Today
          </div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{todayCount}</div>
          <div style={{ fontSize: 11, color: "#aab0dd", marginTop: 2 }}>
            tasks due today
          </div>
        </div>

        {/* Overdue card */}
        <div
          onClick={goToTasks}
          style={{
            flex: "1 1 120px",
            minWidth: 120,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)",
            background:
              "radial-gradient(circle at top, rgba(255,118,118,0.3), #050713)",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#ffc0c4",
              marginBottom: 4,
            }}
          >
            Overdue
          </div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{overdueCount}</div>
          <div style={{ fontSize: 11, color: "#f2a3a6", marginTop: 2 }}>
            tasks past due
          </div>
        </div>

        {/* Completed card */}
        <div
          onClick={goToTasks}
          style={{
            flex: "1 1 120px",
            minWidth: 120,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)",
            background:
              "radial-gradient(circle at top, rgba(127,61,255,0.35), #050713)",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#e0c9ff",
              marginBottom: 4,
            }}
          >
            Completed
          </div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>
            {completedCount}
          </div>
          <div style={{ fontSize: 11, color: "#cdb3ff", marginTop: 2 }}>
            tasks finished
          </div>
        </div>
      </div>

      {/* Recent docs + sidebar preference row */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          marginTop: 18,
        }}
      >
        {/* Recent documents */}
        <div
          style={{
            flex: "2 1 220px",
            minWidth: 220,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "#050713",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              Recent documents
            </span>
            <Link
              to="/documents"
              style={{
                fontSize: 11,
                color: "#aeb7ff",
                textDecoration: "underline",
              }}
            >
              Open all
            </Link>
          </div>

          {loading && (
            <p style={{ fontSize: 12, color: "#9da2c8", margin: 0 }}>
              Loading…
            </p>
          )}
          {error && (
            <p style={{ fontSize: 12, color: "#ff7b88", margin: 0 }}>
              {error}
            </p>
          )}
          {!loading && !error && recentDocs.length === 0 && (
            <p style={{ fontSize: 12, color: "#9da2c8", margin: 0 }}>
              No documents yet. Create your first one on the Documents page.
            </p>
          )}
          {!loading && !error && recentDocs.length > 0 && (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {recentDocs.map((doc) => (
                <li
                  key={doc.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "4px 0",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {doc.title || "Untitled document"}
                  </span>
                  <span
                    style={{ fontSize: 11, color: "#6f7598", flexShrink: 0 }}
                  >
                    {formatDocDate(doc.updatedAt || doc.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right-sidebar preference card */}
        <div
          style={{
            flex: "1 1 180px",
            minWidth: 180,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "#050713",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            Right panel content
          </span>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: "#9da2c8",
            }}
          >
            Choose what you want to see in the right sidebar while you work.
          </p>

          <select
            value={sidebarMode}
            onChange={(e) =>
              onSidebarModeChange(
                e.target.value === "documents" ? "documents" : "tasks"
              )
            }
            style={{
              marginTop: 4,
              padding: "6px 10px",
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
        </div>
      </div>
    </div>
  );
};

// ---- App ----
const App: React.FC = () => {
  const navigate = useNavigate();

  const [isTodoOpen, setIsTodoOpen] = useState(false);

  const hasToken =
    typeof window !== "undefined" && !!window.localStorage.getItem("token");

  // Sidebar mode preference (for right sidebar)
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() =>
    loadInitialSidebarMode()
  );

  function handleSidebarModeChange(mode: SidebarMode) {
    setSidebarMode(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SIDEBAR_MODE_KEY, mode);
    }
  }

  // ---- Tasks state for right-hand panel ----
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  // ---- Documents list for right-hand panel ----
  const [sidebarDocs, setSidebarDocs] = useState<Doc[]>([]);
  const [sidebarDocsLoading, setSidebarDocsLoading] = useState(false);
  const [sidebarDocsError, setSidebarDocsError] = useState<string | null>(null);

  // Load tasks + docs for right sidebar when authenticated
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

      // Documents
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

  // Shared helper: create task from title (for sidebar form)
  async function createTaskFromTitle(title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;

    setTasksError(null);

    try {
      const created = await createTask(trimmed);
      setTasks((prev) => [created, ...prev]);
    } catch (err) {
      console.error("Error creating task:", err);
      setTasksError("Unable to create task.");
    }
  }

  // Sidebar-only "add task" handler
  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    await createTaskFromTitle(newTaskTitle);
    setNewTaskTitle("");
  }

  async function handleToggleTask(task: Task) {
    const nextStatus: Task["status"] =
      task.status === "done" ? "todo" : "done";

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
    setTasks((prev) => prev.filter((t) => t.id !== id));

    try {
      await deleteTask(id);
    } catch (err) {
      console.error("Error deleting task:", err);
      setTasksError("Unable to delete task.");
    }
  }

  // Logout
  function handleLogout() {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("token");
        window.localStorage.removeItem("userName");
      }
      setTasks([]);
      setSidebarDocs([]);
      setIsTodoOpen(false);
      navigate("/login", { replace: true });
    } catch (e) {
      console.error("Error during logout:", e);
      navigate("/login", { replace: true });
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
          <Link className="nav-item" to="/calendar">
            Calendar
          </Link>
          <Link className="nav-item" to="/mail">
            Mail
          </Link>
        </nav>

        {hasToken && (
          <button
            type="button"
            onClick={handleLogout}
            style={{
              marginTop: "auto",
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "transparent",
              color: "#f5f5f5",
              fontSize: 12,
              cursor: "pointer",
              alignSelf: "stretch",
            }}
          >
            Log out
          </button>
        )}
      </aside>

      <div className="main-layout">
        {/* Main workspace */}
        <main className="workspace">
          <header className="workspace-header">
            <h1>Student Workspace</h1>
            <p className="workspace-subtitle">
              Sign in, register, and access your dashboard, documents, tasks,
              calendar, and mail.
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
              <Route
                path="/calendar"
                element={
                  <RequireAuth>
                    <CalendarPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/mail"
                element={
                  <RequireAuth>
                    <MailPage />
                  </RequireAuth>
                }
              />
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
                  {/* Tasks-only right panel */}
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
                  {/* Documents-only right panel */}
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