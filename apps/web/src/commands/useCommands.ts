// apps/web/src/commands/useCommands.ts
import {
  useEffect,
} from "react";

import {
  commandRegistry,
} from "./commandRegistry";
import type {
  CommandDefinition,
} from "./commandTypes";

export function useCommands(
  commands: CommandDefinition[]
): void {
  useEffect(
    () =>
      commandRegistry.registerMany(
        commands
      ),
    [commands]
  );
}
