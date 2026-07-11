// apps/web/src/pages/TasksPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  createTask,
  deleteTask,
  fetchTasks,
  Task,
  TaskPriority,
  updateTask,
} from "../api/tasks";
import {
  formatTaskDueDate,
  getDueDateKey,
  isDueDateOverdue,
  isDueDateToday,
  isDueDateUpcoming,
  toDateInputValue,
} from "../utils/taskDates";

import "../styles/tasks.css";

type TaskFilter = "all" | "today" | "upcoming" | "overdue" | "completed";

const PRIORITIES: TaskPriority[] = [
  "critical",
  "high",
  "medium",
  "low",
];

const PRIORITY_RANK: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function priorityLabel(priority: TaskPriority): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function taskDueTone(task: Task): "overdue" | "today" | "upcoming" | "none" {
  if (task.status === "done" || !task.dueDate) {
    return "none";
  }

  if (isDueDateOverdue(task.dueDate)) {
    return "overdue";
  }

  if (isDueDateToday(task.dueDate)) {
    return "today";
  }

  return "upcoming";
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => {
    const priorityDifference =
      PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const leftDue = getDueDateKey(left.dueDate) ?? "9999-12-31";
    const rightDue = getDueDateKey(right.dueDate) ?? "9999-12-31";

    if (leftDue !== rightDue) {
      return leftDue.localeCompare(rightDue);
    }

    const leftCreated = left.createdAt ?? "";
    const rightCreated = right.createdAt ?? "";

    if (leftCreated !== rightCreated) {
      return rightCreated.localeCompare(leftCreated);
    }

    return left.title.localeCompare(right.title);
  });
}

const TasksPage: React.FC = () => {
  const newTitleRef = useRef<HTMLInputElement>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingNewTask, setSavingNewTask] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newPriority, setNewPriority] =
    useState<TaskPriority>("medium");
  const [filter, setFilter] = useState<TaskFilter>("all");

  useEffect(() => {
    let cancelled = false;

    async function loadTasks(): Promise<void> {
      try {
        setLoading(true);
        setError(null);

        const loaded = await fetchTasks();

        if (!cancelled) {
          setTasks(loaded);
        }
      } catch (loadError) {
        console.error("Error loading tasks:", loadError);

        if (!cancelled) {
          setError("Unable to load tasks.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadTasks();

    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("create") === "1"
    ) {
      window.requestAnimationFrame(() => newTitleRef.current?.focus());
    }

    return () => {
      cancelled = true;
    };
  }, []);

  function replaceTask(updated: Task): void {
    setTasks((current) =>
      current.map((task) => (task.id === updated.id ? updated : task))
    );
  }

  async function handleAddTask(event: React.FormEvent): Promise<void> {
    event.preventDefault();

    const title = newTitle.trim();

    if (!title || savingNewTask) {
      return;
    }

    try {
      setSavingNewTask(true);
      setError(null);

      const created = await createTask(title, {
        priority: newPriority,
        dueDate: newDueDate || null,
      });

      setTasks((current) => [
        created,
        ...current.filter((task) => task.id !== created.id),
      ]);
      setNewTitle("");
      setNewDueDate("");
      setNewPriority("medium");
      newTitleRef.current?.focus();
    } catch (createError) {
      console.error("Error creating task:", createError);
      setError("Unable to create task.");
    } finally {
      setSavingNewTask(false);
    }
  }

  async function handleStatusChange(
    task: Task,
    nextStatus: Task["status"]
  ): Promise<void> {
    if (task.status === nextStatus) {
      return;
    }

    const previousTasks = tasks;

    setTasks((current) =>
      current.map((entry) =>
        entry.id === task.id ? { ...entry, status: nextStatus } : entry
      )
    );

    try {
      setError(null);
      const updated = await updateTask(task.id, { status: nextStatus });
      replaceTask(updated);
    } catch (updateError) {
      console.error("Error updating task status:", updateError);
      setTasks(previousTasks);
      setError("Unable to update task status.");
    }
  }

  async function handlePriorityChange(
    task: Task,
    priority: TaskPriority
  ): Promise<void> {
    if (task.priority === priority) {
      return;
    }

    const previousTasks = tasks;

    setTasks((current) =>
      current.map((entry) =>
        entry.id === task.id ? { ...entry, priority } : entry
      )
    );

    try {
      setError(null);
      const updated = await updateTask(task.id, { priority });
      replaceTask(updated);
    } catch (updateError) {
      console.error("Error updating task priority:", updateError);
      setTasks(previousTasks);
      setError("Unable to update task priority.");
    }
  }

  async function handleDueDateChange(
    task: Task,
    value: string
  ): Promise<void> {
    const dueDate = value || null;
    const previousTasks = tasks;

    setTasks((current) =>
      current.map((entry) =>
        entry.id === task.id ? { ...entry, dueDate } : entry
      )
    );

    try {
      setError(null);
      const updated = await updateTask(task.id, { dueDate });
      replaceTask(updated);
    } catch (updateError) {
      console.error("Error updating task due date:", updateError);
      setTasks(previousTasks);
      setError("Unable to update task due date.");
    }
  }

  async function handleTitleChange(
    task: Task,
    nextTitle: string
  ): Promise<void> {
    const title = nextTitle.trim();

    if (!title || title === task.title) {
      return;
    }

    const previousTasks = tasks;

    setTasks((current) =>
      current.map((entry) =>
        entry.id === task.id ? { ...entry, title } : entry
      )
    );

    try {
      setError(null);
      const updated = await updateTask(task.id, { title });
      replaceTask(updated);
    } catch (updateError) {
      console.error("Error updating task title:", updateError);
      setTasks(previousTasks);
      setError("Unable to update task title.");
    }
  }

  async function handleDelete(taskId: string): Promise<void> {
    const previousTasks = tasks;

    setTasks((current) => current.filter((task) => task.id !== taskId));

    try {
      setError(null);
      await deleteTask(taskId);
    } catch (deleteError) {
      console.error("Error deleting task:", deleteError);
      setTasks(previousTasks);
      setError("Unable to delete task.");
    }
  }

  const counts = useMemo(() => {
    const active = tasks.filter((task) => task.status !== "done");

    return {
      today: active.filter((task) => isDueDateToday(task.dueDate)).length,
      overdue: active.filter((task) => isDueDateOverdue(task.dueDate)).length,
      upcoming: active.filter((task) => isDueDateUpcoming(task.dueDate)).length,
      completed: tasks.filter((task) => task.status === "done").length,
      critical: active.filter((task) => task.priority === "critical").length,
    };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filter === "completed") {
        return task.status === "done";
      }

      if (task.status === "done") {
        return filter === "all";
      }

      if (filter === "today") {
        return isDueDateToday(task.dueDate);
      }

      if (filter === "upcoming") {
        return isDueDateUpcoming(task.dueDate);
      }

      if (filter === "overdue") {
        return isDueDateOverdue(task.dueDate);
      }

      return true;
    });
  }, [filter, tasks]);

  const todoTasks = useMemo(
    () => sortTasks(filteredTasks.filter((task) => task.status === "todo")),
    [filteredTasks]
  );

  const inProgressTasks = useMemo(
    () =>
      sortTasks(
        filteredTasks.filter((task) => task.status === "in_progress")
      ),
    [filteredTasks]
  );

  const doneTasks = useMemo(
    () => sortTasks(filteredTasks.filter((task) => task.status === "done")),
    [filteredTasks]
  );

  return (
    <div className="tasks-v2-page">
      <header className="tasks-v2-header">
        <div>
          <p className="tasks-v2-eyebrow">Tasks v2</p>
          <h2>Tasks</h2>
          <p>
            Plan work by urgency, track due dates, and move tasks through each
            stage.
          </p>
        </div>
      </header>

      <section className="tasks-v2-summary" aria-label="Task summary">
        <SummaryCard label="Due today" value={counts.today} tone="today" />
        <SummaryCard label="Overdue" value={counts.overdue} tone="overdue" />
        <SummaryCard label="Upcoming" value={counts.upcoming} tone="upcoming" />
        <SummaryCard
          label="Critical"
          value={counts.critical}
          tone="critical"
        />
        <SummaryCard
          label="Completed"
          value={counts.completed}
          tone="completed"
        />
      </section>

      <section className="tasks-v2-create" aria-labelledby="new-task-heading">
        <div className="tasks-v2-section-heading">
          <div>
            <p className="tasks-v2-eyebrow">Capture</p>
            <h3 id="new-task-heading">New task</h3>
          </div>
        </div>

        <form onSubmit={(event) => void handleAddTask(event)}>
          <label className="tasks-v2-title-field">
            <span>Task title</span>
            <input
              ref={newTitleRef}
              type="text"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="What needs to be done?"
              autoComplete="off"
            />
          </label>

          <label>
            <span>Priority</span>
            <select
              value={newPriority}
              onChange={(event) =>
                setNewPriority(event.target.value as TaskPriority)
              }
            >
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priorityLabel(priority)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Due date</span>
            <input
              type="date"
              value={newDueDate}
              onChange={(event) => setNewDueDate(event.target.value)}
            />
          </label>

          <button
            className="tasks-v2-add-button"
            type="submit"
            disabled={!newTitle.trim() || savingNewTask}
          >
            {savingNewTask ? "Adding…" : "Add task"}
          </button>
        </form>
      </section>

      <section className="tasks-v2-controls" aria-label="Task filters">
        <div className="tasks-v2-filter-row">
          {(
            [
              ["all", "All"],
              ["today", "Today"],
              ["upcoming", "Upcoming"],
              ["overdue", "Overdue"],
              ["completed", "Completed"],
            ] as Array<[TaskFilter, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "is-active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <p>
          Tasks are ordered by priority, then due date. Critical work appears
          first.
        </p>
      </section>

      {error && (
        <div className="tasks-v2-error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="tasks-v2-loading" aria-label="Loading tasks">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <section className="tasks-v2-board" aria-label="Task board">
          <TasksColumn
            title="To-Do"
            tasks={todoTasks}
            emptyText="No tasks in this column."
            onStatusChange={handleStatusChange}
            onPriorityChange={handlePriorityChange}
            onDueDateChange={handleDueDateChange}
            onTitleChange={handleTitleChange}
            onDelete={handleDelete}
          />

          <TasksColumn
            title="In Progress"
            tasks={inProgressTasks}
            emptyText="No tasks in progress."
            onStatusChange={handleStatusChange}
            onPriorityChange={handlePriorityChange}
            onDueDateChange={handleDueDateChange}
            onTitleChange={handleTitleChange}
            onDelete={handleDelete}
          />

          <TasksColumn
            title="Done"
            tasks={doneTasks}
            emptyText="No completed tasks yet."
            onStatusChange={handleStatusChange}
            onPriorityChange={handlePriorityChange}
            onDueDateChange={handleDueDateChange}
            onTitleChange={handleTitleChange}
            onDelete={handleDelete}
          />
        </section>
      )}
    </div>
  );
};

interface SummaryCardProps {
  label: string;
  value: number;
  tone: "today" | "overdue" | "upcoming" | "critical" | "completed";
}

const SummaryCard: React.FC<SummaryCardProps> = ({
  label,
  value,
  tone,
}) => {
  return (
    <article className={`tasks-v2-summary-card tone-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
};

interface TasksColumnProps {
  title: string;
  tasks: Task[];
  emptyText: string;
  onStatusChange: (
    task: Task,
    nextStatus: Task["status"]
  ) => Promise<void>;
  onPriorityChange: (
    task: Task,
    priority: TaskPriority
  ) => Promise<void>;
  onDueDateChange: (task: Task, value: string) => Promise<void>;
  onTitleChange: (task: Task, value: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const TasksColumn: React.FC<TasksColumnProps> = ({
  title,
  tasks,
  emptyText,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onTitleChange,
  onDelete,
}) => {
  return (
    <article className="tasks-v2-column">
      <header>
        <h3>{title}</h3>
        <span>{tasks.length}</span>
      </header>

      {tasks.length === 0 ? (
        <p className="tasks-v2-empty">{emptyText}</p>
      ) : (
        <div className="tasks-v2-card-list">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onStatusChange={onStatusChange}
              onPriorityChange={onPriorityChange}
              onDueDateChange={onDueDateChange}
              onTitleChange={onTitleChange}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </article>
  );
};

interface TaskCardProps {
  task: Task;
  onStatusChange: (
    task: Task,
    nextStatus: Task["status"]
  ) => Promise<void>;
  onPriorityChange: (
    task: Task,
    priority: TaskPriority
  ) => Promise<void>;
  onDueDateChange: (task: Task, value: string) => Promise<void>;
  onTitleChange: (task: Task, value: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onTitleChange,
  onDelete,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);
  const dueTone = taskDueTone(task);

  useEffect(() => {
    setDraftTitle(task.title);
  }, [task.title]);

  function startEditing(): void {
    setDraftTitle(task.title);
    setIsEditingTitle(true);
  }

  async function saveTitle(): Promise<void> {
    const title = draftTitle.trim();

    if (!title || title === task.title) {
      setDraftTitle(task.title);
      setIsEditingTitle(false);
      return;
    }

    await onTitleChange(task, title);
    setIsEditingTitle(false);
  }

  function cancelEditing(): void {
    setDraftTitle(task.title);
    setIsEditingTitle(false);
  }

  function handleTitleKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>
  ): void {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveTitle();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
    }
  }

  return (
    <article
      className={`tasks-v2-card priority-${task.priority}`}
      data-status={task.status}
    >
      <div className="tasks-v2-card-topline">
        <span className={`tasks-v2-priority priority-${task.priority}`}>
          {priorityLabel(task.priority)}
        </span>

        {task.dueDate && (
          <span className={`tasks-v2-due tone-${dueTone}`}>
            {formatTaskDueDate(task.dueDate)}
          </span>
        )}
      </div>

      {isEditingTitle ? (
        <div className="tasks-v2-title-editor">
          <input
            type="text"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={handleTitleKeyDown}
            autoFocus
            aria-label="Edit task title"
          />

          <div>
            <button type="button" onClick={cancelEditing}>
              Cancel
            </button>
            <button
              className="is-primary"
              type="button"
              onClick={() => void saveTitle()}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <button
          className="tasks-v2-card-title"
          type="button"
          onClick={startEditing}
          title="Click to edit"
        >
          {task.title || "Untitled task"}
        </button>
      )}

      <div className="tasks-v2-card-fields">
        <label>
          <span>Status</span>
          <select
            value={task.status}
            onChange={(event) =>
              void onStatusChange(
                task,
                event.target.value as Task["status"]
              )
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
              void onPriorityChange(
                task,
                event.target.value as TaskPriority
              )
            }
          >
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabel(priority)}
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
              void onDueDateChange(task, event.target.value)
            }
          />
        </label>
      </div>

      <footer className="tasks-v2-card-footer">
        <button
          className="tasks-v2-delete"
          type="button"
          onClick={() => void onDelete(task.id)}
          aria-label={`Delete ${task.title}`}
        >
          Delete
        </button>
      </footer>
    </article>
  );
};

export default TasksPage;
