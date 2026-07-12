// apps/web/src/keyboard/keyboardTypes.ts

export type ShortcutCategory =
  | "Navigation"
  | "Create"
  | "Documents"
  | "Search"
  | "Interface"
  | "Reserved";

export interface ShortcutDefinition {
  id: string;
  key: string;
  description: string;
  category: ShortcutCategory;

  primary?: boolean;
  shift?: boolean;
  alt?: boolean;

  allowInEditable?: boolean;
  preventDefault?: boolean;
  priority?: number;
  enabled?: boolean;

  handler: (event: KeyboardEvent) => void | Promise<void>;
}

export interface ShortcutDisplayItem {
  id: string;
  description: string;
  category: ShortcutCategory;
  keys: string[];
  enabled: boolean;
}

export type ShortcutUnregister = () => void;
