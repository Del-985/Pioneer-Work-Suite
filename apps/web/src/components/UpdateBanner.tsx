// apps/web/src/components/UpdateBanner.tsx
import React, { useState } from "react";

const isTauriRuntime =
  typeof window !== "undefined" &&
  Boolean((window as any).__TAURI_IPC__);

/**
 * Small footer banner that shows a "Check for updates" control
 * when running inside the desktop (Tauri) client.
 */
const UpdateBanner: React.FC = () => {
  const [status, setStatus] = useState<
    "idle" | "checking" | "upToDate" | "downloading" | "installed" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);

  if (!isTauriRuntime) {
    // In the browser, this stays hidden
    return null;
  }

  async function handleCheck() {
    try {
      setStatus("checking");
      setMessage(null);

      // Lazy-load Tauri updater so the browser build stays happy
      const {
        checkUpdate,
        installUpdate,
        onUpdaterEvent,
      } = await import("@tauri-apps/api/updater");

      const unlisten = await onUpdaterEvent((event) => {
        // event.status is usually: 'PENDING', 'DOWNLOADING', 'DONE', 'ERROR'
        if (event.status === "DOWNLOADING") {
          setStatus("downloading");
          setMessage("Downloading update…");
        } else if (event.status === "DONE") {
          setStatus("installed");
          setMessage("Update downloaded. Restart to apply.");
        } else if (event.status === "ERROR") {
          setStatus("error");
          setMessage("Updater error.");
        }
      });

      const { shouldUpdate, manifest } = await checkUpdate();

      if (!shouldUpdate) {
        setStatus("upToDate");
        setMessage("You’re on the latest version.");
        await unlisten();
        return;
      }

      const version = manifest?.version ?? "";
      setMessage(
        version
          ? `Updating to version ${version}…`
          : "Updating to latest version…"
      );

      await installUpdate();
      await unlisten();

      setStatus("installed");
      setMessage("Update installed. Restart the app to finish.");
    } catch (err) {
      console.error("Updater error:", err);
      setStatus("error");
      setMessage("Unable to check for updates.");
    }
  }

  const buttonLabel =
    status === "checking"
      ? "Checking…"
      : status === "downloading"
      ? "Updating…"
      : "Check for updates";

  const disabled = status === "checking" || status === "downloading";

  return (
    <div
      style={{
        marginTop: 10,
        padding: "6px 10px",
        borderRadius: 10,
        border: "1px solid rgba(255, 255, 255, 0.08)",
        background: "#050713",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 11,
        color: "#9da2c8",
      }}
    >
      <span>Desktop client</span>
      <button
        type="button"
        onClick={handleCheck}
        disabled={disabled}
        style={{
          padding: "4px 10px",
          borderRadius: 999,
          border: "none",
          background: disabled
            ? "rgba(127, 61, 255, 0.4)"
            : "linear-gradient(135deg, #3f64ff, #7f3dff)",
          color: "#ffffff",
          fontSize: 11,
          cursor: disabled ? "default" : "pointer",
        }}
      >
        {buttonLabel}
      </button>
      {message && (
        <span style={{ fontSize: 11, color: "#c5c9ff" }}>{message}</span>
      )}
    </div>
  );
};

export default UpdateBanner;