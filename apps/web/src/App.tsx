// apps/web/src/App.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";

import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import TasksPage from "./pages/TasksPage";
import DocumentsPage from "./pages/DocumentsPage";
import CalendarPage from "./pages/CalendarPage";
import MailPage from "./pages/MailPage";
import SettingsPage from "./pages/SettingsPage";

import {
  createTask,
  deleteTask,
  fetchTasks,
  Task,
  trySyncTasksIfOnline,
  updateTask,
} from "./api/tasks";

import {
  Document as SuiteDocument,
  fetchDocuments,
  trySyncDocumentsIfOnline,
} from "./api/documents";

import UpdateBanner from "./components/UpdateBanner";
import {
  disconnectCloudSession,
  getWorkspaceName,
  hasCloudSession,
  hasWorkspaceAccess,
} from "./api/session";

import {
  AppSettings,
  getSettingsSnapshot,
  getStartupPath,
  subscribeToSettings,
  updateSettings,
} from "./api/settings";

type SidebarMode = "tasks" | "documents";

const APP_VERSION = import.meta.env.VITE_APP_VERSION || "0.0.0";

function toSidebarMode(
  preference: AppSettings["sidebar"]["rightSidebarDefault"]
): SidebarMode {
  return preference === "documents" ? "documents" : "tasks";
}

function formatDocumentDate(raw: string | undefined): string {
  if (!raw) {
    return "";
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const RequireAuth: React.FC<{ children: React.ReactElement }> = ({
  children,
}) => {
  if (!hasWorkspaceAccess()) {
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
  const navigate = useNavigate();

  const userName = getWorkspaceName();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [todayCount, setTodayCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  const [recentDocuments, setRecentDocuments] = useState<SuiteDocument[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setLoadError(null);

      try {
        const [tasks, documents] = await Promise.all([
          fetchTasks(),
          fetchDocuments(),
        ]);

        const now = new Date();
        const todayKey = now.toISOString().slice(0, 10);

        let today = 0;
        let overdue = 0;
        let completed = 0;

        for (const task of tasks) {
          if (task.status === "done") {
            completed += 1;
          }

          if (!task.dueDate) {
            continue;
          }

          const dueDate = new Date(task.dueDate);

          if (Number.isNaN(dueDate.getTime())) {
            continue;
          }

          const dueKey = dueDate.toISOString().slice(0, 10);

          if (dueKey === todayKey) {
            today += 1;
          } else if (dueDate < now && task.status !== "done") {
            overdue += 1;
          }
        }

        const sortedDocuments = [...documents].sort((a, b) => {
          const aTime = new Date(a.updatedAt || a.createdAt).getTime();
          const bTime = new Date(b.updatedAt || b.createdAt).getTime();

          return bTime - aTime;
        });

        if (!cancelled) {
          setTodayCount(today);
          setOverdueCount(overdue);
          setCompletedCount(completed);
          setRecentDocuments(sortedDocuments.slice(0, 3));
        }
      } catch (error) {
        console.error("Unable to load dashboard:", error);

        if (!cancelled) {
          setLoadError("Unable to load dashboard data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="workspace-placeholder">
      <h2>Welcome, {userName}</h2>
      <p>
        This is your student workspace. Track tasks, write documents, and keep
        your right sidebar focused on the information you use most.
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          marginTop: 16,
        }}
      >
        <button
          type="button"
          onClick={() => navigate("/tasks")}
          style={{
            flex: "1 1 130px",
            minWidth: 130,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)",
            background:
              "radial-gradient(circle at top, rgba(63,100,255,0.35), #050713)",
            color: "#f5f5f5",
            cursor: "pointer",
            textAlign: "left",
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
        </button>

        <button
          type="button"
          onClick={() => navigate("/tasks")}
          style={{
            flex: "1 1 130px",
            minWidth: 130,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)",
            background:
              "radial-gradient(circle at top, rgba(255,118,118,0.3), #050713)",
            color: "#f5f5f5",
            cursor: "pointer",
            textAlign: "left",
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
        </button>

        <button
          type="button"
          onClick={() => navigate("/tasks")}
          style={{
            flex: "1 1 130px",
            minWidth: 130,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)",
            background:
              "radial-gradient(circle at top, rgba(127,61,255,0.35), #050713)",
            color: "#f5f5f5",
            cursor: "pointer",
            textAlign: "left",
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
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          marginTop: 18,
        }}
      >
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

          {loadError && (
            <p style={{ fontSize: 12, color: "#ff7b88", margin: 0 }}>
              {loadError}
            </p>
          )}

          {!loading && !loadError && recentDocuments.length === 0 && (
            <p style={{ fontSize: 12, color: "#9da2c8", margin: 0 }}>
              No documents yet. Create your first one on the Documents page.
            </p>
          )}

          {!loading && !loadError && recentDocuments.length > 0 && (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {recentDocuments.map((document) => (
                <li
                  key={document.id}
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
                    {document.title || "Untitled document"}
                  </span>

                  <span
                    style={{
                      fontSize: 11,
                      color: "#6f7598",
                      flexShrink: 0,
                    }}
                  >
                    {formatDocumentDate(
                      document.updatedAt || document.createdAt
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

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
            onChange={(event) =>
              onSidebarModeChange(
                event.target.value === "documents" ? "documents" : "tasks"
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

const App: React.FC = () => {
  const navigate = useNavigate();

  const initialSettings = useRef<AppSettings>(
    getSettingsSnapshot()
  ).current;

  const settingsRef = useRef<AppSettings>(initialSettings);

  const [settings, setSettings] = useState<AppSettings>(
    initialSettings
  );

  const [isTodoOpen, setIsTodoOpen] = useState(
    initialSettings.sidebar.rightSidebarOpen
  );

  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(
    toSidebarMode(initialSettings.sidebar.rightSidebarDefault)
  );

  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const [sidebarDocuments, setSidebarDocuments] = useState<SuiteDocument[]>(
    []
  );
  const [sidebarDocumentsLoading, setSidebarDocumentsLoading] = useState(false);
  const [sidebarDocumentsError, setSidebarDocumentsError] = useState<
    string | null
  >(null);

  const workspaceAccessible = hasWorkspaceAccess();
  const cloudConnected = hasCloudSession();

  useEffect(() => {
    return subscribeToSettings((nextSettings) => {
      const previousSettings = settingsRef.current;

      settingsRef.current = nextSettings;
      setSettings(nextSettings);

      if (
        previousSettings.sidebar.rightSidebarDefault !==
        nextSettings.sidebar.rightSidebarDefault
      ) {
        setSidebarMode(
          toSidebarMode(
            nextSettings.sidebar.rightSidebarDefault
          )
        );
      }

      if (
        previousSettings.sidebar.rightSidebarOpen !==
        nextSettings.sidebar.rightSidebarOpen
      ) {
        setIsTodoOpen(
          nextSettings.sidebar.rightSidebarOpen
        );
      }
    });
  }, []);

  async function handleSidebarModeChange(
    mode: SidebarMode
  ): Promise<void> {
    setSidebarMode(mode);

    try {
      await updateSettings({
        sidebar: {
          rightSidebarDefault: mode,
        },
      });
    } catch (error) {
      console.error(
        "Unable to save sidebar content setting:",
        error
      );
    }
  }

  async function handleSidebarToggle(): Promise<void> {
    const nextOpen = !isTodoOpen;

    setIsTodoOpen(nextOpen);

    if (!settings.sidebar.rememberOpenState) {
      return;
    }

    try {
      await updateSettings({
        sidebar: {
          rightSidebarOpen: nextOpen,
        },
      });
    } catch (error) {
      console.error(
        "Unable to save sidebar open state:",
        error
      );
    }
  }

  useEffect(() => {
    if (!cloudConnected || typeof window === "undefined") {
      return;
    }

    let disposed = false;

    const sync = () => {
      if (disposed) {
        return;
      }

      void trySyncTasksIfOnline();
      void trySyncDocumentsIfOnline();
    };

    sync();

    window.addEventListener("online", sync);

    const interval = window.setInterval(sync, 60_000);

    return () => {
      disposed = true;
      window.removeEventListener("online", sync);
      window.clearInterval(interval);
    };
  }, [cloudConnected]);

  useEffect(() => {
    let cancelled = false;

    async function loadSidebarData() {
      if (!workspaceAccessible) {
        setTasks([]);
        setSidebarDocuments([]);
        setTasksError(null);
        setSidebarDocumentsError(null);
        return;
      }

      setTasksLoading(true);
      setSidebarDocumentsLoading(true);
      setTasksError(null);
      setSidebarDocumentsError(null);

      const [taskResult, documentResult] = await Promise.allSettled([
        fetchTasks(),
        fetchDocuments(),
      ]);

      if (cancelled) {
        return;
      }

      if (taskResult.status === "fulfilled") {
        setTasks(taskResult.value);
      } else {
        console.error("Unable to load sidebar tasks:", taskResult.reason);
        setTasksError("Unable to load tasks.");
      }

      if (documentResult.status === "fulfilled") {
        setSidebarDocuments(documentResult.value);
      } else {
        console.error(
          "Unable to load sidebar documents:",
          documentResult.reason
        );
        setSidebarDocumentsError("Unable to load documents.");
      }

      setTasksLoading(false);
      setSidebarDocumentsLoading(false);
    }

    void loadSidebarData();

    return () => {
      cancelled = true;
    };
  }, [workspaceAccessible, cloudConnected]);

  async function handleAddTask(event: React.FormEvent) {
    event.preventDefault();

    const title = newTaskTitle.trim();

    if (!title) {
      return;
    }

    setTasksError(null);

    try {
      const created = await createTask(title);

      setTasks((current) => [
        created,
        ...current.filter((task) => task.id !== created.id),
      ]);

      setNewTaskTitle("");
    } catch (error) {
      console.error("Unable to create task:", error);
      setTasksError("Unable to create task.");
    }
  }

  async function handleToggleTask(task: Task) {
    const nextStatus: Task["status"] =
      task.status === "done" ? "todo" : "done";

    setTasks((current) =>
      current.map((entry) =>
        entry.id === task.id ? { ...entry, status: nextStatus } : entry
      )
    );

    setTasksError(null);

    try {
      const updated = await updateTask(task.id, {
        status: nextStatus,
      });

      setTasks((current) =>
        current.map((entry) =>
          entry.id === task.id ? { ...entry, ...updated } : entry
        )
      );
    } catch (error) {
      console.error("Unable to update task:", error);
      setTasksError("Unable to update task.");
    }
  }

  async function handleDeleteTask(id: string) {
    const previousTasks = tasks;

    setTasks((current) => current.filter((task) => task.id !== id));
    setTasksError(null);

    try {
      await deleteTask(id);
    } catch (error) {
      console.error("Unable to delete task:", error);
      setTasks(previousTasks);
      setTasksError("Unable to delete task.");
    }
  }

  function handleDisconnectCloud() {
    disconnectCloudSession();

    setIsTodoOpen(false);
    navigate(
      getStartupPath(settings.workspace.startupPage),
      { replace: true }
    );
  }

  return (
    <div className="app">
      <UpdateBanner />

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
          <Link className="nav-item" to="/settings">
            Settings
          </Link>
        </nav>

        <button
          type="button"
          onClick={() => {
            if (cloudConnected) {
              handleDisconnectCloud();
            } else {
              navigate("/login");
            }
          }}
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
          {cloudConnected ? "Disconnect cloud" : "Connect cloud"}
        </button>
      </aside>

      <div className="main-layout">
        <main className="workspace">
          <header className="workspace-header">
            <h1>Student Workspace</h1>
            <p className="workspace-subtitle">
              Work locally by default. Connect a cloud account when you want
              to sync across devices.
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
                path="/settings"
                element={
                  <RequireAuth>
                    <SettingsPage />
                  </RequireAuth>
                }
              />

              <Route
                path="/"
                element={
                  workspaceAccessible ? (
                    <Navigate
                      to={getStartupPath(
                        settings.workspace.startupPage
                      )}
                      replace
                    />
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </section>
        </main>

        {settings.sidebar.rightSidebarVisible && (
          <aside
            className={
              "sidebar-right" +
              (isTodoOpen
                ? " sidebar-right-open"
                : " sidebar-right-collapsed")
            }
          >
          <div className="todo-header">
            <button
              className="todo-toggle"
              type="button"
              onClick={() => void handleSidebarToggle()}
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
              {!workspaceAccessible ? (
                <ul className="todo-list">
                  <li>Register a student account</li>
                  <li>Log in with your new account</li>
                  <li>Use the workspace after signing in</li>
                </ul>
              ) : sidebarMode === "tasks" ? (
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
                      onChange={(event) => setNewTaskTitle(event.target.value)}
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
                      Loading tasks…
                    </p>
                  )}

                  {tasksError && (
                    <p style={{ fontSize: 12, color: "#ff7b88" }}>
                      {tasksError}
                    </p>
                  )}

                  {!tasksLoading && !tasksError && tasks.length === 0 && (
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
                            onChange={() => void handleToggleTask(task)}
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
                          onClick={() => void handleDeleteTask(task.id)}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            fontSize: 11,
                            opacity: 0.7,
                          }}
                          aria-label={`Delete ${task.title}`}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  {sidebarDocumentsLoading && (
                    <p style={{ fontSize: 12, color: "#9da2c8" }}>
                      Loading documents…
                    </p>
                  )}

                  {sidebarDocumentsError && (
                    <p style={{ fontSize: 12, color: "#ff7b88" }}>
                      {sidebarDocumentsError}
                    </p>
                  )}

                  {!sidebarDocumentsLoading &&
                    !sidebarDocumentsError &&
                    sidebarDocuments.length === 0 && (
                      <p style={{ fontSize: 12, color: "#9da2c8" }}>
                        No documents yet. Create one from the Documents page.
                      </p>
                    )}

                  <ul className="todo-list">
                    {sidebarDocuments.map((document) => (
                      <li
                        key={document.id}
                        style={{
                          padding: "4px 2px",
                          fontSize: 12,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {document.title || "Untitled document"}
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
        )}
      </div>

      <span
        aria-label={`Pioneer Work Suite version ${APP_VERSION}`}
        style={{
          position: "fixed",
          right: 10,
          bottom: 8,
          zIndex: 10000,
          padding: "3px 7px",
          borderRadius: 999,
          background: "rgba(5, 7, 19, 0.82)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "#8d94bd",
          fontSize: 10,
          lineHeight: 1,
          pointerEvents: "none",
        }}
      >
        v{APP_VERSION}
      </span>
    </div>
  );
};

export default App;
