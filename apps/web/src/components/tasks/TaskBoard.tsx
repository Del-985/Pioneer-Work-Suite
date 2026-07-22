import React, { useEffect, useState } from "react";

import type {
  Task,
  TaskPatch,
  TaskPriority,
  TaskStatus,
} from "../../api/tasks";
import {
  formatTaskDueDate,
  isDueDateOverdue,
  isDueDateToday,
  toDateInputValue,
} from "../../utils/taskDates";
import {
  formatTaskPriority,
  TASK_PRIORITIES,
} from "../../utils/taskPriority";

function taskDueTone(
  task: Task
): "overdue" | "today" | "upcoming" | "none" {
  if (task.status === "done" || !task.dueDate) return "none";
  if (isDueDateOverdue(task.dueDate)) return "overdue";
  if (isDueDateToday(task.dueDate)) return "today";
  return "upcoming";
}

export const TaskSummaryCard: React.FC<{
  label: string;
  value: number;
  tone: string;
}> = ({ label, value, tone }) => (
  <article className={`tasks-v2-summary-card tone-${tone}`}>
    <p>{label}</p><strong>{value}</strong>
  </article>
);

interface TasksColumnProps {
  title: string;
  tasks: Task[];
  selectedIds: Set<string>;
  searchTargetId: string | null;
  onSelectionChange: (id: string, selected: boolean) => void;
  onUpdate: (task: Task, patch: TaskPatch) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const TasksColumn: React.FC<TasksColumnProps> = ({
  title,
  tasks,
  selectedIds,
  searchTargetId,
  onSelectionChange,
  onUpdate,
  onDelete,
}) => (
  <article className="tasks-v2-column">
    <header><h2>{title}</h2><span>{tasks.length}</span></header>
    {tasks.length === 0 ? (
      <p className="tasks-v2-empty">No matching tasks.</p>
    ) : (
      <div className="tasks-v2-card-list">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            selected={selectedIds.has(task.id)}
            isSearchTarget={task.id === searchTargetId}
            onSelectionChange={onSelectionChange}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </div>
    )}
  </article>
);

const TaskCard: React.FC<{
  task: Task;
  selected: boolean;
  isSearchTarget: boolean;
  onSelectionChange: (id: string, selected: boolean) => void;
  onUpdate: (task: Task, patch: TaskPatch) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}> = ({
  task,
  selected,
  isSearchTarget,
  onSelectionChange,
  onUpdate,
  onDelete,
}) => {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);
  const [draftDescription, setDraftDescription] =
    useState(task.description);
  const [tagDraft, setTagDraft] = useState("");

  useEffect(() => {
    setDraftTitle(task.title);
    setDraftDescription(task.description);
  }, [task.description, task.title]);

  async function saveDetails(): Promise<void> {
    const title = draftTitle.trim();
    if (!title) return;
    await onUpdate(task, {
      title,
      description: draftDescription.trim(),
    });
    setEditing(false);
  }

  function cancelEditing(): void {
    setDraftTitle(task.title);
    setDraftDescription(task.description);
    setEditing(false);
  }

  function handleEditorKeyDown(
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ): void {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
    } else if (
      event.key === "Enter" &&
      (event.currentTarget instanceof HTMLInputElement || event.ctrlKey)
    ) {
      event.preventDefault();
      void saveDetails();
    }
  }

  return (
    <article
      id={`task-card-${task.id}`}
      className={
        `tasks-v2-card priority-${task.priority}` +
        (selected ? " is-selected" : "") +
        (isSearchTarget ? " is-search-target" : "")
      }
      data-status={task.status}
    >
      <div className="tasks-v2-card-topline">
        <label className="tasks-v2-select-task">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) =>
              onSelectionChange(task.id, event.target.checked)
            }
          />
          <span className={`tasks-v2-priority priority-${task.priority}`}>
            {formatTaskPriority(task.priority)}
          </span>
        </label>
        {task.dueDate && (
          <span className={`tasks-v2-due tone-${taskDueTone(task)}`}>
            {formatTaskDueDate(task.dueDate)}
          </span>
        )}
      </div>

      {editing ? (
        <div className="tasks-v2-details-editor">
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={handleEditorKeyDown}
            autoFocus
            aria-label="Task title"
          />
          <textarea
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.target.value)}
            onKeyDown={handleEditorKeyDown}
            placeholder="Description"
            rows={3}
          />
          <div>
            <button type="button" onClick={cancelEditing}>Cancel</button>
            <button type="button" className="is-primary" onClick={() => void saveDetails()}>
              Save
            </button>
          </div>
        </div>
      ) : (
        <button
          className="tasks-v2-card-title"
          type="button"
          onClick={() => setEditing(true)}
        >
          {task.title}
        </button>
      )}

      {!editing && task.description && (
        <p className="tasks-v2-description">{task.description}</p>
      )}

      <div className="tasks-v2-tags">
        {task.tags.map((tag) => (
          <button
            key={tag}
            type="button"
            title={`Remove ${tag}`}
            onClick={() =>
              void onUpdate(task, {
                tags: task.tags.filter((item) => item !== tag),
              })
            }
          >
            {tag} ×
          </button>
        ))}
        <input
          value={tagDraft}
          onChange={(event) => setTagDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && tagDraft.trim()) {
              event.preventDefault();
              const tag = tagDraft.trim();
              void onUpdate(task, {
                tags: [...new Set([...task.tags, tag])],
              });
              setTagDraft("");
            }
          }}
          placeholder="+ tag"
          aria-label="Add task tag"
        />
      </div>

      <div className="tasks-v2-card-fields">
        <label>
          <span>Status</span>
          <select
            value={task.status}
            onChange={(event) =>
              void onUpdate(task, {
                status: event.target.value as TaskStatus,
              })
            }
          >
            <option value="todo">To-Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>
        </label>
        <label>
          <span>Priority</span>
          <select
            value={task.priority}
            onChange={(event) =>
              void onUpdate(task, {
                priority: event.target.value as TaskPriority,
              })
            }
          >
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {formatTaskPriority(priority)}
              </option>
            ))}
          </select>
        </label>
        <label className="tasks-v2-due-field">
          <span>Due date</span>
          <input
            type="date"
            value={toDateInputValue(task.dueDate)}
            onChange={(event) =>
              void onUpdate(task, {
                dueDate: event.target.value || null,
              })
            }
          />
        </label>
      </div>

      <footer className="tasks-v2-card-footer">
        <button
          type="button"
          onClick={() =>
            void onUpdate(task, {
              archivedAt: task.archivedAt
                ? null
                : new Date().toISOString(),
            })
          }
        >
          {task.archivedAt ? "Restore" : "Archive"}
        </button>
        <button
          className="tasks-v2-delete"
          type="button"
          onClick={() => void onDelete(task.id)}
        >
          Delete
        </button>
      </footer>
    </article>
  );
};
