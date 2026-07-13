import React from "react";

import type {
  Task,
} from "../../api/tasks";
import {
  formatTaskDueDate,
  isDueDateOverdue,
  isDueDateToday,
} from "../../utils/taskDates";
import SidebarMessage from "./SidebarMessage";

interface RightSidebarTasksPanelProps {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  summary: {
    today: number;
    overdue: number;
  };
  newTaskTitle: string;
  creatingTask: boolean;
  onNewTaskTitleChange: (value: string) => void;
  onCreateTask: (
    event: React.FormEvent<HTMLFormElement>
  ) => void | Promise<void>;
  onToggleTask: (task: Task) => void | Promise<void>;
  onDeleteTask: (id: string) => void | Promise<void>;
  onOpenTasks: () => void;
}

function taskStatusLabel(status: Task["status"]): string {
  if (status === "in_progress") {
    return "In progress";
  }

  return status === "done" ? "Done" : "To-do";
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

const RightSidebarTasksPanel: React.FC<
  RightSidebarTasksPanelProps
> = ({
  tasks,
  loading,
  error,
  summary,
  newTaskTitle,
  creatingTask,
  onNewTaskTitleChange,
  onCreateTask,
  onToggleTask,
  onDeleteTask,
  onOpenTasks,
}) => {
  return (
    <>
      <div className="right-sidebar__summary">
        <span>
          Today <strong>{summary.today}</strong>
        </span>
        <span className={summary.overdue > 0 ? "has-overdue" : ""}>
          Overdue <strong>{summary.overdue}</strong>
        </span>
      </div>

      <form
        className="right-sidebar__task-form"
        onSubmit={(event) => void onCreateTask(event)}
      >
        <input
          type="text"
          value={newTaskTitle}
          onChange={(event) =>
            onNewTaskTitleChange(event.target.value)
          }
          placeholder="Add a task"
          aria-label="New task title"
        />
        <button
          type="submit"
          disabled={!newTaskTitle.trim() || creatingTask}
          aria-label="Add task"
        >
          {creatingTask ? "…" : "+"}
        </button>
      </form>

      <SidebarMessage
        loading={loading}
        error={error}
        empty={
          !loading && !error && tasks.length === 0
            ? "No tasks yet."
            : null
        }
      />

      <ul className="right-sidebar__list">
        {tasks.slice(0, 12).map((task) => {
          const dueTone = taskDueTone(task);

          return (
            <li
              key={task.id}
              className={task.status === "done" ? "is-complete" : ""}
            >
              <label className="right-sidebar__task-main">
                <input
                  type="checkbox"
                  checked={task.status === "done"}
                  onChange={() => void onToggleTask(task)}
                />
                <span>
                  <strong>{task.title}</strong>
                  <small className={`tone-${dueTone}`}>
                    {task.dueDate
                      ? formatTaskDueDate(task.dueDate)
                      : "No due date"}
                    {" · "}
                    {taskStatusLabel(task.status)}
                  </small>
                </span>
              </label>

              <button
                className="right-sidebar__delete"
                type="button"
                onClick={() => void onDeleteTask(task.id)}
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
        onClick={onOpenTasks}
      >
        Open Tasks
      </button>
    </>
  );
};

export default RightSidebarTasksPanel;

