import React, { Suspense, lazy } from "react";
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
import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import PageLoadingFallback from "./PageLoadingFallback";

const CalendarPage = lazy(() => import("../pages/CalendarPage"));
const DashboardPage = lazy(() => import("../pages/DashboardPage"));
const DocumentsPage = lazy(() => import("../pages/DocumentsPage"));
const MailPage = lazy(() => import("../pages/MailPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const TasksPage = lazy(() => import("../pages/TasksPage"));

interface AppRoutesProps {
  workspaceAccessible: boolean;
  startupPage: StartupPagePreference;
  recoveredPath: string | null;
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
  recoveredPath,
  sidebarMode,
  onSidebarModeChange,
}) => {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
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
        path="/tasks/archive"
        element={
          <RequireAuth>
            <TasksPage archivedOnly />
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
                to={recoveredPath ?? getStartupPath(startupPage)}
                replace
              />
            )
            : <Navigate to="/login" replace />
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
};

export default AppRoutes;
