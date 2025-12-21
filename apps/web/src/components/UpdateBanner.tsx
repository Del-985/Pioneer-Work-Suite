import React, { useEffect, useState } from "react";

/**
 * Runtime check so we don't touch Tauri APIs in the plain web build.
 */
function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as any).__TAURI__ !== "undefined"
  );
}

type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version: string | null }
  | { status: "updating" }
  | { status: "error"; message: string };

const UpdateBanner: React.FC = () => {
  const [state, setState] = useState<UpdateState>({ status: "idle" });

  useEffect(() => {
    if (!isTauri()) return; // Do nothing in the browser

    let cancelled = false;

    async function checkForUpdate() {
      try {
        setState({ status: "checking" });

        // Lazy-load the updater API only when we know we're in Tauri
        const { checkUpdate } = await import("@tauri-apps/api/updater");

        const result = await checkUpdate();
        if (cancelled) return;

        if (result.shouldUpdate) {
          setState({
            status: "available",
            version: result.manifest?.version ?? null,
          });
        } else {
          setState({ status: "idle" });
        }
      } catch (err) {
        console.error("Update check failed:", err);
        if (!cancelled) {
          setState({
            status: "error",
            message: "Update check failed",
          });
        }
      }
    }

    // Initial check on startup
    void checkForUpdate();

    // Optional: re-check every 4 hours
    const handle = window.setInterval(checkForUpdate, 4 * 60 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, []);

  // In a browser build, render nothing.
  if (!isTauri()) return null;

  // We keep the banner minimal: only show when available or updating or error.
  if (state.status === "idle" || state.status === "checking") {
    return null;
  }

  async function handleInstall() {
    if (!isTauri()) return;

    try {
      const { installUpdate } = await import("@tauri-apps/api/updater");
      setState({ status: "updating" });
      await installUpdate();
      // Tauri will typically restart the app after install.
    } catch (err) {
      console.error("Update install failed:", err);
      setState({
        status: "error",
        message: "Update failed. Try restarting later.",
      });
    }
  }

  const label =
    state.status === "available"
      ? state.version
        ? `A new version (${state.version}) is available`
        : "A new version is available"
      : state.status === "updating"
      ? "Installing update…"
      : state.message ?? "Update issue";

  const isUpdating = state.status === "updating";

  return (
    <div
      style={{
        marginBottom: 8,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.16)",
        background:
          state.status === "error"
            ? "rgba(255,118,118,0.18)"
            : "linear-gradient(90deg, rgba(63,100,255,0.35), rgba(127,61,255,0.45))",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        fontSize: 11,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ fontSize: 14 }}>⬆️</span>
        <span>{label}</span>
      </div>

      {state.status === "available" && (
        <button
          type="button"
          onClick={handleInstall}
          disabled={isUpdating}
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            border: "none",
            fontSize: 11,
            cursor: isUpdating ? "default" : "pointer",
            background: "#ffffff",
            color: "#141729",
          }}
        >
          Install now
        </button>
      )}
    </div>
  );
};

export default UpdateBanner;