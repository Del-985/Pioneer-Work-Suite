import React, { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

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

  return (
    <div className="app app-dark">
      {/* Left sidebar */}
      <aside className="sidebar-left">
        <div className="sidebar-logo">
          <span className="app-name">Pioneer Work Suite</span>
          <span className="app-tagline">Student</span>
        </div>

        <nav className="sidebar-nav">
          <button
            className="nav-item"
            type="button"
            onClick={() => {
              window.location.href = "/Pioneer-Work-Suite/dashboard";
            }}
          >
            Dashboard
          </button>
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
                  typeof window !== "undefined" &&
                  window.localStorage.getItem("token") ? (
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
              <ul className="todo-list">
                <li>Register a student account</li>
                <li>Log in with your new account</li>
                <li>Come back later for documents and tasks UI</li>
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default App;