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

import UpdateBanner from "./components/UpdateBanner";
import StatusBar from "./components/StatusBar";
import RightSidebar, {
  type RightSidebarMode,
} from "./components/RightSidebar";
import GlobalSearch, { openGlobalSearch } from "./components/GlobalSearch";

import "./styles/app-shell.css";

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

type SidebarMode = RightSidebarMode;

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

const App: React.FC = () => {
  const navigate = useNavigate();

  const initialSettings = useRef<AppSettings>(
    getSettingsSnapshot()
  ).current;

  const settingsRef = useRef<AppSettings>(initialSettings);

  const [settings, setSettings] = useState<AppSettings>(
    initialSettings
  );

  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(
    initialSettings.sidebar.rightSidebarOpen
  );

  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(
    toSidebarMode(initialSettings.sidebar.rightSidebarDefault)
  );

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
        setIsRightSidebarOpen(
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
    const nextOpen = !isRightSidebarOpen;

    setIsRightSidebarOpen(nextOpen);

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

  function handleDisconnectCloud() {
    disconnectCloudSession();

    setIsRightSidebarOpen(false);
    navigate(
      getStartupPath(settings.workspace.startupPage),
      { replace: true }
    );
  }

  return (
    <div className="app">
      <UpdateBanner />
      <GlobalSearch />
      <KeyboardShortcutsManager />

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
          <button
            className="nav-item sidebar-search-button"
            type="button"
            onClick={openGlobalSearch}
          >
            Search
            <span>Ctrl K</span>
          </button>
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
          className="sidebar-cloud-button"
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
                    <DashboardPage
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
          <RightSidebar
            isOpen={isRightSidebarOpen}
            mode={sidebarMode}
            workspaceAccessible={workspaceAccessible}
            cloudConnected={cloudConnected}
            onToggle={handleSidebarToggle}
            onModeChange={handleSidebarModeChange}
          />
        )}
      </div>

      <StatusBar />
    </div>
  );
};

export default App;
