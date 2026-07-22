import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  disconnectCloudSession,
  hasCloudSession,
  hasWorkspaceAccess,
} from "./api/session";
import {
  getSettingsSnapshot,
  getStartupPath,
  subscribeToSettings,
  updateSettings,
} from "./api/settings";
import type {
  AppSettings,
} from "./api/settings";
import {
  startSyncCoordinator,
} from "./api/sync";
import AppNavigation from "./components/AppNavigation";
import AppRoutes from "./components/AppRoutes";
import CommandPaletteManager from "./components/CommandPaletteManager";
import GlobalSearch from "./components/GlobalSearch";
import KeyboardShortcutsManager from "./components/KeyboardShortcutsManager";
import RightSidebar from "./components/RightSidebar";
import StatusBar from "./components/StatusBar";
import ToastViewport from "./components/ToastViewport";
import UpdateBanner from "./components/UpdateBanner";
import type {
  RightSidebarMode,
} from "./types/rightSidebar";
import {
  normalizeRightSidebarMode,
} from "./types/rightSidebar";
import { useSessionRecovery } from "./hooks/useSessionRecovery";

import "./styles/app-shell.css";

function toSidebarMode(
  preference: AppSettings["sidebar"]["rightSidebarDefault"]
): RightSidebarMode {
  return normalizeRightSidebarMode(preference);
}

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const recoveredPath = useSessionRecovery();
  const initialSettings = useRef(
    getSettingsSnapshot()
  ).current;
  const settingsRef = useRef(initialSettings);

  const [settings, setSettings] =
    useState<AppSettings>(initialSettings);
  const [isRightSidebarOpen, setIsRightSidebarOpen] =
    useState(initialSettings.sidebar.rightSidebarOpen);
  const [sidebarMode, setSidebarMode] =
    useState<RightSidebarMode>(
      toSidebarMode(
        initialSettings.sidebar.rightSidebarDefault
      )
    );

  const workspaceAccessible = hasWorkspaceAccess();
  const cloudConnected = hasCloudSession();
  const isEntryRoute =
    location.pathname === "/login" ||
    location.pathname === "/register";

  useEffect(() => {
    return subscribeToSettings((nextSettings) => {
      const previousSettings = settingsRef.current;

      settingsRef.current = nextSettings;
      setSettings(nextSettings);

      if (
        previousSettings.sidebar.rightSidebarDefault !==
        nextSettings.sidebar.rightSidebarDefault
      ) {
        setSidebarMode(
          toSidebarMode(
            nextSettings.sidebar.rightSidebarDefault
          )
        );
      }

      if (
        previousSettings.sidebar.rightSidebarOpen !==
        nextSettings.sidebar.rightSidebarOpen
      ) {
        setIsRightSidebarOpen(
          nextSettings.sidebar.rightSidebarOpen
        );
      }
    });
  }, []);

  useEffect(() => startSyncCoordinator(), []);

  const handleSidebarModeChange = useCallback(
    async (mode: RightSidebarMode): Promise<void> => {
      setSidebarMode(mode);

      try {
        await updateSettings({
          sidebar: {
            rightSidebarDefault: mode,
          },
        });
      } catch (error) {
        console.error(
          "Unable to save sidebar content setting:",
          error
        );
      }
    },
    []
  );

  const handleSidebarToggle = useCallback(
    async (): Promise<void> => {
      const nextOpen = !isRightSidebarOpen;

      setIsRightSidebarOpen(nextOpen);

      if (!settings.sidebar.rememberOpenState) {
        return;
      }

      try {
        await updateSettings({
          sidebar: {
            rightSidebarOpen: nextOpen,
          },
        });
      } catch (error) {
        console.error(
          "Unable to save sidebar open state:",
          error
        );
      }
    },
    [isRightSidebarOpen, settings.sidebar.rememberOpenState]
  );

  const handleDisconnectCloud = useCallback(() => {
    disconnectCloudSession();
    setIsRightSidebarOpen(false);
    navigate(
      getStartupPath(settings.workspace.startupPage),
      { replace: true }
    );
  }, [navigate, settings.workspace.startupPage]);

  const handleToggleCloud = useCallback(() => {
    if (cloudConnected) {
      handleDisconnectCloud();
    } else {
      navigate("/login");
    }
  }, [cloudConnected, handleDisconnectCloud, navigate]);

  return (
    <div className={`app${isEntryRoute ? " app-entry-mode" : ""}`}>
      <a className="skip-link" href="#workspace-content">
        Skip to workspace content
      </a>
      <UpdateBanner />
      <GlobalSearch />
      <KeyboardShortcutsManager />
      <ToastViewport />
      <CommandPaletteManager
        rightSidebarOpen={isRightSidebarOpen}
        rightSidebarMode={sidebarMode}
        cloudConnected={cloudConnected}
        onToggleRightSidebar={handleSidebarToggle}
        onSetRightSidebarMode={handleSidebarModeChange}
        onToggleCloud={handleToggleCloud}
      />

      {!isEntryRoute && (
        <AppNavigation
          cloudConnected={cloudConnected}
          onToggleCloud={handleToggleCloud}
        />
      )}

      <div className="main-layout">
        <main className="workspace">
          <section
            id="workspace-content"
            className="workspace-body"
            tabIndex={-1}
          >
            <AppRoutes
              workspaceAccessible={workspaceAccessible}
              startupPage={settings.workspace.startupPage}
              recoveredPath={recoveredPath}
              sidebarMode={sidebarMode}
              onSidebarModeChange={handleSidebarModeChange}
            />
          </section>
        </main>

        {!isEntryRoute && settings.sidebar.rightSidebarVisible && (
          <RightSidebar
            isOpen={isRightSidebarOpen}
            mode={sidebarMode}
            workspaceAccessible={workspaceAccessible}
            cloudConnected={cloudConnected}
            onToggle={handleSidebarToggle}
            onModeChange={handleSidebarModeChange}
          />
        )}
      </div>

      {!isEntryRoute && <StatusBar />}
    </div>
  );
};

export default App;

