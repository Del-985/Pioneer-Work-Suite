import React from "react";
import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import {
  hasWorkspaceAccess,
} from "../api/session";
import {
  getStartupPath,
} from "../api/settings";
import type {
  StartupPagePreference,
} from "../api/settings";
import type {
  RightSidebarMode,
} from "../types/rightSidebar";
import CalendarPage from "../pages/CalendarPage";
import DashboardPage from "../pages/DashboardPage";
import DocumentsPage from "../pages/DocumentsPage";
import LoginPage from "../pages/LoginPage";
import MailPage from "../pages/MailPage";
import RegisterPage from "../pages/RegisterPage";
import SettingsPage from "../pages/SettingsPage";
import TasksPage from "../pages/TasksPage";

interface AppRoutesProps {
  workspaceAccessible: boolean;
  startupPage: StartupPagePreference;
  sidebarMode: RightSidebarMode;
  onSidebarModeChange: (
    mode: RightSidebarMode
  ) => void | Promise<void>;
}

const RequireAuth: React.FC<{
  children: React.ReactElement;
}> = ({ children }) => {
  return hasWorkspaceAccess()
    ? children
    : <Navigate to="/login" replace />;
};

const AppRoutes: React.FC<AppRoutesProps> = ({
  workspaceAccessible,
  startupPage,
  sidebarMode,
  onSidebarModeChange,
}) => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <DashboardPage
              sidebarMode={sidebarMode}
              onSidebarModeChange={onSidebarModeChange}
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
          workspaceAccessible
            ? (
              <Navigate
                to={getStartupPath(startupPage)}
                replace
              />
            )
            : <Navigate to="/login" replace />
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;

