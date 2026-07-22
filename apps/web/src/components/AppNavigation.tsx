import React, { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

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
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const runNavigationAction = (action: () => void) => {
    setMobileMenuOpen(false);
    action();
  };

  return (
    <aside className={`sidebar-left${mobileMenuOpen ? " is-mobile-open" : ""}`} aria-label="Application navigation">
      <div className="sidebar-mobile-header">
        <div className="sidebar-logo">
          <span className="app-name">Pioneer Work Suite</span>
          <span className="app-tagline">Student</span>
        </div>
        <button
          className="sidebar-menu-button"
          type="button"
          aria-expanded={mobileMenuOpen}
          aria-controls="app-navigation-panel"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? "Close" : "Menu"}
        </button>
      </div>

      <div className="sidebar-mobile-panel" id="app-navigation-panel">
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
            className="nav-item"
            type="button"
            onClick={() => runNavigationAction(openGlobalSearch)}
            aria-keyshortcuts="Control+K Meta+K"
          >
            Search
          </button>

          <button
            className="nav-item"
            type="button"
            onClick={() => runNavigationAction(openCommandPalette)}
            aria-keyshortcuts="Control+Shift+P Meta+Shift+P"
          >
            Commands
          </button>

          <button
            className="nav-item"
            type="button"
            onClick={() => runNavigationAction(openShortcutReference)}
            aria-keyshortcuts="Control+/ Meta+/"
          >
            Shortcuts
          </button>
        </nav>

        <button
          type="button"
          onClick={() => runNavigationAction(onToggleCloud)}
          className="sidebar-cloud-button"
        >
          {cloudConnected
            ? "Disconnect cloud"
            : "Connect cloud"}
        </button>
      </div>
    </aside>
  );
};

export default AppNavigation;

