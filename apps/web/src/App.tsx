import React, { useState } from "react";

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
          <button className="nav-item" type="button">
            Dashboard
          </button>
          <button className="nav-item" type="button">
            Documents
          </button>
          <button className="nav-item" type="button">
            Tasks
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
              This is your hub for writing, tasks, and future tools like email and spreadsheets.
            </p>
          </header>

          <section className="workspace-body">
            <div className="workspace-placeholder">
              <h2>Welcome to Pioneer (Student)</h2>
              <p>
                The backend is live. Next up: we&apos;ll add login and registration to connect to your
                student account, then hook documents and tasks into this workspace.
              </p>
            </div>
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
                <li>Wire login to /auth/login</li>
                <li>Wire register to /auth/register</li>
                <li>Hook documents UI to /documents</li>
                <li>Hook tasks UI to /tasks</li>
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default App;