// apps/web/src/pages/SettingsPage.tsx
import React, { useEffect, useState } from "react";

import { fetchTasks, refreshPendingTaskSyncCount } from "../api/tasks";
import {
  fetchDocuments,
  refreshPendingDocumentSyncCount,
} from "../api/documents";
import {
  fetchEvents,
  refreshPendingEventSyncCount,
} from "../api/events";
import { getWorkspaceName, hasCloudSession } from "../api/session";
import {
  AppSettings,
  FontSizePreference,
  SidebarContentPreference,
  StartupPagePreference,
  ThemePreference,
  UiDensityPreference,
  getSettingsSnapshot,
  resetSettings,
  subscribeToSettings,
  updateSettings,
} from "../api/settings";
import { APP_VERSION } from "../config/appMetadata";
import {
  RIGHT_SIDEBAR_MODE_OPTIONS,
} from "../types/rightSidebar";

type DiagnosticState = {
  loading: boolean;
  error: string | null;
  workspaceName: string;
  cloudConnected: boolean;
  indexedDbAvailable: boolean;
  tasks: number;
  documents: number;
  events: number;
  pendingTaskSync: number;
  pendingDocumentSync: number;
  pendingEventSync: number;
  appVersion: string;
};

function isIndexedDbAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function makeInitialDiagnostics(): DiagnosticState {
  return {
    loading: true,
    error: null,
    workspaceName: "Student",
    cloudConnected: false,
    indexedDbAvailable: isIndexedDbAvailable(),
    tasks: 0,
    documents: 0,
    events: 0,
    pendingTaskSync: 0,
    pendingDocumentSync: 0,
    pendingEventSync: 0,
    appVersion: APP_VERSION,
  };
}

const sectionStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "#050713",
  padding: 16,
};

const cardStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.025)",
  padding: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#8f97c4",
  marginBottom: 5,
};

const valueStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: "#f5f5f5",
};

const smallTextStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#9da2c8",
  lineHeight: 1.5,
};

const controlRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 1fr) minmax(180px, 260px)",
  gap: 16,
  alignItems: "center",
  padding: "12px 0",
  borderBottom: "1px solid rgba(255,255,255,0.07)",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "#05070a",
  color: "#f5f5f5",
  fontSize: 13,
};

const buttonStyle: React.CSSProperties = {
  padding: "7px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "transparent",
  color: "#f5f5f5",
  fontSize: 12,
  cursor: "pointer",
};

interface SettingDescriptionProps {
  title: string;
  description: string;
}

const SettingDescription: React.FC<SettingDescriptionProps> = ({
  title,
  description,
}) => {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
      <div style={{ ...smallTextStyle, marginTop: 3 }}>{description}</div>
    </div>
  );
};

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label }) => {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 8,
        fontSize: 12,
        color: "#d7d9f8",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
};

const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(
    getSettingsSnapshot
  );

  const [diagnostics, setDiagnostics] = useState<DiagnosticState>(
    makeInitialDiagnostics
  );

  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);

  useEffect(() => {
    return subscribeToSettings((nextSettings) => {
      setSettings(nextSettings);
    });
  }, []);

  async function applySettings(
    patch: Parameters<typeof updateSettings>[0]
  ): Promise<void> {
    setSaving(true);
    setSettingsMessage(null);

    try {
      const updated = await updateSettings(patch);
      setSettings(updated);
      setSettingsMessage("Settings saved.");
    } catch (error) {
      console.error("Unable to save settings:", error);
      setSettingsMessage("Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetSettings(): Promise<void> {
    const confirmed = window.confirm(
      "Reset all application settings to their defaults?"
    );

    if (!confirmed) {
      return;
    }

    setResetting(true);
    setSettingsMessage(null);

    try {
      const defaults = await resetSettings();
      setSettings(defaults);
      setSettingsMessage("Settings reset to defaults.");
    } catch (error) {
      console.error("Unable to reset settings:", error);
      setSettingsMessage("Unable to reset settings.");
    } finally {
      setResetting(false);
    }
  }

  async function loadDiagnostics(): Promise<void> {
    setDiagnostics((current) => ({
      ...current,
      loading: true,
      error: null,
    }));

    try {
      const [
        tasks,
        documents,
        events,
        pendingTaskSync,
        pendingDocumentSync,
        pendingEventSync,
      ] = await Promise.all([
        fetchTasks(),
        fetchDocuments(),
        fetchEvents(),
        refreshPendingTaskSyncCount(),
        refreshPendingDocumentSyncCount(),
        refreshPendingEventSyncCount(),
      ]);

      setDiagnostics({
        loading: false,
        error: null,
        workspaceName: getWorkspaceName(),
        cloudConnected: hasCloudSession(),
        indexedDbAvailable: isIndexedDbAvailable(),
        tasks: tasks.length,
        documents: documents.length,
        events: events.length,
        pendingTaskSync,
        pendingDocumentSync,
        pendingEventSync,
        appVersion: APP_VERSION,
      });
    } catch (error) {
      console.error("Unable to load diagnostics:", error);

      setDiagnostics((current) => ({
        ...current,
        loading: false,
        error: "Unable to load local diagnostics.",
      }));
    }
  }

  useEffect(() => {
    void loadDiagnostics();
  }, []);

  const totalPendingSync =
    diagnostics.pendingTaskSync +
    diagnostics.pendingDocumentSync +
    diagnostics.pendingEventSync;

  return (
    <div>
      <h2>Settings</h2>

      <p className="workspace-subtitle">
        Customize the workspace, manage application behavior, and review local
        developer diagnostics.
      </p>

      {settingsMessage && (
        <div
          style={{
            marginTop: 14,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid rgba(127, 150, 255, 0.3)",
            background: "rgba(63, 100, 255, 0.1)",
            color: "#cbd2ff",
            fontSize: 12,
          }}
        >
          {settingsMessage}
        </div>
      )}

      <section style={{ ...sectionStyle, marginTop: 18 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Appearance</h3>

        <p style={{ ...smallTextStyle, marginTop: 5 }}>
          Change the overall appearance and spacing of the application.
        </p>

        <div style={controlRowStyle}>
          <SettingDescription
            title="Theme"
            description="Choose dark mode, light mode, or follow the operating system."
          />

          <select
            value={settings.appearance.theme}
            onChange={(event) =>
              void applySettings({
                appearance: {
                  theme: event.target.value as ThemePreference,
                },
              })
            }
            style={selectStyle}
            disabled={saving}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">System default</option>
          </select>
        </div>

        <div style={controlRowStyle}>
          <SettingDescription
            title="Font size"
            description="Adjust the base text size throughout the workspace."
          />

          <select
            value={settings.appearance.fontSize}
            onChange={(event) =>
              void applySettings({
                appearance: {
                  fontSize: event.target.value as FontSizePreference,
                },
              })
            }
            style={selectStyle}
            disabled={saving}
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
            <option value="extra-large">Extra large</option>
          </select>
        </div>

        <div style={controlRowStyle}>
          <SettingDescription
            title="Interface density"
            description="Use tighter spacing or a more comfortable layout."
          />

          <select
            value={settings.appearance.density}
            onChange={(event) =>
              void applySettings({
                appearance: {
                  density: event.target.value as UiDensityPreference,
                },
              })
            }
            style={selectStyle}
            disabled={saving}
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
          </select>
        </div>

        <div
          style={{
            ...controlRowStyle,
            borderBottom: "none",
          }}
        >
          <SettingDescription
            title="Animations"
            description="Enable interface transitions and animated effects."
          />

          <Toggle
            checked={settings.appearance.animationsEnabled}
            onChange={(checked) =>
              void applySettings({
                appearance: {
                  animationsEnabled: checked,
                },
              })
            }
            label={
              settings.appearance.animationsEnabled ? "Enabled" : "Disabled"
            }
          />
        </div>
      </section>

      <section style={{ ...sectionStyle, marginTop: 18 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Sidebar</h3>

        <p style={{ ...smallTextStyle, marginTop: 5 }}>
          Control the right-side workspace panel and its default content.
        </p>

        <div style={controlRowStyle}>
          <SettingDescription
            title="Show right sidebar"
            description="Display or completely hide the right workspace panel."
          />

          <Toggle
            checked={settings.sidebar.rightSidebarVisible}
            onChange={(checked) =>
              void applySettings({
                sidebar: {
                  rightSidebarVisible: checked,
                },
              })
            }
            label={
              settings.sidebar.rightSidebarVisible ? "Visible" : "Hidden"
            }
          />
        </div>

        <div style={controlRowStyle}>
          <SettingDescription
            title="Default sidebar content"
            description="Choose what the right sidebar displays when the app starts."
          />

          <select
            value={settings.sidebar.rightSidebarDefault}
            onChange={(event) =>
              void applySettings({
                sidebar: {
                  rightSidebarDefault:
                    event.target.value as SidebarContentPreference,
                },
              })
            }
            style={selectStyle}
            disabled={saving}
          >
            {RIGHT_SIDEBAR_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div style={controlRowStyle}>
          <SettingDescription
            title="Remember sidebar state"
            description="Remember whether the right sidebar was open or collapsed."
          />

          <Toggle
            checked={settings.sidebar.rememberOpenState}
            onChange={(checked) =>
              void applySettings({
                sidebar: {
                  rememberOpenState: checked,
                },
              })
            }
            label={
              settings.sidebar.rememberOpenState
                ? "Remember state"
                : "Use default"
            }
          />
        </div>

        {"rightSidebarOpen" in settings.sidebar && (
          <div
            style={{
              ...controlRowStyle,
              borderBottom: "none",
            }}
          >
            <SettingDescription
              title="Default sidebar state"
              description="Choose whether the panel starts open or collapsed."
            />

            <Toggle
              checked={Boolean(settings.sidebar.rightSidebarOpen)}
              onChange={(checked) =>
                void applySettings({
                  sidebar: {
                    rightSidebarOpen: checked,
                  },
                })
              }
              label={
                settings.sidebar.rightSidebarOpen ? "Open" : "Collapsed"
              }
            />
          </div>
        )}
      </section>

      <section style={{ ...sectionStyle, marginTop: 18 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Workspace</h3>

        <p style={{ ...smallTextStyle, marginTop: 5 }}>
          Configure how the application behaves when it opens.
        </p>

        <div
          style={{
            ...controlRowStyle,
            borderBottom: "none",
          }}
        >
          <SettingDescription
            title="Startup page"
            description="Choose the first workspace page shown after launch."
          />

          <select
            value={settings.workspace.startupPage}
            onChange={(event) =>
              void applySettings({
                workspace: {
                  startupPage:
                    event.target.value as StartupPagePreference,
                },
              })
            }
            style={selectStyle}
            disabled={saving}
          >
            <option value="dashboard">Dashboard</option>
            <option value="tasks">Tasks</option>
            <option value="documents">Documents</option>
            <option value="calendar">Calendar</option>
            <option value="mail">Mail</option>
            <option value="settings">Settings</option>
          </select>
        </div>
      </section>

      <section style={{ ...sectionStyle, marginTop: 18 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Developer settings</h3>

        <p style={{ ...smallTextStyle, marginTop: 5 }}>
          Control whether local developer diagnostics appear on this page.
        </p>

        <div
          style={{
            ...controlRowStyle,
            borderBottom: "none",
          }}
        >
          <SettingDescription
            title="Developer tools"
            description="Show storage counts, sync queues, and application diagnostics."
          />

          <Toggle
            checked={settings.developer.developerToolsVisible}
            onChange={(checked) =>
              void applySettings({
                developer: {
                  developerToolsVisible: checked,
                },
              })
            }
            label={
              settings.developer.developerToolsVisible
                ? "Visible"
                : "Hidden"
            }
          />
        </div>
      </section>

      <section style={{ ...sectionStyle, marginTop: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>Reset settings</h3>

            <p style={{ ...smallTextStyle, margin: "4px 0 0" }}>
              Restore application preferences to their original defaults.
              Tasks, documents, and calendar events are not affected.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleResetSettings()}
            disabled={resetting}
            style={{
              ...buttonStyle,
              border: "1px solid rgba(255,123,136,0.35)",
              color: "#ffadb6",
              opacity: resetting ? 0.7 : 1,
              cursor: resetting ? "default" : "pointer",
            }}
          >
            {resetting ? "Resetting..." : "Reset settings"}
          </button>
        </div>
      </section>

      {settings.developer.developerToolsVisible && (
        <>
          <div
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <section style={cardStyle}>
              <div style={labelStyle}>Workspace</div>
              <div style={valueStyle}>{diagnostics.workspaceName}</div>
              <p style={{ ...smallTextStyle, marginBottom: 0 }}>
                Local workspace profile currently active on this device.
              </p>
            </section>

            <section style={cardStyle}>
              <div style={labelStyle}>Cloud status</div>
              <div style={valueStyle}>
                {diagnostics.cloudConnected ? "Connected" : "Local only"}
              </div>
              <p style={{ ...smallTextStyle, marginBottom: 0 }}>
                Backend and cloud features are expected to return in 0.2.0.
              </p>
            </section>

            <section style={cardStyle}>
              <div style={labelStyle}>Storage engine</div>
              <div style={valueStyle}>
                {diagnostics.indexedDbAvailable
                  ? "IndexedDB"
                  : "Unavailable"}
              </div>
              <p style={{ ...smallTextStyle, marginBottom: 0 }}>
                Local data persists across application restarts and updates.
              </p>
            </section>

            <section style={cardStyle}>
              <div style={labelStyle}>App version</div>
              <div style={valueStyle}>v{diagnostics.appVersion}</div>
              <p style={{ ...smallTextStyle, marginBottom: 0 }}>
                Version is read from the centralized application source.
              </p>
            </section>
          </div>

          <section style={{ ...sectionStyle, marginTop: 18 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>
                  Developer tools
                </h3>

                <p style={{ ...smallTextStyle, margin: "4px 0 0" }}>
                  Read-only diagnostics for local storage, sync queues, and
                  migration testing.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void loadDiagnostics()}
                disabled={diagnostics.loading}
                style={{
                  ...buttonStyle,
                  cursor: diagnostics.loading ? "default" : "pointer",
                  opacity: diagnostics.loading ? 0.7 : 1,
                }}
              >
                {diagnostics.loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {diagnostics.error && (
              <p style={{ fontSize: 13, color: "#ff7b88" }}>
                {diagnostics.error}
              </p>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 10,
              }}
            >
              <div style={cardStyle}>
                <div style={labelStyle}>Tasks</div>
                <div style={valueStyle}>{diagnostics.tasks}</div>
              </div>

              <div style={cardStyle}>
                <div style={labelStyle}>Documents</div>
                <div style={valueStyle}>{diagnostics.documents}</div>
              </div>

              <div style={cardStyle}>
                <div style={labelStyle}>Calendar events</div>
                <div style={valueStyle}>{diagnostics.events}</div>
              </div>

              <div style={cardStyle}>
                <div style={labelStyle}>Pending sync</div>
                <div style={valueStyle}>{totalPendingSync}</div>
              </div>
            </div>

            <div
              style={{
                marginTop: 14,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.1)",
                overflow: "hidden",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: 8, color: "#9da2c8" }}>
                      Pending task operations
                    </td>
                    <td style={{ padding: 8, textAlign: "right" }}>
                      {diagnostics.pendingTaskSync}
                    </td>
                  </tr>

                  <tr>
                    <td style={{ padding: 8, color: "#9da2c8" }}>
                      Pending document operations
                    </td>
                    <td style={{ padding: 8, textAlign: "right" }}>
                      {diagnostics.pendingDocumentSync}
                    </td>
                  </tr>

                  <tr>
                    <td style={{ padding: 8, color: "#9da2c8" }}>
                      Pending calendar event operations
                    </td>
                    <td style={{ padding: 8, textAlign: "right" }}>
                      {diagnostics.pendingEventSync}
                    </td>
                  </tr>

                  <tr>
                    <td style={{ padding: 8, color: "#9da2c8" }}>
                      IndexedDB available
                    </td>
                    <td style={{ padding: 8, textAlign: "right" }}>
                      {diagnostics.indexedDbAvailable ? "Yes" : "No"}
                    </td>
                  </tr>

                  <tr>
                    <td style={{ padding: 8, color: "#9da2c8" }}>
                      Cloud session token present
                    </td>
                    <td style={{ padding: 8, textAlign: "right" }}>
                      {diagnostics.cloudConnected ? "Yes" : "No"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p
              style={{
                ...smallTextStyle,
                marginTop: 12,
                marginBottom: 0,
              }}
            >
              Destructive tools such as wiping storage, forcing migrations,
              importing backups, and clearing sync queues are intentionally
              excluded for now.
            </p>
          </section>
        </>
      )}
    </div>
  );
};

export default SettingsPage;

