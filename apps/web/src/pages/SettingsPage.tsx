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
import { hasCloudSession, getWorkspaceName } from "../api/session";

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

const APP_VERSION = import.meta.env.VITE_APP_VERSION || "0.0.0";

function isIndexedDbAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function makeInitialState(): DiagnosticState {
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

const cardStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "#050713",
  padding: 14,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#8f97c4",
  marginBottom: 4,
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

const SettingsPage: React.FC = () => {
  const [diagnostics, setDiagnostics] = useState<DiagnosticState>(
    makeInitialState
  );

  async function loadDiagnostics() {
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
        Manage local workspace settings, storage diagnostics, and developer
        tools.
      </p>

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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
            Backend/cloud features are expected to return in 0.2.0.
          </p>
        </section>

        <section style={cardStyle}>
          <div style={labelStyle}>Storage engine</div>
          <div style={valueStyle}>
            {diagnostics.indexedDbAvailable ? "IndexedDB" : "Unavailable"}
          </div>
          <p style={{ ...smallTextStyle, marginBottom: 0 }}>
            Local app data should persist across restarts and updates.
          </p>
        </section>

        <section style={cardStyle}>
          <div style={labelStyle}>App version</div>
          <div style={valueStyle}>v{diagnostics.appVersion}</div>
          <p style={{ ...smallTextStyle, marginBottom: 0 }}>
            Version is read from the centralized app version source.
          </p>
        </section>
      </div>

      <section style={{ ...cardStyle, marginTop: 18 }}>
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
            <h3 style={{ margin: 0, fontSize: 16 }}>Developer tools</h3>
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
              padding: "7px 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "transparent",
              color: "#f5f5f5",
              fontSize: 12,
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
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
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

        <p style={{ ...smallTextStyle, marginTop: 12, marginBottom: 0 }}>
          Destructive tools like wiping storage, forcing migrations, importing
          backups, and clearing sync queues should be added behind confirmations
          later. This version is intentionally read-only.
        </p>
      </section>
    </div>
  );
};

export default SettingsPage;