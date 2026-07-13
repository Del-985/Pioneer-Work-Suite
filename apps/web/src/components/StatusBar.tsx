// apps/web/src/components/StatusBar.tsx

import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  SyncPhase,
  SyncSnapshot,
  getSyncSnapshot,
  subscribeToSyncStatus,
  syncAllNow,
} from "../api/sync";
import { APP_VERSION } from "../config/appMetadata";

import "../styles/status-bar.css";

const PHASE_LABELS: Record<SyncPhase, string> = {
  "local-only": "Local only",
  offline: "Offline",
  "reconnect-required": "Reconnect required",
  idle: "Cloud synced",
  pending: "Sync pending",
  syncing: "Syncing",
  error: "Sync error",
};

function formatPageName(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean)[0] || "dashboard";

  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatLastSync(value: string | null): string {
  if (!value) {
    return "Not synced this session";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Last sync unavailable";
  }

  return `Last sync ${date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

const StatusBar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [sync, setSync] = useState<SyncSnapshot>(getSyncSnapshot);

  useEffect(() => subscribeToSyncStatus(setSync), []);

  const pageName = useMemo(
    () => formatPageName(location.pathname),
    [location.pathname]
  );

  const canRequestSync =
    sync.cloudConnected &&
    sync.online &&
    sync.phase !== "syncing" &&
    sync.phase !== "reconnect-required";

  const syncTitle = sync.errorMessage
    ? sync.errorMessage
    : sync.pendingTotal > 0
      ? `${sync.pendingTotal} local change${
          sync.pendingTotal === 1 ? "" : "s"
        } waiting to sync.`
      : formatLastSync(sync.lastSuccessfulSyncAt);

  return (
    <footer className="pioneer-status-bar" aria-label="Application status bar">
      <div className="pioneer-status-bar__group">
        <span className="pioneer-status-bar__item">v{APP_VERSION}</span>
        <span className="pioneer-status-bar__separator" aria-hidden="true" />
        <span className="pioneer-status-bar__item">{pageName}</span>
      </div>

      <div className="pioneer-status-bar__group">
        {sync.phase === "reconnect-required" ? (
          <button
            type="button"
            className="pioneer-status-bar__button"
            onClick={() => navigate("/login")}
            title={syncTitle}
          >
            <span
              className={`pioneer-status-dot pioneer-status-dot--${sync.phase}`}
              aria-hidden="true"
            />
            Reconnect cloud
          </button>
        ) : (
          <button
            type="button"
            className="pioneer-status-bar__button"
            onClick={() => void syncAllNow()}
            disabled={!canRequestSync}
            title={syncTitle}
            aria-live="polite"
          >
            <span
              className={`pioneer-status-dot pioneer-status-dot--${sync.phase}`}
              aria-hidden="true"
            />
            {PHASE_LABELS[sync.phase]}
            {sync.pendingTotal > 0 ? ` (${sync.pendingTotal})` : ""}
          </button>
        )}
      </div>
    </footer>
  );
};

export default StatusBar;

