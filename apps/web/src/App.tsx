// apps/web/src/App.tsx
import React from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import TasksPage from "./pages/TasksPage";
import DocumentsPage from "./pages/DocumentsPage";
import RightSidebar from "./components/RightSidebar";

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
        This is your student workspace. You&apos;ll be able to write documents,
        track tasks, and later expand to email and spreadsheets.
      </p>
    </div>
  );
};

const App: React.FC = () => {
  const hasToken =
    typeof window !== "undefined" && !!window.localStorage.getItem("token");

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

      <div className="main-layout">
        {/* Main workspace */}
        <main className="workspace">
          <header className="workspace-header">
            <h1>Student Workspace</h1>
            <p className="workspace-subtitle">
              Sign in, register, and access your dashboard, documents, and
              tasks.
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

        {/* Right sidebar */}
        <RightSidebar />
      </div>
    </div>
  );
};

export default App;