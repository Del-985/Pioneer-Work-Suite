import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useLocation,
} from "react-router-dom";

import {
  fetchDocuments,
} from "../api/documents";
import type {
  Document,
} from "../api/documents";
import {
  SYNC_STATE_EVENT,
} from "../api/syncSupport";
import {
  createTask,
  deleteTask,
  fetchTasks,
  updateTask,
} from "../api/tasks";
import type {
  Task,
} from "../api/tasks";
import {
  sortDocumentsByPinnedThenUpdated,
} from "../utils/documentSort";
import {
  getDueDateKey,
  isDueDateOverdue,
  isDueDateToday,
} from "../utils/taskDates";
import {
  TASK_PRIORITY_RANK,
} from "../utils/taskPriority";

function sortSidebarTasks(tasks: Task[]): Task[] {
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

    const priorityDifference =
      TASK_PRIORITY_RANK[left.priority] -
      TASK_PRIORITY_RANK[right.priority];

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const leftDue =
      getDueDateKey(left.dueDate) ?? "9999-12-31";
    const rightDue =
      getDueDateKey(right.dueDate) ?? "9999-12-31";

    if (leftDue !== rightDue) {
      return leftDue.localeCompare(rightDue);
    }

    return left.title.localeCompare(right.title);
  });
}

export function useRightSidebarData(
  workspaceAccessible: boolean,
  cloudConnected: boolean
) {
  const location = useLocation();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [documents, setDocuments] =
    useState<Document[]>([]);
  const [tasksLoading, setTasksLoading] =
    useState(false);
  const [documentsLoading, setDocumentsLoading] =
    useState(false);
  const [tasksError, setTasksError] =
    useState<string | null>(null);
  const [documentsError, setDocumentsError] =
    useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] =
    useState("");
  const [creatingTask, setCreatingTask] =
    useState(false);

  const loadSidebarData = useCallback(
    async (): Promise<void> => {
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

      const [taskResult, documentResult] =
        await Promise.allSettled([
          fetchTasks(),
          fetchDocuments(),
        ]);

      if (taskResult.status === "fulfilled") {
        setTasks(taskResult.value);
      } else {
        console.error(
          "Unable to load sidebar tasks:",
          taskResult.reason
        );
        setTasksError("Unable to load tasks.");
      }

      if (documentResult.status === "fulfilled") {
        setDocuments(documentResult.value);
      } else {
        console.error(
          "Unable to load sidebar documents:",
          documentResult.reason
        );
        setDocumentsError("Unable to load documents.");
      }

      setTasksLoading(false);
      setDocumentsLoading(false);
    },
    [cloudConnected, workspaceAccessible]
  );

  useEffect(() => {
    void loadSidebarData();
  }, [loadSidebarData, location.pathname]);

  useEffect(() => {
    const refresh = () => {
      void loadSidebarData();
    };

    window.addEventListener(SYNC_STATE_EVENT, refresh);

    return () => {
      window.removeEventListener(SYNC_STATE_EVENT, refresh);
    };
  }, [loadSidebarData]);

  const sortedTasks = useMemo(
    () => sortSidebarTasks(tasks),
    [tasks]
  );
  const sortedDocuments = useMemo(
    () => sortDocumentsByPinnedThenUpdated(documents),
    [documents]
  );
  const taskSummary = useMemo(() => {
    const activeTasks = tasks.filter(
      (task) => task.status !== "done"
    );

    return {
      today: activeTasks.filter((task) =>
        isDueDateToday(task.dueDate)
      ).length,
      overdue: activeTasks.filter((task) =>
        isDueDateOverdue(task.dueDate)
      ).length,
    };
  }, [tasks]);

  async function createSidebarTask(
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();

    const title = newTaskTitle.trim();

    if (!title || creatingTask) {
      return;
    }

    setCreatingTask(true);
    setTasksError(null);

    try {
      const created = await createTask(title);

      setTasks((current) => [
        created,
        ...current.filter((task) => task.id !== created.id),
      ]);
      setNewTaskTitle("");
    } catch (error) {
      console.error(
        "Unable to create sidebar task:",
        error
      );
      setTasksError("Unable to create task.");
    } finally {
      setCreatingTask(false);
    }
  }

  async function toggleSidebarTask(task: Task): Promise<void> {
    const nextStatus: Task["status"] =
      task.status === "done" ? "todo" : "done";
    const previous = tasks;

    setTasks((current) =>
      current.map((entry) =>
        entry.id === task.id
          ? { ...entry, status: nextStatus }
          : entry
      )
    );
    setTasksError(null);

    try {
      const updated = await updateTask(task.id, {
        status: nextStatus,
      });

      setTasks((current) =>
        current.map((entry) =>
          entry.id === updated.id ? updated : entry
        )
      );
    } catch (error) {
      console.error(
        "Unable to update sidebar task:",
        error
      );
      setTasks(previous);
      setTasksError("Unable to update task.");
    }
  }

  async function deleteSidebarTask(id: string): Promise<void> {
    const previous = tasks;

    setTasks((current) =>
      current.filter((task) => task.id !== id)
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
      setTasksError("Unable to delete task.");
    }
  }

  return {
    sortedTasks,
    sortedDocuments,
    taskSummary,
    tasksLoading,
    documentsLoading,
    tasksError,
    documentsError,
    newTaskTitle,
    setNewTaskTitle,
    creatingTask,
    createSidebarTask,
    toggleSidebarTask,
    deleteSidebarTask,
  };
}

