export const RIGHT_SIDEBAR_MODE_OPTIONS = [
  { value: "tasks", label: "Tasks", shortLabel: "Tasks" },
  {
    value: "recent_documents",
    label: "Recent documents",
    shortLabel: "Recent",
  },
  {
    value: "pinned_documents",
    label: "Pinned documents",
    shortLabel: "Pinned",
  },
  { value: "calendar", label: "Calendar", shortLabel: "Calendar" },
  {
    value: "statistics",
    label: "Workspace statistics",
    shortLabel: "Statistics",
  },
  { value: "none", label: "None", shortLabel: "None" },
] as const;

export type RightSidebarMode =
  (typeof RIGHT_SIDEBAR_MODE_OPTIONS)[number]["value"];

export function isRightSidebarMode(
  value: unknown
): value is RightSidebarMode {
  return RIGHT_SIDEBAR_MODE_OPTIONS.some(
    (option) => option.value === value
  );
}

export function normalizeRightSidebarMode(
  value: unknown
): RightSidebarMode {
  if (value === "documents") {
    return "recent_documents";
  }

  if (value === "mail") {
    return "none";
  }

  return isRightSidebarMode(value) ? value : "tasks";
}

export function getRightSidebarModeLabel(
  mode: RightSidebarMode
): string {
  return (
    RIGHT_SIDEBAR_MODE_OPTIONS.find(
      (option) => option.value === mode
    )?.label ?? "Sidebar"
  );
}

