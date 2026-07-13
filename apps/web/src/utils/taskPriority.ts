import type {
  TaskPriority,
} from "../api/tasks";

export const TASK_PRIORITIES: TaskPriority[] = [
  "critical",
  "high",
  "medium",
  "low",
];

export const TASK_PRIORITY_RANK: Record<
  TaskPriority,
  number
> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function formatTaskPriority(
  priority: TaskPriority
): string {
  return (
    priority.charAt(0).toUpperCase() +
    priority.slice(1)
  );
}

