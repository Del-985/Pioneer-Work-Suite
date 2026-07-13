import React from "react";
import {
  useNavigate,
} from "react-router-dom";

import {
  useRightSidebarData,
} from "../hooks/useRightSidebarData";
import type {
  RightSidebarMode,
} from "../types/rightSidebar";
import RightSidebarDocumentsPanel from "./right-sidebar/RightSidebarDocumentsPanel";
import RightSidebarTasksPanel from "./right-sidebar/RightSidebarTasksPanel";

import "../styles/right-sidebar.css";

interface RightSidebarProps {
  isOpen: boolean;
  mode: RightSidebarMode;
  workspaceAccessible: boolean;
  cloudConnected: boolean;
  onToggle: () => void | Promise<void>;
  onModeChange: (
    mode: RightSidebarMode
  ) => void | Promise<void>;
}

const RightSidebar: React.FC<RightSidebarProps> = ({
  isOpen,
  mode,
  workspaceAccessible,
  cloudConnected,
  onToggle,
  onModeChange,
}) => {
  const navigate = useNavigate();
  const data = useRightSidebarData(
    workspaceAccessible,
    cloudConnected
  );

  return (
    <aside
      className={
        "sidebar-right " +
        (isOpen
          ? "sidebar-right-open"
          : "sidebar-right-collapsed")
      }
      aria-label="Workspace sidebar"
    >
      <header className="right-sidebar__header">
        <button
          className="right-sidebar__toggle"
          type="button"
          onClick={() => void onToggle()}
          aria-label={
            isOpen
              ? "Collapse right sidebar"
              : "Expand right sidebar"
          }
          title={
            isOpen
              ? "Collapse sidebar"
              : "Expand sidebar"
          }
        >
          {isOpen ? "→" : "←"}
        </button>

        {isOpen && (
          <>
            <h2>
              {mode === "tasks" ? "Tasks" : "Documents"}
            </h2>

            <div
              className="right-sidebar__mode-switch"
              role="group"
              aria-label="Sidebar content"
            >
              <button
                type="button"
                className={mode === "tasks" ? "is-active" : ""}
                onClick={() => void onModeChange("tasks")}
              >
                Tasks
              </button>
              <button
                type="button"
                className={mode === "documents" ? "is-active" : ""}
                onClick={() => void onModeChange("documents")}
              >
                Docs
              </button>
            </div>
          </>
        )}
      </header>

      {isOpen && (
        <div className="right-sidebar__body">
          {!workspaceAccessible ? (
            <div className="right-sidebar__empty">
              <p>
                Connect or create a workspace to use tasks and documents.
              </p>
              <button
                type="button"
                onClick={() => navigate("/login")}
              >
                Connect workspace
              </button>
            </div>
          ) : mode === "tasks" ? (
            <RightSidebarTasksPanel
              tasks={data.sortedTasks}
              loading={data.tasksLoading}
              error={data.tasksError}
              summary={data.taskSummary}
              newTaskTitle={data.newTaskTitle}
              creatingTask={data.creatingTask}
              onNewTaskTitleChange={data.setNewTaskTitle}
              onCreateTask={data.createSidebarTask}
              onToggleTask={data.toggleSidebarTask}
              onDeleteTask={data.deleteSidebarTask}
              onOpenTasks={() => navigate("/tasks")}
            />
          ) : (
            <RightSidebarDocumentsPanel
              documents={data.sortedDocuments}
              loading={data.documentsLoading}
              error={data.documentsError}
              onOpenDocument={() => navigate("/documents")}
              onOpenDocuments={() => navigate("/documents")}
            />
          )}
        </div>
      )}
    </aside>
  );
};

export default RightSidebar;

