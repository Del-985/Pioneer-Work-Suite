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
import DashboardPage from "./pages/DashboardPage";

import {
  createTask,
  deleteTask,
  fetchTasks,
  Task,
  updateTask,
} from "./api/tasks";

import {
  Document as SuiteDocument,
  fetchDocuments,
} from "./api/documents";

import UpdateBanner from "./components/UpdateBanner";
import StatusBar from "./components/StatusBar";

import { startSyncCoordinator } from "./api/sync";

import {
  disconnectCloudSession,
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

function toSidebarMode(
  preference: AppSettings["sidebar"]["rightSidebarDefault"]
): SidebarMode {
  return preference === "documents" ? "documents" : "tasks";
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
  return (
    <DashboardPage
      sidebarMode={sidebarMode}
      onSidebarModeChange={onSidebarModeChange}
    />
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
    return startSyncCoordinator();
  }, []);

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

      <StatusBar />
    </div>
  );
};

export default App;
