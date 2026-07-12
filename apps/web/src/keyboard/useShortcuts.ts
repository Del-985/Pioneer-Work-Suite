// apps/web/src/keyboard/useShortcuts.ts
import {
  useEffect,
  useMemo,
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
  const signature = useMemo(
    () =>
      shortcuts
        .map(
          (shortcut) =>
            `${shortcut.id}:${shortcut.enabled !== false}`
        )
        .join("|"),
    [shortcuts]
  );

  useEffect(
    () =>
      shortcutRegistry.registerMany(
        shortcuts
      ),
    // The caller should memoize shortcuts. The signature also
    // ensures enabled-state changes re-register definitions.
    [shortcuts, signature]
  );
}
