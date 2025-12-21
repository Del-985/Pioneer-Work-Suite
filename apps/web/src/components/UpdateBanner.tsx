// apps/web/src/components/UpdateBanner.tsx
import React, { useEffect, useState } from "react";

type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "up-to-date"
  | "error";

const isTauriRuntime: boolean = (() => {
  if (typeof window === "undefined") return false;
  const w = window as any;
  // Tauri 1.x markers
  return Boolean(w.__TAURI__) || Boolean(w.__TAURI_IPC__);
})();

const UpdateBanner: React.FC = () => {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriRuntime) {
      // Running on GitHub Pages / normal browser: do nothing.
      return;
    }

    let cancelled = false;
    let unlisten: null | (() => void) = null;

    (async () => {
      try {
        const [{ checkUpdate, onUpdaterEvent }] = await Promise.all([
          import("@tauri-apps/api/updater"),
        ]);

        if (cancelled) return;

        setStatus("checking");

        const result = await checkUpdate().catch((err) => {
          console.error("[Updater] checkUpdate failed:", err);
          if (!cancelled) {
            setStatus("error");
            setMessage("Unable to check for updates.");
          }
          return null;
        });

        if (!result || cancelled) return;

        if (!result.shouldUpdate) {
          setStatus("up-to-date");
          return;
        }

        setStatus("available");

        unlisten = await onUpdaterEvent((evt) => {
          if (cancelled) return;
          if (evt.status === "DOWNLOADING") {
            setStatus("downloading");
          } else if (evt.status === "ERROR") {
            console.error("[Updater] event error:", evt.error);
            setStatus("error");
            setMessage("Update failed.");
          }
        });
      } catch (err) {
        console.error("[Updater] init failed:", err);
        if (!cancelled) {
          setStatus("error");
          setMessage("Updater not available.");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (unlisten) {
        try {
          unlisten();
        } catch (e) {
          console.warn("[Updater] unlisten failed:", e);
        }
      }
    };
  }, []);

  async function handleInstall() {
    if (!isTauriRuntime) return;

    try {
      setStatus("downloading");
      setMessage(null);

      const [{ installUpdate }, { relaunch }] = await Promise.all([
        import("@tauri-apps/api/updater"),
        import("@tauri-apps/api/process"),
      ]);

      await installUpdate();
      await relaunch();
    } catch (err) {
      console.error("[Updater] install/relaunch failed:", err);
      setStatus("error");
      setMessage("Could not install update.");
    }
  }

  // No banner at all in non-Tauri environments
  if (!isTauriRuntime) return null;

  // Only show when something interesting is happening
  if (status !== "available" && status !== "downloading" && status !== "error") {
    return null;
  }

  const text =
    status === "available"
      ? "A new version of Pioneer Work Suite is available."
      : status === "downloading"
      ? "Downloading update…"
      : message || "There was a problem checking for updates.";

  const showInstallButton = status === "available";

  return (
    <div
      style={{
        width: "100%",
        boxSizing: "border-box",
        padding: "6px 10px",
        marginBottom: 8,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.14)",
        background:
          status === "error"
            ? "linear-gradient(90deg, #ff6b7a, #7f3dff)"
            : "linear-gradient(90deg, #3f64ff, #7f3dff)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        fontSize: 12,
        color: "#ffffff",
      }}
    >
      <span>{text}</span>
      {showInstallButton && (
        <button
          type="button"
          onClick={handleInstall}
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            border: "none",
            background: "rgba(5,7,19,0.9)",
            color: "#ffffff",
            fontSize: 11,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Install &amp; restart
        </button>
      )}
    </div>
  );
};

export default UpdateBanner;