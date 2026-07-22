import React from "react";

import type { Document as SuiteDocument } from "../../api/documents";
import type { Task } from "../../api/tasks";
import { formatDocumentDate } from "../../utils/documentText";
import { formatTaskDueDate } from "../../utils/taskDates";

interface TaskPanelProps {
  title: string;
  count: number;
  tasks: Task[];
  emptyMessage: string;
  loading: boolean;
  onOpen: () => void;
  tone:
    | "accent"
    | "danger"
    | "warning";
}

export const TaskPanel: React.FC<
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

export const DocumentPanel: React.FC<
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

export const StatCard: React.FC<
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
