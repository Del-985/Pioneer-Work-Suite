// apps/web/src/components/KeyboardShortcutsManager.tsx
import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useNavigate,
} from "react-router-dom";

import {
  openGlobalSearch,
} from "./GlobalSearch";
import KeyboardShortcutsDialog from "./KeyboardShortcutsDialog";
import {
  openCommandPalette,
} from "./CommandPalette";

import {
  shortcutRegistry,
} from "../keyboard/shortcutRegistry";
import {
  useShortcuts,
} from "../keyboard/useShortcuts";
import type {
  ShortcutDefinition,
} from "../keyboard/keyboardTypes";

export const OPEN_SHORTCUT_REFERENCE_EVENT =
  "pioneer:open-shortcut-reference";

export function openShortcutReference(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new Event(
        OPEN_SHORTCUT_REFERENCE_EVENT
      )
    );
  }
}

const KeyboardShortcutsManager: React.FC =
  () => {
    const navigate = useNavigate();
    const [
      referenceOpen,
      setReferenceOpen,
    ] = useState(false);

    const globalShortcuts =
      useMemo<ShortcutDefinition[]>(
        () => [
          {
            id: "global-search",
            key: "k",
            primary: true,
            description:
              "Open Global Search",
            category: "Search",
            allowInEditable: true,
            priority: 20,
            handler: openGlobalSearch,
          },
          {
            id: "new-task",
            key: "n",
            primary: true,
            description:
              "Create a new task",
            category: "Create",
            handler: () =>
              navigate(
                "/tasks?create=1"
              ),
          },
          {
            id: "new-document",
            key: "n",
            primary: true,
            shift: true,
            description:
              "Create a new document",
            category: "Create",
            handler: () =>
              navigate(
                "/documents?create=1"
              ),
          },
          {
            id: "shortcut-reference",
            key: "/",
            primary: true,
            description:
              "Show keyboard shortcuts",
            category: "Interface",
            allowInEditable: true,
            handler: () =>
              setReferenceOpen(true),
          },
          {
            id: "command-palette",
            key: "p",
            primary: true,
            shift: true,
            description:
              "Open Command Palette",
            category: "Interface",
            allowInEditable: true,
            priority: 30,
            handler:
              openCommandPalette,
          },
        ],
        [navigate]
      );

    useShortcuts(globalShortcuts);

    useEffect(() => {
      const handleKeydown = (
        event: KeyboardEvent
      ) => {
        shortcutRegistry.handleKeydown(
          event
        );
      };

      window.addEventListener(
        "keydown",
        handleKeydown,
        true
      );

      return () => {
        window.removeEventListener(
          "keydown",
          handleKeydown,
          true
        );
      };
    }, []);

    useEffect(() => {
      const open = () =>
        setReferenceOpen(true);

      window.addEventListener(
        OPEN_SHORTCUT_REFERENCE_EVENT,
        open
      );

      return () => {
        window.removeEventListener(
          OPEN_SHORTCUT_REFERENCE_EVENT,
          open
        );
      };
    }, []);

    return (
      <KeyboardShortcutsDialog
        open={referenceOpen}
        onClose={() =>
          setReferenceOpen(false)
        }
      />
    );
  };

export default KeyboardShortcutsManager;
