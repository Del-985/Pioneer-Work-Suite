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
  EVENTS_CHANGED_EVENT,
  fetchEvents,
} from "../api/events";
import type {
  CalendarEvent,
} from "../api/events";
import {
  SYNC_STATE_EVENT,
} from "../api/syncSupport";
import {
  TASKS_CHANGED_EVENT,
  createTask,
  deleteTask,
  fetchTasks,
  updateTask,
} from "../api/tasks";
import type {
  Task,
} from "../api/tasks";
import {
  sortDocumentsByUpdated,
} from "../utils/documentSort";
import {
  getDueDateKey,
  isDueDateOverdue,
  isDueDateToday,
} from "../utils/taskDates";
import {
  TASK_PRIORITY_RANK,
} from "../utils/taskPriority";
import type {
  RightSidebarMode,
} from "../types/rightSidebar";
import { toast } from "../toasts/toastStore";

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
  cloudConnected: boolean,
  mode: RightSidebarMode,
  isOpen: boolean
) {
  const location = useLocation();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [documents, setDocuments] =
    useState<Document[]>([]);
  const [events, setEvents] =
    useState<CalendarEvent[]>([]);
  const [tasksLoading, setTasksLoading] =
    useState(false);
  const [documentsLoading, setDocumentsLoading] =
    useState(false);
  const [eventsLoading, setEventsLoading] =
    useState(false);
  const [tasksError, setTasksError] =
    useState<string | null>(null);
  const [documentsError, setDocumentsError] =
    useState<string | null>(null);
  const [eventsError, setEventsError] =
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
        setEvents([]);
        setTasksError(null);
        setDocumentsError(null);
        setEventsError(null);
        setTasksLoading(false);
        setDocumentsLoading(false);
        setEventsLoading(false);
        return;
      }

      if (!isOpen || mode === "none") {
        return;
      }

      const needsTasks =
        mode === "tasks" || mode === "statistics";
      const needsDocuments =
        mode === "recent_documents" ||
        mode === "pinned_documents" ||
        mode === "statistics";
      const needsEvents =
        mode === "calendar" || mode === "statistics";

      if (needsTasks) {
        setTasksLoading(true);
        setTasksError(null);
      }

      if (needsDocuments) {
        setDocumentsLoading(true);
        setDocumentsError(null);
      }

      if (needsEvents) {
        setEventsLoading(true);
        setEventsError(null);
      }

      const [taskResult, documentResult, eventResult] =
        await Promise.allSettled([
          needsTasks ? fetchTasks() : Promise.resolve(null),
          needsDocuments
            ? fetchDocuments()
            : Promise.resolve(null),
          needsEvents ? fetchEvents() : Promise.resolve(null),
        ]);

      if (needsTasks) {
        if (taskResult.status === "fulfilled") {
          if (taskResult.value) {
            setTasks(taskResult.value);
          }
        } else {
          console.error(
            "Unable to load sidebar tasks:",
            taskResult.reason
          );
          setTasksError("Unable to load tasks.");
        }
      }

      if (needsDocuments) {
        if (documentResult.status === "fulfilled") {
          if (documentResult.value) {
            setDocuments(documentResult.value);
          }
        } else {
          console.error(
            "Unable to load sidebar documents:",
            documentResult.reason
          );
          setDocumentsError("Unable to load documents.");
        }
      }

      if (needsEvents) {
        if (eventResult.status === "fulfilled") {
          if (eventResult.value) {
            setEvents(eventResult.value);
          }
        } else {
          console.error(
            "Unable to load sidebar events:",
            eventResult.reason
          );
          setEventsError("Unable to load events.");
        }
      }

      if (needsTasks) setTasksLoading(false);
      if (needsDocuments) setDocumentsLoading(false);
      if (needsEvents) setEventsLoading(false);
    },
    [
      cloudConnected,
      isOpen,
      mode,
      workspaceAccessible,
    ]
  );

  useEffect(() => {
    void loadSidebarData();
  }, [loadSidebarData, location.pathname]);

  useEffect(() => {
    const refresh = () => {
      void loadSidebarData();
    };

    window.addEventListener(SYNC_STATE_EVENT, refresh);
    window.addEventListener(EVENTS_CHANGED_EVENT, refresh);
    window.addEventListener(TASKS_CHANGED_EVENT, refresh);

    return () => {
      window.removeEventListener(SYNC_STATE_EVENT, refresh);
      window.removeEventListener(
        EVENTS_CHANGED_EVENT,
        refresh
      );
      window.removeEventListener(TASKS_CHANGED_EVENT, refresh);
    };
  }, [loadSidebarData]);

  const sortedTasks = useMemo(
    () =>
      sortSidebarTasks(
        tasks.filter((task) => !task.archivedAt)
      ),
    [tasks]
  );
  const recentDocuments = useMemo(
    () => sortDocumentsByUpdated(documents),
    [documents]
  );
  const pinnedDocuments = useMemo(
    () =>
      sortDocumentsByUpdated(
        documents.filter((document) => document.isPinned)
      ),
    [documents]
  );
  const upcomingEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return [...events]
      .filter((event) => {
        const end = new Date(event.end || event.start);
        return !Number.isNaN(end.getTime()) && end >= today;
      })
      .sort(
        (left, right) =>
          new Date(left.start).getTime() -
          new Date(right.start).getTime()
      );
  }, [events]);
  const taskSummary = useMemo(() => {
    const activeTasks = tasks.filter(
      (task) => !task.archivedAt && task.status !== "done"
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
  const statistics = useMemo(
    () => ({
      activeTasks: tasks.filter(
        (task) => !task.archivedAt && task.status !== "done"
      ).length,
      completedTasks: tasks.filter(
        (task) => !task.archivedAt && task.status === "done"
      ).length,
      totalDocuments: documents.length,
      pinnedDocuments: documents.filter(
        (document) => document.isPinned
      ).length,
      upcomingEvents: upcomingEvents.length,
    }),
    [documents, tasks, upcomingEvents.length]
  );

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
      toast.success("Task created", { description: created.title });
    } catch (error) {
      console.error(
        "Unable to create sidebar task:",
        error
      );
      setTasksError("Unable to create task.");
      toast.error("Unable to create task");
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
      toast.error("Unable to update task");
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
      toast.success("Task deleted");
    } catch (error) {
      console.error(
        "Unable to delete sidebar task:",
        error
      );
      setTasks(previous);
      setTasksError("Unable to delete task.");
      toast.error("Unable to delete task");
    }
  }

  return {
    sortedTasks,
    recentDocuments,
    pinnedDocuments,
    upcomingEvents,
    statistics,
    taskSummary,
    tasksLoading,
    documentsLoading,
    eventsLoading,
    tasksError,
    documentsError,
    eventsError,
    newTaskTitle,
    setNewTaskTitle,
    creatingTask,
    createSidebarTask,
    toggleSidebarTask,
    deleteSidebarTask,
  };
}
