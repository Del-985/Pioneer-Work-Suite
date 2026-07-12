// apps/web/src/components/CommandPaletteManager.tsx
import React, {
  useMemo,
} from "react";
import {
  useNavigate,
} from "react-router-dom";

import CommandPalette from "./CommandPalette";
import {
  openGlobalSearch,
} from "./GlobalSearch";
import {
  openShortcutReference,
} from "./KeyboardShortcutsManager";

import {
  useCommands,
} from "../commands/useCommands";
import type {
  CommandDefinition,
} from "../commands/commandTypes";

export interface CommandPaletteManagerProps {
  rightSidebarOpen: boolean;
  rightSidebarMode:
    | "tasks"
    | "documents";
  cloudConnected: boolean;

  onToggleRightSidebar: () =>
    void | Promise<void>;

  onSetRightSidebarMode: (
    mode:
      | "tasks"
      | "documents"
  ) => void | Promise<void>;

  onToggleCloud: () => void;
}

const CommandPaletteManager: React.FC<
  CommandPaletteManagerProps
> = ({
  rightSidebarOpen,
  rightSidebarMode,
  cloudConnected,
  onToggleRightSidebar,
  onSetRightSidebarMode,
  onToggleCloud,
}) => {
  const navigate = useNavigate();

  const commands =
    useMemo<CommandDefinition[]>(
      () => [
        {
          id: "go-dashboard",
          title: "Go to Dashboard",
          category: "Navigation",
          description:
            "Open the Today dashboard",
          keywords: [
            "home",
            "today",
            "overview",
          ],
          priority: 100,
          run: () =>
            navigate("/dashboard"),
        },
        {
          id: "go-tasks",
          title: "Go to Tasks",
          category: "Navigation",
          description:
            "Open the task workspace",
          keywords: [
            "todo",
            "work",
          ],
          priority: 95,
          run: () =>
            navigate("/tasks"),
        },
        {
          id: "go-documents",
          title: "Go to Documents",
          category: "Navigation",
          description:
            "Open the document workspace",
          keywords: [
            "docs",
            "editor",
            "writing",
          ],
          priority: 95,
          run: () =>
            navigate("/documents"),
        },
        {
          id: "go-calendar",
          title: "Go to Calendar",
          category: "Navigation",
          description:
            "Open the calendar",
          keywords: [
            "schedule",
            "events",
          ],
          run: () =>
            navigate("/calendar"),
        },
        {
          id: "go-mail",
          title: "Go to Mail",
          category: "Navigation",
          description:
            "Open the mail workspace",
          keywords: [
            "email",
            "inbox",
          ],
          run: () =>
            navigate("/mail"),
        },
        {
          id: "go-settings",
          title: "Go to Settings",
          category: "Navigation",
          description:
            "Open workspace settings",
          keywords: [
            "preferences",
            "configuration",
          ],
          run: () =>
            navigate("/settings"),
        },
        {
          id: "create-task",
          title: "Create new task",
          category: "Create",
          description:
            "Open Tasks with a new task ready",
          keywords: [
            "add task",
            "todo",
          ],
          shortcut: [
            "Ctrl",
            "N",
          ],
          priority: 90,
          run: () =>
            navigate(
              "/tasks?create=1"
            ),
        },
        {
          id: "create-document",
          title: "Create new document",
          category: "Create",
          description:
            "Create a blank document",
          keywords: [
            "new doc",
            "write",
          ],
          shortcut: [
            "Ctrl",
            "Shift",
            "N",
          ],
          priority: 90,
          run: () =>
            navigate(
              "/documents?create=1"
            ),
        },
        {
          id: "create-calendar-event",
          title: "Create calendar event",
          category: "Calendar",
          description:
            "Open Calendar in creation mode",
          keywords: [
            "new event",
            "schedule",
          ],
          run: () =>
            navigate(
              "/calendar?create=1"
            ),
        },
        {
          id: "compose-email",
          title: "Compose email",
          category: "Mail",
          description:
            "Open Mail in compose mode",
          keywords: [
            "new mail",
            "message",
          ],
          run: () =>
            navigate(
              "/mail?compose=1"
            ),
        },
        {
          id: "open-global-search",
          title: "Open Global Search",
          category: "Workspace",
          description:
            "Search tasks and documents",
          keywords: [
            "find",
            "content",
          ],
          shortcut: [
            "Ctrl",
            "K",
          ],
          priority: 85,
          run: openGlobalSearch,
        },
        {
          id: "show-shortcuts",
          title: "Show keyboard shortcuts",
          category: "Workspace",
          description:
            "Open the shortcut reference",
          keywords: [
            "keys",
            "hotkeys",
          ],
          shortcut: [
            "Ctrl",
            "/",
          ],
          run: openShortcutReference,
        },
        {
          id: "toggle-right-sidebar",
          title: rightSidebarOpen
            ? "Close right sidebar"
            : "Open right sidebar",
          category: "Workspace",
          description:
            "Toggle the workspace side panel",
          keywords: [
            "panel",
            "layout",
          ],
          run: onToggleRightSidebar,
        },
        {
          id: "sidebar-show-tasks",
          title:
            "Right sidebar: Show Tasks",
          category: "Workspace",
          description:
            rightSidebarMode === "tasks"
              ? "Tasks are already selected"
              : "Switch the side panel to Tasks",
          keywords: [
            "panel",
            "task sidebar",
          ],
          enabled:
            rightSidebarMode !== "tasks",
          disabledReason:
            "Tasks are already shown in the right sidebar.",
          run: () =>
            onSetRightSidebarMode(
              "tasks"
            ),
        },
        {
          id: "sidebar-show-documents",
          title:
            "Right sidebar: Show Documents",
          category: "Workspace",
          description:
            rightSidebarMode ===
            "documents"
              ? "Documents are already selected"
              : "Switch the side panel to Documents",
          keywords: [
            "panel",
            "document sidebar",
          ],
          enabled:
            rightSidebarMode !==
            "documents",
          disabledReason:
            "Documents are already shown in the right sidebar.",
          run: () =>
            onSetRightSidebarMode(
              "documents"
            ),
        },
        {
          id: "toggle-cloud",
          title: cloudConnected
            ? "Disconnect cloud"
            : "Connect cloud",
          category: "Workspace",
          description: cloudConnected
            ? "Return to local-only mode"
            : "Open cloud sign-in",
          keywords: [
            "sync",
            "account",
            "offline",
          ],
          run: onToggleCloud,
        },
        {
          id: "refresh-current-page",
          title: "Refresh current page",
          category: "Workspace",
          description:
            "Reload the current workspace view",
          keywords: [
            "reload",
            "update",
          ],
          run: () =>
            window.location.reload(),
        },
      ],
      [
        cloudConnected,
        navigate,
        onSetRightSidebarMode,
        onToggleCloud,
        onToggleRightSidebar,
        rightSidebarMode,
        rightSidebarOpen,
      ]
    );

  useCommands(commands);

  return <CommandPalette />;
};

export default CommandPaletteManager;
