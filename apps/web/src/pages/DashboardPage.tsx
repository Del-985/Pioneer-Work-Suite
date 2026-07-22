// apps/web/src/pages/DashboardPage.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Document as SuiteDocument, fetchDocuments } from "../api/documents";
import { getWorkspaceName } from "../api/session";
import { fetchTasks, Task } from "../api/tasks";
import { getLastWorkspaceBackupAt } from "../api/workspaceBackup";
import { openGlobalSearch } from "../components/GlobalSearch";
import { formatDocumentDate } from "../utils/documentText";
import {
  formatTaskDueDate,
  getDueDateKey,
  getEndOfLocalWeekKey,
  getLocalDateKey,
  isDueDateOverdue,
  isDueDateToday,
} from "../utils/taskDates";
import type {
  RightSidebarMode,
} from "../types/rightSidebar";
import {
  RIGHT_SIDEBAR_MODE_OPTIONS,
} from "../types/rightSidebar";

import "../styles/dashboard.css";

interface DashboardPageProps {
  sidebarMode: RightSidebarMode;
  onSidebarModeChange: (mode: RightSidebarMode) => void;
}

type DashboardTask = Task & {
  updatedAt?: string;
  completedAt?: string;
  archivedAt?: string | null;
};

interface StorageSnapshot {
  usage: number | null;
  quota: number | null;
}

function parseDate(raw?: string | null): Date | null {
  if (!raw) {
    return null;
  }

  const value = new Date(raw);

  return Number.isNaN(value.getTime())
    ? null
    : value;
}

function formatBackupTimestamp(raw: string | null): string {
  const timestamp = parseDate(raw);
  return timestamp
    ? timestamp.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "Not yet";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "Unavailable";
  }

  if (bytes === 0) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB",
  ];

  const unitIndex = Math.min(
    Math.floor(
      Math.log(bytes) /
        Math.log(1024)
    ),
    units.length - 1
  );

  const value =
    bytes /
    1024 ** unitIndex;

  return `${value.toFixed(
    value >= 10 || unitIndex === 0
      ? 0
      : 1
  )} ${units[unitIndex]}`;
}

function isTaskDone(
  task: DashboardTask
): boolean {
  return task.status === "done";
}

function isTaskArchived(
  task: DashboardTask
): boolean {
  return Boolean(
    task.archivedAt
  );
}

function sortTasksByDueDate(
  tasks: DashboardTask[]
): DashboardTask[] {
  return [...tasks].sort(
    (left, right) => {
      const leftDate =
        getDueDateKey(
          left.dueDate
        ) ?? "9999-12-31";

      const rightDate =
        getDueDateKey(
          right.dueDate
        ) ?? "9999-12-31";

      if (
        leftDate !== rightDate
      ) {
        return leftDate.localeCompare(
          rightDate
        );
      }

      return left.title.localeCompare(
        right.title
      );
    }
  );
}

function sortDocumentsBy(
  documents: SuiteDocument[],
  field:
    | "createdAt"
    | "updatedAt"
): SuiteDocument[] {
  return [...documents].sort(
    (left, right) => {
      const leftTime =
        parseDate(
          left[field]
        )?.getTime() ?? 0;

      const rightTime =
        parseDate(
          right[field]
        )?.getTime() ?? 0;

      return (
        rightTime -
        leftTime
      );
    }
  );
}

const DashboardPage: React.FC<
  DashboardPageProps
> = ({
  sidebarMode,
  onSidebarModeChange,
}) => {
  const navigate =
    useNavigate();

  const userName =
    getWorkspaceName();

  const [
    tasks,
    setTasks,
  ] = useState<
    DashboardTask[]
  >([]);

  const [
    documents,
    setDocuments,
  ] = useState<
    SuiteDocument[]
  >([]);

  const [
    storage,
    setStorage,
  ] = useState<
    StorageSnapshot
  >({
    usage: null,
    quota: null,
  });

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    storageLoading,
    setStorageLoading,
  ] = useState(true);

  const [
    loadError,
    setLoadError,
  ] = useState<
    string | null
  >(null);

  const [
    lastLoadedAt,
    setLastLoadedAt,
  ] = useState<
    Date | null
  >(null);

  const loadStorageEstimate =
    useCallback(
      async () => {
        setStorageLoading(
          true
        );

        try {
          if (
            typeof navigator ===
              "undefined" ||
            !navigator.storage ||
            typeof navigator
              .storage
              .estimate !==
              "function"
          ) {
            setStorage({
              usage: null,
              quota: null,
            });

            return;
          }

          const estimate =
            await navigator
              .storage
              .estimate();

          setStorage({
            usage:
              typeof estimate
                .usage ===
              "number"
                ? estimate.usage
                : null,

            quota:
              typeof estimate
                .quota ===
              "number"
                ? estimate.quota
                : null,
          });
        } catch (error) {
          console.warn(
            "Unable to estimate local storage usage:",
            error
          );

          setStorage({
            usage: null,
            quota: null,
          });
        } finally {
          setStorageLoading(
            false
          );
        }
      },
      []
    );

  const loadDashboard =
    useCallback(
      async () => {
        setLoading(true);
        setLoadError(null);

        try {
          const [
            taskResult,
            documentResult,
          ] =
            await Promise.allSettled(
              [
                fetchTasks(),
                fetchDocuments(),
              ]
            );

          const failures:
            string[] = [];

          if (
            taskResult.status ===
            "fulfilled"
          ) {
            setTasks(
              taskResult.value as DashboardTask[]
            );
          } else {
            console.error(
              "Unable to load dashboard tasks:",
              taskResult.reason
            );

            failures.push(
              "tasks"
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
              "Unable to load dashboard documents:",
              documentResult.reason
            );

            failures.push(
              "documents"
            );
          }

          if (
            failures.length > 0
          ) {
            setLoadError(
              `Unable to load ${failures.join(
                " and "
              )}.`
            );
          }

          setLastLoadedAt(
            new Date()
          );

          await loadStorageEstimate();
        } finally {
          setLoading(false);
        }
      },
      [
        loadStorageEstimate,
      ]
    );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const dashboardData =
    useMemo(() => {
      const now =
        new Date();

      const todayKey =
        getLocalDateKey(now);

      const weekEndKey =
        getEndOfLocalWeekKey(
          now
        );

      const activeTasks =
        tasks.filter(
          (task) =>
            !isTaskDone(
              task
            ) &&
            !isTaskArchived(
              task
            )
        );

      const todayTasks =
        sortTasksByDueDate(
          activeTasks.filter(
            (task) =>
              isDueDateToday(
                task.dueDate,
                now
              )
          )
        );

      const overdueTasks =
        sortTasksByDueDate(
          activeTasks.filter(
            (task) =>
              isDueDateOverdue(
                task.dueDate,
                now
              )
          )
        );

      const dueThisWeek =
        sortTasksByDueDate(
          activeTasks.filter(
            (task) => {
              const dueKey =
                getDueDateKey(
                  task.dueDate
                );

              return dueKey
                ? dueKey >
                    todayKey &&
                    dueKey <=
                      weekEndKey
                : false;
            }
          )
        );

      const recentlyEdited =
        sortDocumentsBy(
          documents,
          "updatedAt"
        ).slice(0, 5);

      const recentlyCreated =
        sortDocumentsBy(
          documents,
          "createdAt"
        ).slice(0, 5);

      const documentsEditedToday =
        documents.filter(
          (document) => {
            const editedAt =
              parseDate(
                document.updatedAt
              );

            return editedAt
              ? getLocalDateKey(
                  editedAt
                ) ===
                  todayKey
              : false;
          }
        ).length;

      const completedTasks =
        tasks.filter(
          isTaskDone
        );

      const completionMetadataAvailable =
        completedTasks.some(
          (task) =>
            Boolean(
              task.completedAt ||
                task.updatedAt
            )
        );

      const tasksCompletedToday =
        completedTasks.filter(
          (task) => {
            const completedAt =
              parseDate(
                task.completedAt ||
                  task.updatedAt
              );

            return completedAt
              ? getLocalDateKey(
                  completedAt
                ) ===
                  todayKey
              : false;
          }
        ).length;

      return {
        todayTasks,
        overdueTasks,
        dueThisWeek,
        recentlyEdited,
        recentlyCreated,
        documentsEditedToday,
        completionMetadataAvailable,
        tasksCompletedToday,
      };
    }, [
      documents,
      tasks,
    ]);

  const storagePercent =
    storage.usage !== null &&
    storage.quota
      ? Math.min(
          100,
          (storage.usage /
            storage.quota) *
            100
        )
      : null;

  return (
    <div className="dashboard-page">
      <section
        className="dashboard-hero"
        aria-labelledby="dashboard-title"
      >
        <div>
          <p className="dashboard-eyebrow">
            Today
          </p>

          <h2 id="dashboard-title">
            Welcome back,{" "}
            {userName}
          </h2>

          <p className="dashboard-hero-copy">
            Review what needs
            attention, return to
            recent work, or start
            something new.
          </p>
        </div>

        <button
          className="dashboard-refresh"
          type="button"
          onClick={() =>
            void loadDashboard()
          }
          disabled={loading}
        >
          {loading
            ? "Refreshing…"
            : "Refresh"}
        </button>
      </section>

      {loadError && (
        <div
          className="dashboard-error"
          role="alert"
        >
          <span>
            {loadError}
          </span>

          <button
            type="button"
            onClick={() =>
              void loadDashboard()
            }
          >
            Try again
          </button>
        </div>
      )}

      <section
        className="dashboard-section"
        aria-labelledby="dashboard-quick-actions"
      >
        <div className="dashboard-section-heading">
          <div>
            <p className="dashboard-section-kicker">
              Start here
            </p>

            <h3 id="dashboard-quick-actions">
              Quick actions
            </h3>
          </div>

          {lastLoadedAt && (
            <span className="dashboard-last-updated">
              Updated{" "}
              {lastLoadedAt.toLocaleTimeString(
                undefined,
                {
                  hour: "numeric",
                  minute:
                    "2-digit",
                }
              )}
            </span>
          )}
        </div>

        <div className="dashboard-actions">
          <button
            className="dashboard-action dashboard-action-primary"
            type="button"
            onClick={() =>
              navigate(
                "/tasks?create=1"
              )
            }
          >
            <span
              className="dashboard-action-icon"
              aria-hidden="true"
            >
              +
            </span>

            <span>
              <strong>
                New task
              </strong>

              <small>
                Capture something
                to do
              </small>
            </span>
          </button>

          <button
            className="dashboard-action"
            type="button"
            onClick={() =>
              navigate(
                "/documents?create=1"
              )
            }
          >
            <span
              className="dashboard-action-icon"
              aria-hidden="true"
            >
              D
            </span>

            <span>
              <strong>
                New document
              </strong>

              <small>
                Open the document
                workspace
              </small>
            </span>
          </button>

          <button
            className="dashboard-action"
            type="button"
            onClick={
              openGlobalSearch
            }
          >
            <span
              className="dashboard-action-icon"
              aria-hidden="true"
            >
              /
            </span>

            <span>
              <strong>
                Search
              </strong>

              <small>
                Search tasks and
                documents
              </small>
            </span>
          </button>

          <button
            className="dashboard-action"
            type="button"
            onClick={() =>
              navigate(
                "/settings"
              )
            }
          >
            <span
              className="dashboard-action-icon"
              aria-hidden="true"
            >
              S
            </span>

            <span>
              <strong>
                Open settings
              </strong>

              <small>
                Adjust your
                workspace
              </small>
            </span>
          </button>
        </div>
      </section>

      <section
        className="dashboard-section"
        aria-labelledby="dashboard-tasks"
      >
        <div className="dashboard-section-heading">
          <div>
            <p className="dashboard-section-kicker">
              Focus
            </p>

            <h3 id="dashboard-tasks">
              Task overview
            </h3>
          </div>

          <button
            className="dashboard-text-button"
            type="button"
            onClick={() =>
              navigate(
                "/tasks"
              )
            }
          >
            Open all tasks
          </button>
        </div>

        <div className="dashboard-task-grid">
          <TaskPanel
            title="Due today"
            count={
              dashboardData
                .todayTasks
                .length
            }
            tasks={
              dashboardData
                .todayTasks
            }
            emptyMessage="Nothing is due today."
            loading={loading}
            onOpen={() =>
              navigate(
                "/tasks"
              )
            }
            tone="accent"
          />

          <TaskPanel
            title="Overdue"
            count={
              dashboardData
                .overdueTasks
                .length
            }
            tasks={
              dashboardData
                .overdueTasks
            }
            emptyMessage="No overdue tasks."
            loading={loading}
            onOpen={() =>
              navigate(
                "/tasks"
              )
            }
            tone="danger"
          />

          <TaskPanel
            title="Due this week"
            count={
              dashboardData
                .dueThisWeek
                .length
            }
            tasks={
              dashboardData
                .dueThisWeek
            }
            emptyMessage="Nothing else is due this week."
            loading={loading}
            onOpen={() =>
              navigate(
                "/tasks"
              )
            }
            tone="warning"
          />
        </div>
      </section>

      <section
        className="dashboard-section"
        aria-labelledby="dashboard-documents"
      >
        <div className="dashboard-section-heading">
          <div>
            <p className="dashboard-section-kicker">
              Continue working
            </p>

            <h3 id="dashboard-documents">
              Document activity
            </h3>
          </div>

          <button
            className="dashboard-text-button"
            type="button"
            onClick={() =>
              navigate(
                "/documents"
              )
            }
          >
            Open documents
          </button>
        </div>

        <div className="dashboard-document-grid">
          <DocumentPanel
            title="Recently edited"
            documents={
              dashboardData
                .recentlyEdited
            }
            dateField="updatedAt"
            emptyMessage="No documents have been edited yet."
            loading={loading}
            onOpen={() =>
              navigate(
                "/documents"
              )
            }
          />

          <DocumentPanel
            title="Recently created"
            documents={
              dashboardData
                .recentlyCreated
            }
            dateField="createdAt"
            emptyMessage="No documents have been created yet."
            loading={loading}
            onOpen={() =>
              navigate(
                "/documents"
              )
            }
          />
        </div>
      </section>

      <section
        className="dashboard-section"
        aria-labelledby="dashboard-productivity"
      >
        <div className="dashboard-section-heading">
          <div>
            <p className="dashboard-section-kicker">
              Workspace pulse
            </p>

            <h3 id="dashboard-productivity">
              Productivity
            </h3>
          </div>
        </div>

        <div className="dashboard-stat-grid">
          <StatCard
            label="Tasks completed today"
            value={
              dashboardData
                .completionMetadataAvailable
                ? String(
                    dashboardData
                      .tasksCompletedToday
                  )
                : "—"
            }
            detail={
              dashboardData
                .completionMetadataAvailable
                ? "Based on completion timestamps"
                : "Completion timestamps arrive with Tasks v2"
            }
          />

          <StatCard
            label="Documents edited today"
            value={String(
              dashboardData
                .documentsEditedToday
            )}
            detail={`${
              documents.length
            } document${
              documents.length === 1
                ? ""
                : "s"
            } stored`}
          />

          <StatCard
            label="Local storage usage"
            value={
              storageLoading
                ? "Loading…"
                : storage.usage ===
                    null
                  ? "Unavailable"
                  : formatBytes(
                      storage.usage
                    )
            }
            detail={
              storagePercent ===
              null
                ? "Browser storage estimate"
                : `${storagePercent.toFixed(
                    1
                  )}% of ${formatBytes(
                    storage.quota ??
                      0
                  )}`
            }
            progress={
              storagePercent
            }
          />

          <StatCard
            label="Last backup"
            value={formatBackupTimestamp(getLastWorkspaceBackupAt())}
            detail={getLastWorkspaceBackupAt() ? "Local workspace export" : "Create a backup from Settings"}
          />
        </div>
      </section>

      <section
        className="dashboard-sidebar-setting"
        aria-labelledby="dashboard-sidebar-heading"
      >
        <div>
          <p className="dashboard-section-kicker">
            Workspace layout
          </p>

          <h3 id="dashboard-sidebar-heading">
            Right sidebar
            content
          </h3>

          <p>
            Choose which
            collection remains
            visible beside the
            active page.
          </p>
        </div>

        <select
          value={sidebarMode}
          onChange={(
            event: React.ChangeEvent<HTMLSelectElement>
          ) =>
            onSidebarModeChange(
              event.target.value as RightSidebarMode
            )
          }
          aria-label="Right sidebar content"
        >
          {RIGHT_SIDEBAR_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </section>
    </div>
  );
};

interface TaskPanelProps {
  title: string;
  count: number;
  tasks: DashboardTask[];
  emptyMessage: string;
  loading: boolean;
  onOpen: () => void;
  tone:
    | "accent"
    | "danger"
    | "warning";
}

const TaskPanel: React.FC<
  TaskPanelProps
> = ({
  title,
  count,
  tasks,
  emptyMessage,
  loading,
  onOpen,
  tone,
}) => {
  return (
    <article
      className={`dashboard-panel dashboard-task-panel tone-${tone}`}
    >
      <header className="dashboard-panel-header">
        <div>
          <p>
            {title}
          </p>

          <strong>
            {loading
              ? "—"
              : count}
          </strong>
        </div>

        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${title}`}
        >
          View
        </button>
      </header>

      {loading ? (
        <LoadingRows />
      ) : tasks.length ===
        0 ? (
        <p className="dashboard-empty">
          {emptyMessage}
        </p>
      ) : (
        <ul className="dashboard-list">
          {tasks
            .slice(0, 5)
            .map(
              (task) => (
                <li
                  key={
                    task.id
                  }
                >
                  <button
                    type="button"
                    onClick={
                      onOpen
                    }
                  >
                    <span>
                      {task.title ||
                        "Untitled task"}
                    </span>

                    <small>
                      {formatTaskDueDate(
                        task.dueDate
                      )}
                    </small>
                  </button>
                </li>
              )
            )}
        </ul>
      )}

      {!loading &&
        tasks.length > 5 && (
          <button
            className="dashboard-panel-more"
            type="button"
            onClick={
              onOpen
            }
          >
            +
            {tasks.length -
              5}{" "}
            more
          </button>
        )}
    </article>
  );
};

interface DocumentPanelProps {
  title: string;
  documents:
    SuiteDocument[];
  dateField:
    | "createdAt"
    | "updatedAt";
  emptyMessage: string;
  loading: boolean;
  onOpen: () => void;
}

const DocumentPanel: React.FC<
  DocumentPanelProps
> = ({
  title,
  documents,
  dateField,
  emptyMessage,
  loading,
  onOpen,
}) => {
  return (
    <article className="dashboard-panel dashboard-document-panel">
      <header className="dashboard-panel-title-row">
        <h4>
          {title}
        </h4>

        <button
          type="button"
          onClick={onOpen}
        >
          View all
        </button>
      </header>

      {loading ? (
        <LoadingRows />
      ) : documents.length ===
        0 ? (
        <p className="dashboard-empty">
          {emptyMessage}
        </p>
      ) : (
        <ul className="dashboard-list dashboard-document-list">
          {documents.map(
            (document) => (
              <li
                key={
                  document.id
                }
              >
                <button
                  type="button"
                  onClick={
                    onOpen
                  }
                >
                  <span>
                    {document.title ||
                      "Untitled document"}
                  </span>

                  <small>
                    {formatDocumentDate(
                      document[
                        dateField
                      ]
                    )}
                  </small>
                </button>
              </li>
            )
          )}
        </ul>
      )}
    </article>
  );
};

interface StatCardProps {
  label: string;
  value: string;
  detail: string;
  progress?:
    | number
    | null;
}

const StatCard: React.FC<
  StatCardProps
> = ({
  label,
  value,
  detail,
  progress,
}) => {
  return (
    <article className="dashboard-stat-card">
      <p>
        {label}
      </p>

      <strong>
        {value}
      </strong>

      <small>
        {detail}
      </small>

      {typeof progress ===
        "number" && (
        <div
          className="dashboard-storage-track"
          role="progressbar"
          aria-label={
            label
          }
          aria-valuemin={
            0
          }
          aria-valuemax={
            100
          }
          aria-valuenow={Math.round(
            progress
          )}
        >
          <span
            style={{
              width: `${Math.max(
                1,
                progress
              )}%`,
            }}
          />
        </div>
      )}
    </article>
  );
};

const LoadingRows: React.FC =
  () => {
    return (
      <div
        className="dashboard-loading-rows"
        aria-label="Loading"
      >
        <span />
        <span />
        <span />
      </div>
    );
  };

export default DashboardPage;

