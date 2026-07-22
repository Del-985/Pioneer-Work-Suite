import React, { useEffect, useRef, useState } from "react";

import { fetchDocuments, refreshPendingDocumentSyncCount } from "../api/documents";
import { fetchEvents, refreshPendingEventSyncCount } from "../api/events";
import { getWorkspaceName, hasCloudSession } from "../api/session";
import {
  type AccentPreference,
  type AppSettingsPatch,
  type CompletedTaskBehavior,
  type EditorFontPreference,
  type EditorLineSpacingPreference,
  type FontSizePreference,
  type SidebarContentPreference,
  type StartupPagePreference,
  type TaskArchiveBehavior,
  type TaskDefaultDueDate,
  type TaskDefaultPriority,
  type ThemePreference,
  type UiDensityPreference,
  resetSettings,
  updateSettings,
} from "../api/settings";
import { fetchTasks, refreshPendingTaskSyncCount } from "../api/tasks";
import {
  downloadWorkspaceBackup,
  getLastWorkspaceBackupAt,
  getLastWorkspaceRestoreAt,
  restoreWorkspaceBackup,
} from "../api/workspaceBackup";
import DeveloperConsole from "../components/developer/DeveloperConsole";
import { openShortcutReference } from "../components/KeyboardShortcutsManager";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import SectionHeader from "../components/ui/SectionHeader";
import { APP_VERSION } from "../config/appMetadata";
import { useAppSettings } from "../hooks/useAppSettings";
import { useConfirmation } from "../hooks/useConfirmation";
import { toast } from "../toasts/toastStore";
import { RIGHT_SIDEBAR_MODE_OPTIONS } from "../types/rightSidebar";

import "../styles/settings.css";

interface Diagnostics {
  loading: boolean;
  error: string | null;
  tasks: number;
  documents: number;
  events: number;
  pendingTasks: number;
  pendingDocuments: number;
  pendingEvents: number;
}

const EMPTY_DIAGNOSTICS: Diagnostics = {
  loading: true,
  error: null,
  tasks: 0,
  documents: 0,
  events: 0,
  pendingTasks: 0,
  pendingDocuments: 0,
  pendingEvents: 0,
};

interface SettingRowProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

const SettingRow: React.FC<SettingRowProps> = ({ title, description, children }) => (
  <div className="settings-row">
    <div className="settings-row__copy">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
    <div className="settings-row__control">
      {React.isValidElement(children) && children.type === "select"
        ? React.cloneElement(
            children as React.ReactElement<React.SelectHTMLAttributes<HTMLSelectElement>>,
            { "aria-label": title }
          )
        : children}
    </div>
  </div>
);

interface ToggleProps {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

const Toggle: React.FC<ToggleProps> = ({ checked, label, disabled, onChange }) => (
  <label className="settings-toggle">
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span>{label}</span>
  </label>
);

const SettingsPage: React.FC = () => {
  const settings = useAppSettings();
  const { confirm, confirmationDialog } = useConfirmation();
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [diagnostics, setDiagnostics] = useState(EMPTY_DIAGNOSTICS);
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const [backupAction, setBackupAction] = useState<"export" | "restore" | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState(getLastWorkspaceBackupAt());
  const [lastRestoreAt, setLastRestoreAt] = useState(getLastWorkspaceRestoreAt());

  async function applySettings(patch: AppSettingsPatch): Promise<void> {
    setSaving(true);
    try {
      await updateSettings(patch);
      toast.success("Settings saved");
    } catch (error) {
      console.error("Unable to save settings:", error);
      toast.error("Unable to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset(): Promise<void> {
    const accepted = await confirm({
      title: "Reset application settings?",
      description:
        "This restores every preference to its default. Tasks, documents, calendar events, and mail are not affected.",
      confirmLabel: "Reset settings",
      dangerous: true,
    });
    if (!accepted) return;

    setResetting(true);
    try {
      await resetSettings();
      toast.success("Settings reset");
    } catch (error) {
      console.error("Unable to reset settings:", error);
      toast.error("Unable to reset settings");
    } finally {
      setResetting(false);
    }
  }

  async function loadDiagnostics(): Promise<void> {
    setDiagnostics((current) => ({ ...current, loading: true, error: null }));
    try {
      const [tasks, documents, events, pendingTasks, pendingDocuments, pendingEvents] =
        await Promise.all([
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
        tasks: tasks.length,
        documents: documents.length,
        events: events.length,
        pendingTasks,
        pendingDocuments,
        pendingEvents,
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

  async function handleExportBackup(): Promise<void> {
    setBackupAction("export");
    try {
      const summary = await downloadWorkspaceBackup();
      setLastBackupAt(getLastWorkspaceBackupAt());
      toast.success(
        `Backup downloaded: ${summary.tasks} tasks, ${summary.documents} documents, and ${summary.events} events.`
      );
    } catch (error) {
      console.error("Unable to export workspace backup:", error);
      toast.error("Unable to export the local workspace backup");
    } finally {
      setBackupAction(null);
    }
  }

  async function handleRestoreBackup(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const accepted = await confirm({
      title: "Restore local workspace backup?",
      description:
        "This replaces local tasks, documents, calendar events, recovery drafts, settings, and pending sync queues. Cloud credentials are not changed.",
      confirmLabel: "Restore backup",
      dangerous: true,
    });
    if (!accepted) return;

    setBackupAction("restore");
    try {
      const summary = await restoreWorkspaceBackup(file);
      setLastRestoreAt(getLastWorkspaceRestoreAt());
      toast.success(
        `Backup restored: ${summary.tasks} tasks, ${summary.documents} documents, and ${summary.events} events. Reloading...`
      );
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      console.error("Unable to restore workspace backup:", error);
      toast.error(error instanceof Error ? error.message : "Unable to restore the backup");
      setBackupAction(null);
    }
  }

  useEffect(() => {
    void loadDiagnostics();
  }, []);

  const totalPending =
    diagnostics.pendingTasks + diagnostics.pendingDocuments + diagnostics.pendingEvents;

  return (
    <div className="settings-page">
      <header className="settings-page__header">
        <p>Workspace preferences</p>
        <h2>Settings</h2>
        <span>Customize the interface and choose practical defaults for documents and tasks.</span>
      </header>

      <Card aria-labelledby="settings-general">
        <SectionHeader
          headingId="settings-general"
          eyebrow="General"
          title="Workspace behavior"
          description="Choose where the app opens and how the supporting panel behaves."
        />
        <SettingRow title="Startup page" description="The first page shown after the workspace opens.">
          <select
            value={settings.workspace.startupPage}
            disabled={saving}
            onChange={(event) => void applySettings({ workspace: { startupPage: event.target.value as StartupPagePreference } })}
          >
            {['dashboard','tasks','documents','calendar','mail','settings'].map((value) => (
              <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow title="Show right sidebar" description="Display the contextual workspace panel.">
          <Toggle checked={settings.sidebar.rightSidebarVisible} disabled={saving} label={settings.sidebar.rightSidebarVisible ? "Visible" : "Hidden"} onChange={(value) => void applySettings({ sidebar: { rightSidebarVisible: value } })} />
        </SettingRow>
        <SettingRow title="Default sidebar content" description="The collection shown when the sidebar opens.">
          <select value={settings.sidebar.rightSidebarDefault} disabled={saving} onChange={(event) => void applySettings({ sidebar: { rightSidebarDefault: event.target.value as SidebarContentPreference } })}>
            {RIGHT_SIDEBAR_MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </SettingRow>
        <SettingRow title="Remember open state" description="Restore the sidebar's previous expanded or collapsed state.">
          <Toggle checked={settings.sidebar.rememberOpenState} disabled={saving} label={settings.sidebar.rememberOpenState ? "Remember" : "Use default"} onChange={(value) => void applySettings({ sidebar: { rememberOpenState: value } })} />
        </SettingRow>
      </Card>

      <Card aria-labelledby="settings-appearance">
        <SectionHeader headingId="settings-appearance" eyebrow="Appearance" title="Look and feel" description="Adjust color, scale, spacing, contrast, and motion." />
        <SettingRow title="Theme" description="Use dark, light, or the operating system theme.">
          <select value={settings.appearance.theme} disabled={saving} onChange={(event) => void applySettings({ appearance: { theme: event.target.value as ThemePreference } })}>
            <option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option>
          </select>
        </SettingRow>
        <SettingRow title="Accent" description="Choose the workspace highlight color.">
          <select value={settings.appearance.accent} disabled={saving} onChange={(event) => void applySettings({ appearance: { accent: event.target.value as AccentPreference } })}>
            <option value="violet">Violet</option><option value="blue">Blue</option><option value="teal">Teal</option><option value="rose">Rose</option><option value="amber">Amber</option>
          </select>
        </SettingRow>
        <SettingRow title="Interface size" description="Scale text and controls throughout the application.">
          <select value={settings.appearance.fontSize} disabled={saving} onChange={(event) => void applySettings({ appearance: { fontSize: event.target.value as FontSizePreference } })}>
            <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option><option value="extra-large">Extra large</option>
          </select>
        </SettingRow>
        <SettingRow title="Density" description="Use tighter or more comfortable spacing.">
          <select value={settings.appearance.density} disabled={saving} onChange={(event) => void applySettings({ appearance: { density: event.target.value as UiDensityPreference } })}>
            <option value="compact">Compact</option><option value="comfortable">Comfortable</option>
          </select>
        </SettingRow>
        <SettingRow title="High contrast" description="Increase border and focus visibility.">
          <Toggle checked={settings.appearance.highContrast} disabled={saving} label={settings.appearance.highContrast ? "Enabled" : "Disabled"} onChange={(value) => void applySettings({ appearance: { highContrast: value } })} />
        </SettingRow>
        <SettingRow title="Animations" description="Enable transitions and motion effects.">
          <Toggle checked={settings.appearance.animationsEnabled} disabled={saving} label={settings.appearance.animationsEnabled ? "Enabled" : "Disabled"} onChange={(value) => void applySettings({ appearance: { animationsEnabled: value } })} />
        </SettingRow>
      </Card>

      <Card aria-labelledby="settings-editor">
        <SectionHeader headingId="settings-editor" eyebrow="Editor" title="Document editing" description="These preferences are applied directly to the document editor." />
        <SettingRow title="Autosave delay" description="How long the editor waits after your last change before saving.">
          <select value={settings.editor.autosaveInterval} disabled={saving} onChange={(event) => void applySettings({ editor: { autosaveInterval: Number(event.target.value) as 1000 | 3000 | 5000 | 10000 } })}>
            <option value={1000}>1 second</option><option value={3000}>3 seconds</option><option value={5000}>5 seconds</option><option value={10000}>10 seconds</option>
          </select>
        </SettingRow>
        <SettingRow title="Editor font" description="Choose the writing surface's font family.">
          <select value={settings.editor.font} disabled={saving} onChange={(event) => void applySettings({ editor: { font: event.target.value as EditorFontPreference } })}>
            <option value="system">System</option><option value="serif">Serif</option><option value="monospace">Monospace</option>
          </select>
        </SettingRow>
        <SettingRow title="Default font size" description="Set the base size of document content.">
          <select value={settings.editor.defaultFontSize} disabled={saving} onChange={(event) => void applySettings({ editor: { defaultFontSize: Number(event.target.value) as 14 | 16 | 18 | 20 } })}>
            <option value={14}>14 px</option><option value={16}>16 px</option><option value={18}>18 px</option><option value={20}>20 px</option>
          </select>
        </SettingRow>
        <SettingRow title="Line spacing" description="Set the distance between lines of document text.">
          <select value={settings.editor.lineSpacing} disabled={saving} onChange={(event) => void applySettings({ editor: { lineSpacing: event.target.value as EditorLineSpacingPreference } })}>
            <option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="relaxed">Relaxed</option>
          </select>
        </SettingRow>
        <SettingRow title="Tab size" description="Set the visual width of tab characters.">
          <select value={settings.editor.tabSize} disabled={saving} onChange={(event) => void applySettings({ editor: { tabSize: Number(event.target.value) as 2 | 4 | 8 } })}>
            <option value={2}>2 spaces</option><option value={4}>4 spaces</option><option value={8}>8 spaces</option>
          </select>
        </SettingRow>
      </Card>

      <Card aria-labelledby="settings-tasks">
        <SectionHeader headingId="settings-tasks" eyebrow="Tasks" title="Task defaults" description="New tasks and completed work follow these preferences." />
        <SettingRow title="Default priority" description="The priority assigned to every new task.">
          <select value={settings.tasks.defaultPriority} disabled={saving} onChange={(event) => void applySettings({ tasks: { defaultPriority: event.target.value as TaskDefaultPriority } })}>
            <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
        </SettingRow>
        <SettingRow title="Default due date" description="Optionally assign today or tomorrow to new tasks.">
          <select value={settings.tasks.defaultDueDate} disabled={saving} onChange={(event) => void applySettings({ tasks: { defaultDueDate: event.target.value as TaskDefaultDueDate } })}>
            <option value="none">No date</option><option value="today">Today</option><option value="tomorrow">Tomorrow</option>
          </select>
        </SettingRow>
        <SettingRow title="Completed tasks" description="Show completed tasks on the All board or only in Completed.">
          <select value={settings.tasks.completedTaskBehavior} disabled={saving} onChange={(event) => void applySettings({ tasks: { completedTaskBehavior: event.target.value as CompletedTaskBehavior } })}>
            <option value="show">Show on All</option><option value="hide">Hide from All</option>
          </select>
        </SettingRow>
        <SettingRow title="Archive behavior" description="Automatically archive tasks when they are completed.">
          <select value={settings.tasks.archiveBehavior} disabled={saving} onChange={(event) => void applySettings({ tasks: { archiveBehavior: event.target.value as TaskArchiveBehavior } })}>
            <option value="manual">Manual</option><option value="automatic">Automatic</option>
          </select>
        </SettingRow>
      </Card>

      <Card aria-labelledby="settings-shortcuts">
        <SectionHeader
          headingId="settings-shortcuts"
          eyebrow="Keyboard"
          title="Keyboard shortcuts"
          description="Review every global and page-specific shortcut in one searchable dialog."
          actions={<Button onClick={openShortcutReference}>View shortcuts</Button>}
        />
      </Card>

      <Card aria-labelledby="settings-data">
        <SectionHeader
          headingId="settings-data"
          eyebrow="Data"
          title="Local workspace"
          description="Export a portable copy of local workspace data or restore it on this device. Cloud credentials are never included."
          actions={
            <div className="settings-data-actions">
              <Button disabled={backupAction !== null} onClick={() => void handleExportBackup()}>
                {backupAction === "export" ? "Exporting…" : "Export backup"}
              </Button>
              <Button disabled={backupAction !== null} onClick={() => backupFileInputRef.current?.click()}>
                {backupAction === "restore" ? "Restoring…" : "Import backup"}
              </Button>
              <Button disabled={diagnostics.loading} onClick={() => void loadDiagnostics()}>
                {diagnostics.loading ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
          }
        />
        <input
          ref={backupFileInputRef}
          className="settings-file-input"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void handleRestoreBackup(event)}
        />
        {diagnostics.error && <p className="settings-error" role="alert">{diagnostics.error}</p>}
        <div className="settings-diagnostic-grid">
          <Diagnostic label="Tasks" value={diagnostics.tasks} />
          <Diagnostic label="Documents" value={diagnostics.documents} />
          <Diagnostic label="Events" value={diagnostics.events} />
          <Diagnostic label="Pending sync" value={totalPending} />
        </div>
        <div className="settings-backup-status" aria-label="Backup history">
          <span>Last export: {formatBackupTimestamp(lastBackupAt)}</span>
          <span>Last restore: {formatBackupTimestamp(lastRestoreAt)}</span>
        </div>
      </Card>

      <Card aria-labelledby="settings-about">
        <SectionHeader headingId="settings-about" eyebrow="About" title="Pioneer Work Suite" description={`Version ${APP_VERSION} · ${getWorkspaceName()} · ${hasCloudSession() ? "Cloud connected" : "Local only"}`} />
        <SettingRow title="Developer tools" description="Show diagnostics and the local application console.">
          <Toggle checked={settings.developer.developerToolsVisible} disabled={saving} label={settings.developer.developerToolsVisible ? "Visible" : "Hidden"} onChange={(value) => void applySettings({ developer: { developerToolsVisible: value } })} />
        </SettingRow>
        <div className="settings-reset">
          <div><strong>Reset preferences</strong><span>Restore all interface, editor, and task defaults.</span></div>
          <Button tone="danger" disabled={resetting} onClick={() => void handleReset()}>{resetting ? "Resetting…" : "Reset settings"}</Button>
        </div>
      </Card>

      {settings.developer.developerToolsVisible && <DeveloperConsole />}
      {confirmationDialog}
    </div>
  );
};

const Diagnostic: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="settings-diagnostic"><span>{label}</span><strong>{value}</strong></div>
);

function formatBackupTimestamp(value: string | null): string {
  if (!value) return "Not yet";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "Unknown" : timestamp.toLocaleString();
}

export default SettingsPage;
