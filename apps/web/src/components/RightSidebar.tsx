import React from "react";
import { useNavigate } from "react-router-dom";

import { useRightSidebarData } from "../hooks/useRightSidebarData";
import {
  getRightSidebarModeLabel,
  RIGHT_SIDEBAR_MODE_OPTIONS,
} from "../types/rightSidebar";
import type { RightSidebarMode } from "../types/rightSidebar";
import RightSidebarCalendarPanel from "./right-sidebar/RightSidebarCalendarPanel";
import RightSidebarDocumentsPanel from "./right-sidebar/RightSidebarDocumentsPanel";
import RightSidebarStatisticsPanel from "./right-sidebar/RightSidebarStatisticsPanel";
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
    cloudConnected,
    mode,
    isOpen
  );

  function renderPanel(): React.ReactNode {
    if (!workspaceAccessible) {
      return (
        <div className="right-sidebar__empty">
          <p>
            Connect or create a workspace to use the sidebar.
          </p>
          <button
            type="button"
            onClick={() => navigate("/login")}
          >
            Connect workspace
          </button>
        </div>
      );
    }

    if (mode === "tasks") {
      return (
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
      );
    }

    if (
      mode === "recent_documents" ||
      mode === "pinned_documents"
    ) {
      const pinned = mode === "pinned_documents";

      return (
        <RightSidebarDocumentsPanel
          documents={
            pinned
              ? data.pinnedDocuments
              : data.recentDocuments
          }
          loading={data.documentsLoading}
          error={data.documentsError}
          emptyMessage={
            pinned
              ? "No pinned documents yet."
              : "No recent documents yet."
          }
          onOpenDocument={(id) =>
            navigate(`/documents?document=${encodeURIComponent(id)}`)
          }
          onOpenDocuments={() => navigate("/documents")}
        />
      );
    }

    if (mode === "calendar") {
      return (
        <RightSidebarCalendarPanel
          events={data.upcomingEvents}
          loading={data.eventsLoading}
          error={data.eventsError}
          onOpenCalendar={() => navigate("/calendar")}
        />
      );
    }

    if (mode === "statistics") {
      return (
        <RightSidebarStatisticsPanel
          statistics={data.statistics}
          loading={
            data.tasksLoading ||
            data.documentsLoading ||
            data.eventsLoading
          }
          error={
            data.tasksError ||
            data.documentsError ||
            data.eventsError
          }
        />
      );
    }

    return (
      <div className="right-sidebar__empty right-sidebar__none">
        <p>No sidebar content is selected.</p>
        <small>
          Choose another mode above whenever you need it.
        </small>
      </div>
    );
  }

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
            isOpen ? "Collapse sidebar" : "Expand sidebar"
          }
        >
          {isOpen ? "→" : "←"}
        </button>

        {isOpen && (
          <>
            <h2>{getRightSidebarModeLabel(mode)}</h2>
            <select
              className="right-sidebar__mode-select"
              value={mode}
              onChange={(event) =>
                void onModeChange(
                  event.target.value as RightSidebarMode
                )
              }
              aria-label="Sidebar content"
            >
              {RIGHT_SIDEBAR_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </>
        )}
      </header>

      {isOpen && (
        <div className="right-sidebar__body">
          {renderPanel()}
        </div>
      )}
    </aside>
  );
};

export default RightSidebar;

