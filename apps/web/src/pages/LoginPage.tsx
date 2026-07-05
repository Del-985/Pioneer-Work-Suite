// apps/web/src/pages/LoginPage.tsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../api/auth";
import {
  connectCloudSession,
  createOrUpdateLocalWorkspace,
  getLocalWorkspaceName,
} from "../api/session";

const APP_VERSION = import.meta.env.VITE_APP_VERSION || "0.0.0";

const LoginPage: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localName, setLocalName] = useState(getLocalWorkspaceName());

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function continueLocally() {
    createOrUpdateLocalWorkspace(localName);
    navigate("/dashboard", { replace: true });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!email.trim() || !password) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { user, token } = await login(email.trim(), password);

      connectCloudSession(user, token);
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      console.error("Login error:", err);

      const message =
        err?.response?.data?.error ||
        err?.message ||
        "Unable to connect to your cloud account.";

      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 420,
        width: "100%",
        position: "relative",
        minHeight: 520,
      }}
    >
      <h2 style={{ marginTop: 0 }}>Open your workspace</h2>

      <p style={{ fontSize: 13, color: "#9da2c8" }}>
        Pioneer works on this device without a server. Cloud login is optional
        and only enables syncing.
      </p>

      <section
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 10,
          border: "1px solid rgba(127,61,255,0.36)",
          background: "rgba(127,61,255,0.08)",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14 }}>Continue locally</h3>

        <p
          style={{
            margin: "6px 0 10px",
            fontSize: 12,
            color: "#b8bce0",
          }}
        >
          This creates or opens the local workspace stored on this device.
        </p>

        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <span style={{ fontSize: 13 }}>Workspace name</span>

          <input
            type="text"
            value={localName}
            onChange={(event) => setLocalName(event.target.value)}
            placeholder="Your name"
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "#05070a",
              color: "#f5f5f5",
            }}
          />
        </label>

        <button
          type="button"
          onClick={continueLocally}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "8px 0",
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            background: "linear-gradient(135deg, #3f64ff, #7f3dff)",
            color: "#ffffff",
            fontWeight: 500,
            fontSize: 14,
          }}
        >
          Open local workspace
        </button>
      </section>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          margin: "18px 0",
          color: "#6f7598",
          fontSize: 12,
        }}
      >
        <span
          style={{
            height: 1,
            flex: 1,
            background: "rgba(255,255,255,0.12)",
          }}
        />

        or connect cloud

        <span
          style={{
            height: 1,
            flex: 1,
            background: "rgba(255,255,255,0.12)",
          }}
        />
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <span style={{ fontSize: 13 }}>Email</span>

          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "#05070a",
              color: "#f5f5f5",
            }}
          />
        </label>

        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <span style={{ fontSize: 13 }}>Password</span>

          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "#05070a",
              color: "#f5f5f5",
            }}
          />
        </label>

        {error && (
          <p style={{ color: "#ff7b88", fontSize: 13, margin: "2px 0 0" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            marginTop: 8,
            padding: "8px 0",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.16)",
            cursor: isSubmitting ? "default" : "pointer",
            background: "#10142a",
            color: "#ffffff",
            fontWeight: 500,
            fontSize: 14,
          }}
        >
          {isSubmitting ? "Connecting..." : "Connect cloud account"}
        </button>
      </form>

      <div style={{ marginTop: 10, fontSize: 13 }}>
        <span>Need a cloud account? </span>
        <Link to="/register">Register</Link>
      </div>

      <span
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          color: "#6f7598",
          fontSize: 11,
          userSelect: "none",
        }}
      >
        v{APP_VERSION}
      </span>
    </div>
  );
};

export default LoginPage;
