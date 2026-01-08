// apps/web/src/components/UpdateBanner.tsx
import React, { useEffect, useState } from "react";

type UpdateState =
  | { kind: "hidden" }
  | { kind: "checking" }
  | { kind: "available"; version?: string }
  | { kind: "error"; message: string };

const isTauriRuntime =
  typeof window !== "undefined" && !!(window as any).__TAURI__;

const isDev =
  typeof import.meta !== "undefined" && (import.meta as any).env?.DEV;

const UpdateBanner: React.FC = () => {
  const [state, setState] = useState<UpdateState>({ kind: "hidden" });

  useEffect(() => {
    if (!isTauriRuntime) {
      // Pure web build – never show anything.
      return;
    }

    let cancelled = false;

    async function run() {
      try {
        setState({ kind: "checking" });

        // Tauri built-in updater API
        const { checkUpdate } = await import("@tauri-apps/api/updater");

        const { shouldUpdate, manifest } = await checkUpdate();

        if (cancelled) return;

        if (!shouldUpdate) {
          // No update available – stay hidden to keep UI clean.
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

        // In dev, surface a visible error so you can verify wiring.
        if (isDev) {
          setState({
            kind: "error",
            message:
              err?.message ||
              "Updater is disabled or not configured. Check tauri.conf.json.",
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

  if (!isTauriRuntime) {
    // Browser: no banner
    return null;
  }

  if (state.kind === "hidden") return null;
  if (state.kind === "error" && !isDev) return null;

  async function handleInstall() {
    try {
      const { installUpdate } = await import("@tauri-apps/api/updater");
      await installUpdate();
      // Tauri will restart the app after this resolves.
    } catch (err) {
      console.error("[UpdateBanner] install error:", err);
    }
  }

  return (
    <div
      style={{
        width: "100%",
        padding: "6px 12px",
        boxSizing: "border-box",
        background:
          state.kind === "error"
            ? "rgba(255,118,118,0.2)"
            : "linear-gradient(135deg, #3f64ff, #7f3dff)",
        borderBottom: "1px solid rgba(255,255,255,0.2)",
        color: "#ffffff",
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        zIndex: 50,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {state.kind === "checking" && <span>Checking for updates…</span>}

        {state.kind === "available" && (
          <span>
            A new version
            {state.version ? ` (${state.version})` : ""} is available.
          </span>
        )}

        {state.kind === "error" && (
          <>
            <span>Updater error (dev only).</span>
            <span style={{ opacity: 0.8 }}>{state.message}</span>
          </>
        )}
      </div>

      {state.kind === "available" && (
        <button
          type="button"
          onClick={handleInstall}
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            border: "none",
            background: "rgba(0,0,0,0.25)",
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

      {state.kind === "checking" && (
        <span style={{ fontSize: 11, opacity: 0.8 }}>…</span>
      )}

      {state.kind === "error" && (
        <button
          type="button"
          onClick={() => setState({ kind: "hidden" })}
          style={{
            padding: "2px 6px",
            borderRadius: 999,
            border: "none",
            background: "rgba(0,0,0,0.3)",
            color: "#ffffff",
            cursor: "pointer",
            fontSize: 10,
          }}
        >
          Hide
        </button>
      )}
    </div>
  );
};

export default UpdateBanner;