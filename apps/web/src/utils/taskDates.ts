// apps/web/src/utils/taskDates.ts

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getDueDateKey(raw?: string | null): string | null {
  if (!raw) {
    return null;
  }

  const value = String(raw).trim();
  const match = DATE_KEY_PATTERN.exec(value);

  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return getLocalDateKey(parsed);
}

export function getEndOfLocalWeekKey(reference: Date = new Date()): string {
  const endOfWeek = new Date(reference);
  const daysUntilSunday = (7 - endOfWeek.getDay()) % 7;

  endOfWeek.setDate(endOfWeek.getDate() + daysUntilSunday);

  return getLocalDateKey(endOfWeek);
}

export function isDueDateToday(
  raw?: string | null,
  reference: Date = new Date()
): boolean {
  const dueKey = getDueDateKey(raw);

  return dueKey !== null && dueKey === getLocalDateKey(reference);
}

export function isDueDateOverdue(
  raw?: string | null,
  reference: Date = new Date()
): boolean {
  const dueKey = getDueDateKey(raw);

  return dueKey !== null && dueKey < getLocalDateKey(reference);
}

export function isDueDateUpcoming(
  raw?: string | null,
  reference: Date = new Date()
): boolean {
  const dueKey = getDueDateKey(raw);

  return dueKey !== null && dueKey > getLocalDateKey(reference);
}

export function isDueDateThisWeek(
  raw?: string | null,
  reference: Date = new Date()
): boolean {
  const dueKey = getDueDateKey(raw);

  if (!dueKey) {
    return false;
  }

  const todayKey = getLocalDateKey(reference);
  const weekEndKey = getEndOfLocalWeekKey(reference);

  return dueKey > todayKey && dueKey <= weekEndKey;
}

export function toDateInputValue(raw?: string | null): string {
  return getDueDateKey(raw) ?? "";
}

export function formatTaskDueDate(raw?: string | null): string {
  const key = getDueDateKey(raw);

  if (!key) {
    return "No due date";
  }

  const [year, month, day] = key.split("-").map(Number);
  const localDate = new Date(year, month - 1, day);

  if (Number.isNaN(localDate.getTime())) {
    return "Invalid due date";
  }

  return localDate.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year:
      year === new Date().getFullYear() ? undefined : "numeric",
  });
}
