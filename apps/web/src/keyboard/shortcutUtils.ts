// apps/web/src/keyboard/shortcutUtils.ts
import type {
  ShortcutDefinition,
  ShortcutDisplayItem,
} from "./keyboardTypes";

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /mac|iphone|ipad|ipod/i.test(
    navigator.platform || navigator.userAgent
  );
}

export function isEditableTarget(
  target: EventTarget | null
): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    Boolean(
      target.closest(
        '[contenteditable="true"], .ql-editor'
      )
    )
  );
}

export function shortcutMatches(
  event: KeyboardEvent,
  shortcut: ShortcutDefinition
): boolean {
  const key = event.key.toLocaleLowerCase();
  const expectedKey =
    shortcut.key.toLocaleLowerCase();

  if (key !== expectedKey) {
    return false;
  }

  const primaryPressed =
    event.ctrlKey || event.metaKey;

  if (
    Boolean(shortcut.primary) !== primaryPressed
  ) {
    return false;
  }

  if (
    Boolean(shortcut.shift) !== event.shiftKey
  ) {
    return false;
  }

  if (
    Boolean(shortcut.alt) !== event.altKey
  ) {
    return false;
  }

  return true;
}

export function shortcutToDisplayItem(
  shortcut: ShortcutDefinition
): ShortcutDisplayItem {
  const keys: string[] = [];

  if (shortcut.primary) {
    keys.push(isMacPlatform() ? "⌘" : "Ctrl");
  }

  if (shortcut.shift) {
    keys.push("Shift");
  }

  if (shortcut.alt) {
    keys.push(
      isMacPlatform() ? "⌥" : "Alt"
    );
  }

  const keyLabel =
    shortcut.key === " "
      ? "Space"
      : shortcut.key.length === 1
        ? shortcut.key.toUpperCase()
        : shortcut.key;

  keys.push(keyLabel);

  return {
    id: shortcut.id,
    description: shortcut.description,
    category: shortcut.category,
    keys,
    enabled: shortcut.enabled !== false,
  };
}

