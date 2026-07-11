// apps/web/src/components/RightSidebar.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  createTask,
  deleteTask,
  fetchTasks,
  Task,
  updateTask,
} from "../api/tasks";
import {
  Document as SuiteDocument,
  fetchDocuments,
} from "../api/documents";
import {
  SYNC_STATE_EVENT,
} from "../api/syncSupport";
import {
  formatTaskDueDate,
  getDueDateKey,
  isDueDateOverdue,
  isDueDateToday,
} from "../utils/taskDates";
import {
  formatDocumentDate,
} from "../utils/documentText";

import "../styles/right-sidebar.css";

export type RightSidebarMode =
  | "tasks"
  | "documents";

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

const PRIORITY_ORDER: Record<
  Task["priority"],
  number
> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function taskStatusLabel(
  status: Task["status"]
): string {
  if (status === "in_progress") {
    return "In progress";
  }

  if (status === "done") {
    return "Done";
  }

  return "To-do";
}

function taskDueTone(
  task: Task
): "overdue" | "today" | "neutral" {
  if (
    task.status !== "done" &&
    isDueDateOverdue(task.dueDate)
  ) {
    return "overdue";
  }

  if (
    task.status !== "done" &&
    isDueDateToday(task.dueDate)
  ) {
    return "today";
  }

  return "neutral";
}

function sortSidebarTasks(
  tasks: Task[]
): Task[] {
  return [...tasks].sort((left, right) => {
    if (
      left.status === "done" &&
      right.status !== "done"
    ) {
      return 1;
    }

    if (
      left.status !== "done" &&
      right.status === "done"
    ) {
      return -1;
    }

    const leftPriority =
      PRIORITY_ORDER[left.priority] ?? 2;
    const rightPriority =
      PRIORITY_ORDER[right.priority] ?? 2;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    const leftDue =
      getDueDateKey(left.dueDate) ??
      "9999-12-31";
    const rightDue =
      getDueDateKey(right.dueDate) ??
      "9999-12-31";

    if (leftDue !== rightDue) {
      return leftDue.localeCompare(rightDue);
    }

    return left.title.localeCompare(
      right.title
    );
  });
}

function sortSidebarDocuments(
  documents: SuiteDocument[]
): SuiteDocument[] {
  return [...documents].sort(
    (left, right) => {
      if (
        left.isPinned !== right.isPinned
      ) {
        return left.isPinned ? -1 : 1;
      }

      const leftTime = new Date(
        left.updatedAt || left.createdAt
      ).getTime();
      const rightTime = new Date(
        right.updatedAt || right.createdAt
      ).getTime();

      return rightTime - leftTime;
    }
  );
}

const RightSidebar: React.FC<
  RightSidebarProps
> = ({
  isOpen,
  mode,
  workspaceAccessible,
  cloudConnected,
  onToggle,
  onModeChange,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [tasks, setTasks] =
    useState<Task[]>([]);
  const [documents, setDocuments] =
    useState<SuiteDocument[]>([]);

  const [tasksLoading, setTasksLoading] =
    useState(false);
  const [
    documentsLoading,
    setDocumentsLoading,
  ] = useState(false);

  const [tasksError, setTasksError] =
    useState<string | null>(null);
  const [
    documentsError,
    setDocumentsError,
  ] = useState<string | null>(null);

  const [newTaskTitle, setNewTaskTitle] =
    useState("");
  const [creatingTask, setCreatingTask] =
    useState(false);

  const loadSidebarData =
    useCallback(async (): Promise<void> => {
      if (!workspaceAccessible) {
        setTasks([]);
        setDocuments([]);
        setTasksError(null);
        setDocumentsError(null);
        setTasksLoading(false);
        setDocumentsLoading(false);
        return;
      }

      setTasksLoading(true);
      setDocumentsLoading(true);
      setTasksError(null);
      setDocumentsError(null);

      const [
        taskResult,
        documentResult,
      ] = await Promise.allSettled([
        fetchTasks(),
        fetchDocuments(),
      ]);

      if (
        taskResult.status === "fulfilled"
      ) {
        setTasks(taskResult.value);
      } else {
        console.error(
          "Unable to load sidebar tasks:",
          taskResult.reason
        );
        setTasksError(
          "Unable to load tasks."
        );
      }

      if (
        documentResult.status ===
        "fulfilled"
      ) {
        setDocuments(
          documentResult.value
        );
      } else {
        console.error(
          "Unable to load sidebar documents:",
          documentResult.reason
        );
        setDocumentsError(
          "Unable to load documents."
        );
      }

      setTasksLoading(false);
      setDocumentsLoading(false);
    }, [
      cloudConnected,
      workspaceAccessible,
    ]);

  useEffect(() => {
    void loadSidebarData();
  }, [
    loadSidebarData,
    location.pathname,
  ]);

  useEffect(() => {
    if (
      typeof window === "undefined"
    ) {
      return;
    }

    const refresh = () => {
      void loadSidebarData();
    };

    window.addEventListener(
      SYNC_STATE_EVENT,
      refresh
    );

    return () => {
      window.removeEventListener(
        SYNC_STATE_EVENT,
        refresh
      );
    };
  }, [loadSidebarData]);

  const sortedTasks = useMemo(
    () => sortSidebarTasks(tasks),
    [tasks]
  );

  const sortedDocuments = useMemo(
    () =>
      sortSidebarDocuments(
        documents
      ),
    [documents]
  );

  const taskSummary = useMemo(() => {
    const activeTasks = tasks.filter(
      (task) => task.status !== "done"
    );

    return {
      today: activeTasks.filter(
        (task) =>
          isDueDateToday(task.dueDate)
      ).length,
      overdue: activeTasks.filter(
        (task) =>
          isDueDateOverdue(task.dueDate)
      ).length,
    };
  }, [tasks]);

  async function handleCreateTask(
    event: React.FormEvent
  ): Promise<void> {
    event.preventDefault();

    const title =
      newTaskTitle.trim();

    if (!title || creatingTask) {
      return;
    }

    setCreatingTask(true);
    setTasksError(null);

    try {
      const created =
        await createTask(title);

      setTasks((current) => [
        created,
        ...current.filter(
          (task) =>
            task.id !== created.id
        ),
      ]);
      setNewTaskTitle("");
    } catch (error) {
      console.error(
        "Unable to create sidebar task:",
        error
      );
      setTasksError(
        "Unable to create task."
      );
    } finally {
      setCreatingTask(false);
    }
  }

  async function handleToggleTask(
    task: Task
  ): Promise<void> {
    const nextStatus:
      Task["status"] =
      task.status === "done"
        ? "todo"
        : "done";
    const previous = tasks;

    setTasks((current) =>
      current.map((entry) =>
        entry.id === task.id
          ? {
              ...entry,
              status: nextStatus,
            }
          : entry
      )
    );
    setTasksError(null);

    try {
      const updated =
        await updateTask(task.id, {
          status: nextStatus,
        });

      setTasks((current) =>
        current.map((entry) =>
          entry.id === updated.id
            ? updated
            : entry
        )
      );
    } catch (error) {
      console.error(
        "Unable to update sidebar task:",
        error
      );
      setTasks(previous);
      setTasksError(
        "Unable to update task."
      );
    }
  }

  async function handleDeleteTask(
    id: string
  ): Promise<void> {
    const previous = tasks;

    setTasks((current) =>
      current.filter(
        (task) => task.id !== id
      )
    );
    setTasksError(null);

    try {
      await deleteTask(id);
    } catch (error) {
      console.error(
        "Unable to delete sidebar task:",
        error
      );
      setTasks(previous);
      setTasksError(
        "Unable to delete task."
      );
    }
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
              {mode === "tasks"
                ? "Tasks"
                : "Documents"}
            </h2>

            <div
              className="right-sidebar__mode-switch"
              role="group"
              aria-label="Sidebar content"
            >
              <button
                type="button"
                className={
                  mode === "tasks"
                    ? "is-active"
                    : ""
                }
                onClick={() =>
                  void onModeChange(
                    "tasks"
                  )
                }
              >
                Tasks
              </button>
              <button
                type="button"
                className={
                  mode === "documents"
                    ? "is-active"
                    : ""
                }
                onClick={() =>
                  void onModeChange(
                    "documents"
                  )
                }
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
                Connect or create a workspace
                to use tasks and documents.
              </p>
              <button
                type="button"
                onClick={() =>
                  navigate("/login")
                }
              >
                Connect workspace
              </button>
            </div>
          ) : mode === "tasks" ? (
            <>
              <div className="right-sidebar__summary">
                <span>
                  Today{" "}
                  <strong>
                    {taskSummary.today}
                  </strong>
                </span>
                <span
                  className={
                    taskSummary.overdue > 0
                      ? "has-overdue"
                      : ""
                  }
                >
                  Overdue{" "}
                  <strong>
                    {taskSummary.overdue}
                  </strong>
                </span>
              </div>

              <form
                className="right-sidebar__task-form"
                onSubmit={(event: React.FormEvent<HTMLFormElement>) =>
                  void handleCreateTask(
                    event
                  )
                }
              >
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setNewTaskTitle(
                      event.target.value
                    )
                  }
                  placeholder="Add a task"
                  aria-label="New task title"
                />
                <button
                  type="submit"
                  disabled={
                    !newTaskTitle.trim() ||
                    creatingTask
                  }
                  aria-label="Add task"
                >
                  {creatingTask ? "…" : "+"}
                </button>
              </form>

              <SidebarMessage
                loading={tasksLoading}
                error={tasksError}
                empty={
                  !tasksLoading &&
                  !tasksError &&
                  tasks.length === 0
                    ? "No tasks yet."
                    : null
                }
              />

              <ul className="right-sidebar__list">
                {sortedTasks
                  .slice(0, 12)
                  .map((task) => {
                    const dueTone =
                      taskDueTone(task);

                    return (
                      <li
                        key={task.id}
                        className={
                          task.status ===
                          "done"
                            ? "is-complete"
                            : ""
                        }
                      >
                        <label className="right-sidebar__task-main">
                          <input
                            type="checkbox"
                            checked={
                              task.status ===
                              "done"
                            }
                            onChange={() =>
                              void handleToggleTask(
                                task
                              )
                            }
                          />
                          <span>
                            <strong>
                              {task.title}
                            </strong>
                            <small
                              className={`tone-${dueTone}`}
                            >
                              {task.dueDate
                                ? formatTaskDueDate(
                                    task.dueDate
                                  )
                                : "No due date"}
                              {" · "}
                              {taskStatusLabel(
                                task.status
                              )}
                            </small>
                          </span>
                        </label>

                        <button
                          className="right-sidebar__delete"
                          type="button"
                          onClick={() =>
                            void handleDeleteTask(
                              task.id
                            )
                          }
                          aria-label={`Delete ${task.title}`}
                          title="Delete"
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
              </ul>

              <button
                className="right-sidebar__open-page"
                type="button"
                onClick={() =>
                  navigate("/tasks")
                }
              >
                Open Tasks
              </button>
            </>
          ) : (
            <>
              <SidebarMessage
                loading={
                  documentsLoading
                }
                error={documentsError}
                empty={
                  !documentsLoading &&
                  !documentsError &&
                  documents.length === 0
                    ? "No documents yet."
                    : null
                }
              />

              <ul className="right-sidebar__list right-sidebar__document-list">
                {sortedDocuments
                  .slice(0, 10)
                  .map((document) => (
                    <li key={document.id}>
                      <button
                        className="right-sidebar__document"
                        type="button"
                        onClick={() =>
                          navigate(
                            "/documents"
                          )
                        }
                      >
                        <span>
                          {document.isPinned && (
                            <span
                              className="right-sidebar__pin"
                              aria-label="Pinned"
                            >
                              ●
                            </span>
                          )}
                          <strong>
                            {document.title ||
                              "Untitled document"}
                          </strong>
                        </span>
                        <small>
                          Updated{" "}
                          {formatDocumentDate(
                            document.updatedAt ||
                              document.createdAt
                          )}
                        </small>
                      </button>
                    </li>
                  ))}
              </ul>

              <button
                className="right-sidebar__open-page"
                type="button"
                onClick={() =>
                  navigate("/documents")
                }
              >
                Open Documents
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  );
};

interface SidebarMessageProps {
  loading: boolean;
  error: string | null;
  empty: string | null;
}

const SidebarMessage: React.FC<
  SidebarMessageProps
> = ({
  loading,
  error,
  empty,
}) => {
  if (loading) {
    return (
      <p className="right-sidebar__message">
        Loading…
      </p>
    );
  }

  if (error) {
    return (
      <p className="right-sidebar__message is-error">
        {error}
      </p>
    );
  }

  if (empty) {
    return (
      <p className="right-sidebar__message">
        {empty}
      </p>
    );
  }

  return null;
};

export default RightSidebar;
