import React from "react";

import {
  useGlobalCommands,
} from "../commands/useGlobalCommands";
import type {
  RightSidebarMode,
} from "../types/rightSidebar";
import CommandPalette from "./CommandPalette";

interface CommandPaletteManagerProps {
  rightSidebarOpen: boolean;
  rightSidebarMode: RightSidebarMode;
  cloudConnected: boolean;
  onToggleRightSidebar: () => void | Promise<void>;
  onSetRightSidebarMode: (
    mode: RightSidebarMode
  ) => void | Promise<void>;
  onToggleCloud: () => void;
}

const CommandPaletteManager: React.FC<
  CommandPaletteManagerProps
> = (props) => {
  useGlobalCommands(props);

  return <CommandPalette />;
};

export default CommandPaletteManager;

