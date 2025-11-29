// apps/web/src/App.tsx
import React, { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";

const App: React.FC = () => {
  const [isTodoOpen, setIsTodoOpen] = useState(true);

  return (
    <div className="app app-dark">
      {/* Left sidebar */}
      <aside className="sidebar-left">
        <div className="sidebar-logo">
          <span className="app-name">Pioneer Work Suite</span>
        </div>
        <nav className="sidebar-nav">
          <button className="nav-item" type="button">
            Dashboard
          </button>
          <button className="nav-item" type="button">
            Invoices
          </button>
          <button className="nav-item" type="button">
            Spreadsheets
          </button>
          <button className="nav-item" type="button">
            Email
          </button>
        </nav>
      </aside>

      {/* Main content + right panel wrapper */}
      <div className="main-layout">
        {/* Main workspace */}
        <main className="workspace">
          <header className="workspace-header">
            <h1>Workspace</h1>
            <p className="workspace-subtitle">
              This is where your active tool (invoices, sheets, email) will show.
            </p>
          </header>

          <section className="workspace-body">
            {/* Routes decide what appears in the workspace */}
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              {/* Later you’ll add more routes here (register, orgs, invoices, etc.) */}
              <Route path="*" element={<Navigate to="/login" replace />} />
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
                <li>Set up your first organization</li>
                <li>Create a test invoice</li>
                <li>Connect your email account</li>
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default App;