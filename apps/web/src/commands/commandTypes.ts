// apps/web/src/commands/commandTypes.ts

type CommandCategory =
  | "Navigation"
  | "Create"
  | "Workspace"
  | "Documents"
  | "Tasks"
  | "Calendar"
  | "Mail";

export interface CommandDefinition {
  id: string;
  title: string;
  category: CommandCategory;

  description?: string;
  keywords?: string[];
  shortcut?: string[];

  enabled?: boolean;
  disabledReason?: string;
  priority?: number;

  run: () => void | Promise<void>;
}

export interface CommandSearchResult {
  command: CommandDefinition;
  score: number;
  recentRank: number | null;
}

export type CommandUnregister = () => void;

