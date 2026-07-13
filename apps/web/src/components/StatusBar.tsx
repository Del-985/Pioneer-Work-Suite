// apps/web/src/components/StatusBar.tsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  SyncPhase,
  SyncSnapshot,
  getSyncSnapshot,
  subscribeToSyncStatus,
  syncAllNow,
} from "../api/sync";
import { APP_VERSION } from "../config/appMetadata";
import {
  useRegisteredStatusBarItems,
} from "../hooks/useStatusBarItems";
import { toast } from "../toasts/toastStore";

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
  const contextItems = useRegisteredStatusBarItems();

  const [sync, setSync] = useState<SyncSnapshot>(getSyncSnapshot);
  const previousSyncRef = useRef<SyncSnapshot>(getSyncSnapshot());

  useEffect(
    () =>
      subscribeToSyncStatus((next) => {
        const previous = previousSyncRef.current;
        setSync(next);

        if (next.phase !== previous.phase) {
          if (next.phase === "error") {
            toast.error("Cloud synchronization failed", {
              description: next.errorMessage ?? "Local changes remain safe.",
              action: {
                label: "Retry",
                run: async () => {
                  await syncAllNow();
                },
              },
            });
          } else if (next.phase === "reconnect-required") {
            toast.warning("Cloud reconnection required", {
              description: "Reconnect your account to resume synchronization.",
            });
          } else if (next.phase === "offline") {
            toast.info("Working offline", {
              description: "Changes will stay local until connectivity returns.",
            });
          } else if (
            next.phase === "idle" &&
            previous.phase === "syncing" &&
            previous.pendingTotal > 0
          ) {
            toast.success("Cloud synchronization complete");
          }
        }

        previousSyncRef.current = next;
      }),
    []
  );

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
      <span className="sr-only" role="status" aria-live="polite">
        {PHASE_LABELS[sync.phase]}
        {sync.pendingTotal > 0 ? `, ${sync.pendingTotal} changes pending` : ""}
      </span>
      <div className="pioneer-status-bar__group">
        <span className="pioneer-status-bar__item">v{APP_VERSION}</span>
        <span className="pioneer-status-bar__separator" aria-hidden="true" />
        <span className="pioneer-status-bar__item">{pageName}</span>
      </div>

      {contextItems.length > 0 && (
        <div
          className="pioneer-status-bar__group pioneer-status-bar__context"
          aria-label="Current page status"
        >
          {contextItems.map((item) => (
            <span
              key={item.id}
              className={`pioneer-status-bar__item tone-${
                item.tone ?? "neutral"
              }`}
              title={item.title}
            >
              {item.label}
            </span>
          ))}
        </div>
      )}

      <div className="pioneer-status-bar__group">
        {sync.lastSuccessfulSyncAt && (
          <span
            className="pioneer-status-bar__item pioneer-status-bar__last-sync"
            title={formatLastSync(sync.lastSuccessfulSyncAt)}
          >
            {formatLastSync(sync.lastSuccessfulSyncAt)}
          </span>
        )}
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
