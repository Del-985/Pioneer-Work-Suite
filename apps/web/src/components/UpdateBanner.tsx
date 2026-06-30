// apps/web/src/components/UpdateBanner.tsx
import React, { useEffect, useState } from "react";

type UpdateState =
  | { kind: "hidden" }
  | { kind: "checking" }
  | { kind: "available"; version?: string }
  | { kind: "error"; message: string };

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as any).__TAURI__;
}

const isDev =
  typeof import.meta !== "undefined" && (import.meta as any).env?.DEV;

const UpdateBanner: React.FC = () => {
  const [state, setState] = useState<UpdateState>({ kind: "hidden" });

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let cancelled = false;

    async function run() {
      try {
        setState({ kind: "checking" });

        const { checkUpdate } = await import("@tauri-apps/api/updater");
        const { shouldUpdate, manifest } = await checkUpdate();

        if (cancelled) return;

        if (!shouldUpdate) {
          setState({ kind: "hidden" });
          return;
        }

        setState({
          kind: "available",
          version: manifest?.version,
        });
      } catch (err: any) {
        console.error("[UpdateBanner] updater error:", err);

        if (cancelled) return;

        if (isDev) {
          setState({
            kind: "error",
            message:
              err?.message ||
              "Updater is unavailable or not configured.",
          });
        } else {
          setState({ kind: "hidden" });
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!isTauriRuntime()) return null;
  if (state.kind === "hidden") return null;
  if (state.kind === "error" && !isDev) return null;

  async function handleInstall() {
    try {
      const { installUpdate } = await import("@tauri-apps/api/updater");
      await installUpdate();
    } catch (err) {
      console.error("[UpdateBanner] install error:", err);
    }
  }

  let message = "Checking for updates…";

  if (state.kind === "available") {
    message = `Update available${
      state.version ? ` — v${state.version}` : ""
    }`;
  }

  if (state.kind === "error") {
    message = `Updater error: ${state.message}`;
  }

  const isError = state.kind === "error";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 38,
        minHeight: 38,
        maxHeight: 38,
        boxSizing: "border-box",
        padding: "0 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        overflow: "hidden",
        zIndex: 9999,
        background: isError
          ? "rgba(140, 45, 55, 0.96)"
          : "linear-gradient(135deg, #3f64ff, #7f3dff)",
        borderBottom: "1px solid rgba(255,255,255,0.18)",
        boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
        color: "#ffffff",
        fontSize: 12,
      }}
    >
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {message}
      </span>

      {state.kind === "available" && (
        <button
          type="button"
          onClick={handleInstall}
          style={{
            flexShrink: 0,
            padding: "5px 10px",
            borderRadius: 999,
            border: "none",
            background: "rgba(0,0,0,0.3)",
            color: "#ffffff",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          Restart to update
        </button>
      )}

      {state.kind === "error" && (
        <button
          type="button"
          onClick={() => setState({ kind: "hidden" })}
          style={{
            flexShrink: 0,
            padding: "4px 8px",
            borderRadius: 999,
            border: "none",
            background: "rgba(0,0,0,0.28)",
            color: "#ffffff",
            cursor: "pointer",
            fontSize: 11,
          }}
        >
          Hide
        </button>
      )}
    </div>
  );
};

export default UpdateBanner;
