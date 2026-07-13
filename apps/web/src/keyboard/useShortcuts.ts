// apps/web/src/keyboard/useShortcuts.ts
import {
  useEffect,
} from "react";

import {
  shortcutRegistry,
} from "./shortcutRegistry";
import type {
  ShortcutDefinition,
} from "./keyboardTypes";

export function useShortcuts(
  shortcuts: ShortcutDefinition[]
): void {
  useEffect(
    () =>
      shortcutRegistry.registerMany(
        shortcuts
      ),
    // Callers memoize shortcut definitions so registration only
    // changes when the definitions themselves change.
    [shortcuts]
  );
}

