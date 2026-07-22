// apps/web/src/pages/TasksPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  TaskSummaryCard as SummaryCard,
  TasksColumn,
} from "../components/tasks/TaskBoard";

import {
  createTask,
  deleteTask,
  fetchTasks,
  updateTask,
} from "../api/tasks";
import type {
  Task,
  TaskPatch,
  TaskPriority,
  TaskStatus,
} from "../api/tasks";
import type { CommandDefinition } from "../commands/commandTypes";
import { useCommands } from "../commands/useCommands";
import { useStatusBarItems } from "../hooks/useStatusBarItems";
import { useAppSettings } from "../hooks/useAppSettings";
import { useConfirmation } from "../hooks/useConfirmation";
import {
  formatTaskDueDate,
  getLocalDateKey,
  getDueDateKey,
  isDueDateOverdue,
  isDueDateToday,
  isDueDateUpcoming,
  toDateInputValue,
} from "../utils/taskDates";
import {
  formatTaskPriority,
  TASK_PRIORITIES,
  TASK_PRIORITY_RANK,
} from "../utils/taskPriority";
import { toast } from "../toasts/toastStore";

import "../styles/tasks.css";

type TaskFilter =
  | "all"
  | "today"
  | "upcoming"
  | "overdue"
  | "completed";
type TaskSortKey =
  | "dueDate"
  | "priority"
  | "created"
  | "alphabetical"
  | "completed";
type SortDirection = "ascending" | "descending";

interface TasksPageProps {
  archivedOnly?: boolean;
}

const FILTERS: Array<[TaskFilter, string]> = [
  ["all", "All"],
  ["today", "Today"],
  ["upcoming", "Upcoming"],
  ["overdue", "Overdue"],
  ["completed", "Completed"],
];

function parseTags(value: string): string[] {
  return [...new Set(
    value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
  )];
}

function taskDueTone(
  task: Task
): "overdue" | "today" | "upcoming" | "none" {
  if (task.status === "done" || !task.dueDate) return "none";
  if (isDueDateOverdue(task.dueDate)) return "overdue";
  if (isDueDateToday(task.dueDate)) return "today";
  return "upcoming";
}

function timestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortTasks(
  tasks: Task[],
  key: TaskSortKey,
  direction: SortDirection
): Task[] {
  const multiplier = direction === "ascending" ? 1 : -1;

  return [...tasks].sort((left, right) => {
    let result = 0;

    if (key === "priority") {
      result =
        TASK_PRIORITY_RANK[left.priority] -
        TASK_PRIORITY_RANK[right.priority];
    } else if (key === "dueDate") {
      result = (
        getDueDateKey(left.dueDate) ?? "9999-12-31"
      ).localeCompare(
        getDueDateKey(right.dueDate) ?? "9999-12-31"
      );
    } else if (key === "created") {
      result = timestamp(left.createdAt) - timestamp(right.createdAt);
    } else if (key === "completed") {
      result =
        timestamp(left.completedAt) - timestamp(right.completedAt);
    } else {
      result = left.title.localeCompare(right.title);
    }

    return result === 0
      ? left.title.localeCompare(right.title)
      : result * multiplier;
  });
}

const TasksPage: React.FC<TasksPageProps> = ({
  archivedOnly = false,
}) => {
  const settings = useAppSettings();
  const { confirm, confirmationDialog } = useConfirmation();
  const navigate = useNavigate();
  const newTitleRef = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingNewTask, setSavingNewTask] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTags, setNewTags] = useState("");
  const defaultDueDate = getDefaultTaskDueDate(settings.tasks.defaultDueDate);
  const [newDueDate, setNewDueDate] = useState(defaultDueDate);
  const [newPriority, setNewPriority] =
    useState<TaskPriority>(settings.tasks.defaultPriority);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<TaskSortKey>("priority");
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("ascending");
  const [selectedIds, setSelectedIds] =
    useState<Set<string>>(() => new Set());
  const [bulkPriority, setBulkPriority] =
    useState<TaskPriority>("medium");
  const [bulkTag, setBulkTag] = useState("");
  const [searchTargetId, setSearchTargetId] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const loaded = await fetchTasks();
        if (cancelled) return;
        setTasks(loaded);

        const parameters = new URLSearchParams(window.location.search);
        const requestedId = parameters.get("task");

        if (requestedId) {
          setFilter("all");
          setSearchTargetId(requestedId);
          window.requestAnimationFrame(() =>
            document
              .getElementById(`task-card-${requestedId}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" })
          );
          window.setTimeout(() => setSearchTargetId(null), 2_600);
        }

        if (parameters.get("create") === "1" && !archivedOnly) {
          window.requestAnimationFrame(() => newTitleRef.current?.focus());
        }
      } catch (loadError) {
        console.error("Error loading tasks:", loadError);
        if (!cancelled) setError("Unable to load tasks.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [archivedOnly]);

  function replaceTask(updated: Task): void {
    setTasks((current) =>
      current.map((task) => (task.id === updated.id ? updated : task))
    );
  }

  async function saveTask(
    task: Task,
    patch: TaskPatch,
    failureMessage = "Unable to update task."
  ): Promise<void> {
    const effectivePatch: TaskPatch = { ...patch };
    if (patch.status === "done" && settings.tasks.archiveBehavior === "automatic") {
      effectivePatch.archivedAt = new Date().toISOString();
    } else if (patch.status && patch.status !== "done" && task.archivedAt) {
      effectivePatch.archivedAt = null;
    }
    const previous = tasks;
    setTasks((current) =>
      current.map((entry) =>
        entry.id === task.id ? { ...entry, ...effectivePatch } : entry
      )
    );

    try {
      setError(null);
      replaceTask(await updateTask(task.id, effectivePatch));
    } catch (updateError) {
      console.error(failureMessage, updateError);
      setTasks(previous);
      setError(failureMessage);
      toast.error("Task update failed", {
        description: failureMessage,
      });
    }
  }

  async function handleAddTask(
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || savingNewTask) return;

    try {
      setSavingNewTask(true);
      const created = await createTask(title, {
        description: newDescription,
        tags: parseTags(newTags),
        priority: newPriority,
        dueDate: newDueDate || null,
      });
      setTasks((current) => [created, ...current]);
      setNewTitle("");
      setNewDescription("");
      setNewTags("");
      setNewDueDate(getDefaultTaskDueDate(settings.tasks.defaultDueDate));
      setNewPriority(settings.tasks.defaultPriority);
      newTitleRef.current?.focus();
      toast.success("Task created", {
        description: created.title,
      });
    } catch (createError) {
      console.error("Error creating task:", createError);
      setError("Unable to create task.");
      toast.error("Unable to create task", {
        description: "Your task was not discarded from the form.",
      });
    } finally {
      setSavingNewTask(false);
    }
  }

  async function handleDelete(taskId: string): Promise<void> {
    const target = tasks.find((task) => task.id === taskId);
    const accepted = await confirm({
      title: `Delete "${target?.title || "Untitled task"}"?`,
      description: "This permanently removes the task and cannot be undone.",
      confirmLabel: "Delete task",
      dangerous: true,
    });
    if (!accepted) return;

    const previous = tasks;
    setTasks((current) => current.filter((task) => task.id !== taskId));

    try {
      await deleteTask(taskId);
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
      toast.success("Task deleted");
    } catch (deleteError) {
      console.error("Error deleting task:", deleteError);
      setTasks(previous);
      setError("Unable to delete task.");
      toast.error("Unable to delete task", {
        description: "The task was restored to the board.",
      });
    }
  }

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();

    const result = tasks.filter((task) => {
      if (archivedOnly ? !task.archivedAt : Boolean(task.archivedAt)) {
        return false;
      }

      if (query) {
        const haystack = [
          task.title,
          task.description,
          ...task.tags,
        ]
          .join(" ")
          .toLocaleLowerCase();
        if (!haystack.includes(query)) return false;
      }

      if (archivedOnly) return true;
      if (filter === "all") {
        return settings.tasks.completedTaskBehavior === "show" || task.status !== "done";
      }
      if (filter === "completed") return task.status === "done";
      if (task.status === "done") return false;
      if (filter === "today") return isDueDateToday(task.dueDate);
      if (filter === "upcoming") return isDueDateUpcoming(task.dueDate);
      return isDueDateOverdue(task.dueDate);
    });

    return sortTasks(result, sortKey, sortDirection);
  }, [archivedOnly, filter, search, settings.tasks.completedTaskBehavior, sortDirection, sortKey, tasks]);

  const columns = useMemo(() => {
    if (archivedOnly) {
      return [{ title: "Archived", tasks: visibleTasks }];
    }

    return [
      {
        title: "To-Do",
        tasks: visibleTasks.filter((task) => task.status === "todo"),
      },
      {
        title: "In Progress",
        tasks: visibleTasks.filter(
          (task) => task.status === "in_progress"
        ),
      },
      {
        title: "Done",
        tasks: visibleTasks.filter((task) => task.status === "done"),
      },
    ];
  }, [archivedOnly, visibleTasks]);

  const counts = useMemo(() => {
    const active = tasks.filter(
      (task) => !task.archivedAt && task.status !== "done"
    );
    return {
      today: active.filter((task) => isDueDateToday(task.dueDate)).length,
      overdue: active.filter((task) => isDueDateOverdue(task.dueDate)).length,
      upcoming: active.filter((task) => isDueDateUpcoming(task.dueDate)).length,
      critical: active.filter((task) => task.priority === "critical").length,
      completed: tasks.filter(
        (task) => !task.archivedAt && task.status === "done"
      ).length,
      archived: tasks.filter((task) => task.archivedAt).length,
    };
  }, [tasks]);

  const selectedTasks = useMemo(
    () => tasks.filter((task) => selectedIds.has(task.id)),
    [selectedIds, tasks]
  );

  async function applyBulkPatch(
    makePatch: (task: Task) => TaskPatch
  ): Promise<void> {
    const targets = selectedTasks;
    if (targets.length === 0) return;

    try {
      const updated: Task[] = [];

      // Keep queue writes sequential so offline bulk actions cannot overwrite
      // one another while they update the same IndexedDB sync queue.
      for (const task of targets) {
        updated.push(await updateTask(task.id, makePatch(task)));
      }
      const replacements = new Map(updated.map((task) => [task.id, task]));
      setTasks((current) =>
        current.map((task) => replacements.get(task.id) ?? task)
      );
      setSelectedIds(new Set());
      toast.success(
        `${targets.length} task${targets.length === 1 ? "" : "s"} updated`
      );
    } catch (bulkError) {
      console.error("Bulk task action failed:", bulkError);
      setError("Unable to complete the bulk task action.");
      toast.error("Bulk task action failed", {
        description: "Some selected tasks may not have been changed.",
      });
    }
  }

  async function bulkDelete(): Promise<void> {
    if (selectedTasks.length === 0) return;
    const accepted = await confirm({
      title: `Delete ${selectedTasks.length} selected task${selectedTasks.length === 1 ? "" : "s"}?`,
      description: "This permanently removes the selected tasks and cannot be undone.",
      confirmLabel: "Delete tasks",
      dangerous: true,
    });
    if (!accepted) {
      return;
    }

    try {
      // Delete sequentially for the same reason as bulk updates: every local
      // operation must be durably appended to the offline queue.
      for (const task of selectedTasks) {
        await deleteTask(task.id);
      }
      const ids = new Set(selectedTasks.map((task) => task.id));
      setTasks((current) => current.filter((task) => !ids.has(task.id)));
      setSelectedIds(new Set());
      toast.success(
        `${ids.size} task${ids.size === 1 ? "" : "s"} deleted`
      );
    } catch (bulkError) {
      console.error("Bulk task deletion failed:", bulkError);
      setError("Unable to delete all selected tasks.");
      toast.error("Bulk deletion failed", {
        description: "Some selected tasks may still be present.",
      });
    }
  }

  const statusItems = useMemo(
    () => [
      {
        id: "tasks-visible",
        label: `${visibleTasks.length} visible`,
        priority: 20,
      },
      {
        id: "tasks-selected",
        label: `${selectedIds.size} selected`,
        tone: selectedIds.size ? ("warning" as const) : ("neutral" as const),
        priority: 30,
      },
      ...(archivedOnly
        ? [{ id: "tasks-archive", label: "Archive", priority: 40 }]
        : []),
    ],
    [archivedOnly, selectedIds.size, visibleTasks.length]
  );
  useStatusBarItems("tasks-page", statusItems);

  const taskCommands = useMemo<CommandDefinition[]>(
    () => [
      {
        id: "tasks-create",
        title: "Create new task",
        category: "Tasks",
        enabled: !archivedOnly && !savingNewTask,
        disabledReason: archivedOnly
          ? "Return to active tasks to create a task."
          : "A task is currently being created.",
        run: () => newTitleRef.current?.focus(),
      },
      ...FILTERS.map(([value, label]) => ({
        id: `tasks-filter-${value}`,
        title: `Tasks: Show ${label}`,
        category: "Tasks" as const,
        enabled: !archivedOnly && filter !== value,
        disabledReason: archivedOnly
          ? "Filters are unavailable in the archive."
          : `${label} is already selected.`,
        run: () => setFilter(value),
      })),
      {
        id: "tasks-open-archive",
        title: archivedOnly ? "Return to active tasks" : "Open task archive",
        category: "Tasks",
        run: () => navigate(archivedOnly ? "/tasks" : "/tasks/archive"),
      },
    ],
    [archivedOnly, filter, navigate, savingNewTask]
  );
  useCommands(taskCommands);

  const allVisibleSelected =
    visibleTasks.length > 0 &&
    visibleTasks.every((task) => selectedIds.has(task.id));

  return (
    <div className="tasks-v2-page">
      <header className="tasks-v2-header">
        <div>
          <p className="tasks-v2-eyebrow">Tasks v2</p>
          <h1>{archivedOnly ? "Task Archive" : "Tasks"}</h1>
          <p>
            Search titles, descriptions, and tags; organize work in bulk; and
            archive completed work without deleting it.
          </p>
        </div>
        <button
          className="tasks-v2-archive-link"
          type="button"
          onClick={() => navigate(archivedOnly ? "/tasks" : "/tasks/archive")}
        >
          {archivedOnly ? "Back to Tasks" : `Archive (${counts.archived})`}
        </button>
      </header>

      {!archivedOnly && (
        <section className="tasks-v2-summary" aria-label="Task summary">
          <SummaryCard label="Due today" value={counts.today} tone="today" />
          <SummaryCard label="Overdue" value={counts.overdue} tone="overdue" />
          <SummaryCard label="Upcoming" value={counts.upcoming} tone="upcoming" />
          <SummaryCard label="Critical" value={counts.critical} tone="critical" />
          <SummaryCard label="Completed" value={counts.completed} tone="completed" />
        </section>
      )}

      {!archivedOnly && (
        <section className="tasks-v2-create" aria-labelledby="new-task-heading">
          <h2 id="new-task-heading">New task</h2>
          <form onSubmit={(event) => void handleAddTask(event)}>
            <label className="tasks-v2-title-field">
              <span>Title</span>
              <input
                ref={newTitleRef}
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="What needs to be done?"
              />
            </label>
            <label className="tasks-v2-description-field">
              <span>Description</span>
              <input
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
                placeholder="Optional details"
              />
            </label>
            <label>
              <span>Tags</span>
              <input
                value={newTags}
                onChange={(event) => setNewTags(event.target.value)}
                placeholder="work, urgent"
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
                {TASK_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {formatTaskPriority(priority)}
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
      )}

      <section className="tasks-v2-controls" aria-label="Task controls">
        <div className="tasks-v2-search-sort">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tasks, descriptions, and tags"
            aria-label="Search tasks"
          />
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as TaskSortKey)}
            aria-label="Sort tasks by"
          >
            <option value="dueDate">Due date</option>
            <option value="priority">Priority</option>
            <option value="created">Created</option>
            <option value="alphabetical">Alphabetical</option>
            <option value="completed">Completed</option>
          </select>
          <button
            type="button"
            onClick={() =>
              setSortDirection((current) =>
                current === "ascending" ? "descending" : "ascending"
              )
            }
          >
            {sortDirection === "ascending" ? "Ascending" : "Descending"}
          </button>
        </div>
        {!archivedOnly && (
          <div className="tasks-v2-filter-row">
            {FILTERS.map(([value, label]) => (
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
        )}
      </section>

      <section className="tasks-v2-bulk" aria-label="Bulk task actions">
        <label>
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={() =>
              setSelectedIds(
                allVisibleSelected
                  ? new Set()
                  : new Set(visibleTasks.map((task) => task.id))
              )
            }
          />
          Select visible
        </label>
        <span>{selectedIds.size} selected</span>
        {!archivedOnly && (
          <>
            <button
              type="button"
              disabled={!selectedIds.size}
              onClick={() => void applyBulkPatch(() => ({ status: "done" }))}
            >
              Complete
            </button>
            <select
              value={bulkPriority}
              onChange={(event) =>
                setBulkPriority(event.target.value as TaskPriority)
              }
              aria-label="Bulk priority"
            >
              {TASK_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {formatTaskPriority(priority)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedIds.size}
              onClick={() =>
                void applyBulkPatch(() => ({ priority: bulkPriority }))
              }
            >
              Set priority
            </button>
            <input
              value={bulkTag}
              onChange={(event) => setBulkTag(event.target.value)}
              placeholder="Tag"
              aria-label="Tag to add"
            />
            <button
              type="button"
              disabled={!selectedIds.size || !bulkTag.trim()}
              onClick={() => {
                const tag = bulkTag.trim();
                void applyBulkPatch((task) => ({
                  tags: [...new Set([...task.tags, tag])],
                }));
                setBulkTag("");
              }}
            >
              Add tag
            </button>
            <button
              type="button"
              disabled={!selectedIds.size}
              onClick={() =>
                void applyBulkPatch(() => ({
                  archivedAt: new Date().toISOString(),
                }))
              }
            >
              Archive
            </button>
          </>
        )}
        {archivedOnly && (
          <button
            type="button"
            disabled={!selectedIds.size}
            onClick={() => void applyBulkPatch(() => ({ archivedAt: null }))}
          >
            Restore
          </button>
        )}
        <button
          className="is-danger"
          type="button"
          disabled={!selectedIds.size}
          onClick={() => void bulkDelete()}
        >
          Delete
        </button>
      </section>

      {error && <div className="tasks-v2-error" role="alert">{error}</div>}

      {loading ? (
        <div className="tasks-v2-loading" aria-label="Loading tasks">
          <span /><span /><span />
        </div>
      ) : (
        <section
          className={`tasks-v2-board${archivedOnly ? " is-archive" : ""}`}
          aria-label={archivedOnly ? "Archived tasks" : "Task board"}
        >
          {columns.map((column) => (
            <TasksColumn
              key={column.title}
              title={column.title}
              tasks={column.tasks}
              selectedIds={selectedIds}
              searchTargetId={searchTargetId}
              onSelectionChange={(id, selected) =>
                setSelectedIds((current) => {
                  const next = new Set(current);
                  selected ? next.add(id) : next.delete(id);
                  return next;
                })
              }
              onUpdate={saveTask}
              onDelete={handleDelete}
            />
          ))}
        </section>
      )}
      {confirmationDialog}
    </div>
  );
};

function getDefaultTaskDueDate(
  preference: "none" | "today" | "tomorrow"
): string {
  if (preference === "none") return "";
  const date = new Date();
  if (preference === "tomorrow") date.setDate(date.getDate() + 1);
  return getLocalDateKey(date);
}

export default TasksPage;
