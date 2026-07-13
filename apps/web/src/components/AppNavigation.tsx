import React from "react";
import { NavLink } from "react-router-dom";

import {
  openCommandPalette,
} from "./CommandPalette";
import {
  openGlobalSearch,
} from "./GlobalSearch";
import {
  openShortcutReference,
} from "./KeyboardShortcutsManager";

interface AppNavigationProps {
  cloudConnected: boolean;
  onToggleCloud: () => void;
}

const NAVIGATION_LINKS = [
  ["/dashboard", "Dashboard"],
  ["/documents", "Documents"],
  ["/tasks", "Tasks"],
  ["/calendar", "Calendar"],
  ["/mail", "Mail"],
  ["/settings", "Settings"],
] as const;

const AppNavigation: React.FC<AppNavigationProps> = ({
  cloudConnected,
  onToggleCloud,
}) => {
  return (
    <aside className="sidebar-left" aria-label="Application navigation">
      <div className="sidebar-logo">
        <span className="app-name">Pioneer Work Suite</span>
        <span className="app-tagline">Student</span>
      </div>

      <nav className="sidebar-nav" aria-label="Workspace pages">
        {NAVIGATION_LINKS.map(([to, label]) => (
          <NavLink
            key={to}
            className={({ isActive }) =>
              `nav-item${isActive ? " is-active" : ""}`
            }
            to={to}
          >
            {label}
          </NavLink>
        ))}

        <button
          className="nav-item sidebar-search-button"
          type="button"
          onClick={openGlobalSearch}
        >
          Search
          <span>Ctrl K</span>
        </button>

        <button
          className="nav-item sidebar-search-button"
          type="button"
          onClick={openCommandPalette}
        >
          Commands
          <span>Ctrl Shift P</span>
        </button>

        <button
          className="nav-item sidebar-search-button"
          type="button"
          onClick={openShortcutReference}
        >
          Shortcuts
          <span>Ctrl /</span>
        </button>
      </nav>

      <button
        type="button"
        onClick={onToggleCloud}
        className="sidebar-cloud-button"
      >
        {cloudConnected
          ? "Disconnect cloud"
          : "Connect cloud"}
      </button>
    </aside>
  );
};

export default AppNavigation;

