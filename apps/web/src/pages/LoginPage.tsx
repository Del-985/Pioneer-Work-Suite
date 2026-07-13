
// apps/web/src/pages/LoginPage.tsx

import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { login } from "../api/auth";
import {
  connectCloudSession,
  createOrUpdateLocalWorkspace,
  getLocalWorkspaceName,
} from "../api/session";
import { getConfiguredStartupPath } from "../api/settings";
import { APP_VERSION } from "../config/appMetadata";
import { getApiErrorMessage } from "../utils/apiErrors";

const LoginPage: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localName, setLocalName] = useState(
    getLocalWorkspaceName()
  );

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [error, setError] = useState<string | null>(
    null
  );

  function openConfiguredStartupPage(): void {
    navigate(getConfiguredStartupPath(), {
      replace: true,
    });
  }

  function continueLocally(): void {
    createOrUpdateLocalWorkspace(localName);
    openConfiguredStartupPage();
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();

    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { user, token } = await login(
        normalizedEmail,
        password
      );

      connectCloudSession(user, token);
      openConfiguredStartupPage();
    } catch (error: unknown) {
      console.error("Login error:", error);

      setError(
        getApiErrorMessage(
          error,
          "Unable to connect to your cloud account."
        )
      );
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
      <h2 style={{ marginTop: 0 }}>
        Open your workspace
      </h2>

      <p
        style={{
          fontSize: 13,
          color: "var(--text-muted)",
        }}
      >
        Pioneer works on this device without a
        server. Cloud login is optional and only
        enables syncing.
      </p>

      <section
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 10,
          border:
            "1px solid var(--accent-border, rgba(127, 61, 255, 0.36))",
          background:
            "var(--accent-soft, rgba(127, 61, 255, 0.08))",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 14,
          }}
        >
          Continue locally
        </h3>

        <p
          style={{
            margin: "6px 0 10px",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          This creates or opens the local workspace
          stored on this device.
        </p>

        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <span style={{ fontSize: 13 }}>
            Workspace name
          </span>

          <input
            type="text"
            value={localName}
            onChange={(event) =>
              setLocalName(event.target.value)
            }
            placeholder="Your name"
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border:
                "1px solid var(--border-control, var(--border-subtle))",
              background:
                "var(--input-bg, var(--bg-elevated))",
              color: "var(--text)",
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
            background:
              "linear-gradient(135deg, var(--accent), var(--accent-secondary, #7f3dff))",
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
          color: "var(--text-muted)",
          fontSize: 12,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            height: 1,
            flex: 1,
            background: "var(--border-subtle)",
          }}
        />

        or connect cloud

        <span
          aria-hidden="true"
          style={{
            height: 1,
            flex: 1,
            background: "var(--border-subtle)",
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
          <span style={{ fontSize: 13 }}>
            Email
          </span>

          <input
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            required
            autoComplete="email"
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border:
                "1px solid var(--border-control, var(--border-subtle))",
              background:
                "var(--input-bg, var(--bg-elevated))",
              color: "var(--text)",
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
          <span style={{ fontSize: 13 }}>
            Password
          </span>

          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            required
            autoComplete="current-password"
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border:
                "1px solid var(--border-control, var(--border-subtle))",
              background:
                "var(--input-bg, var(--bg-elevated))",
              color: "var(--text)",
            }}
          />
        </label>

        {error && (
          <p
            role="alert"
            style={{
              color: "var(--danger, #ff7b88)",
              fontSize: 13,
              margin: "2px 0 0",
            }}
          >
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
            border:
              "1px solid var(--border-control, var(--border-subtle))",
            cursor: isSubmitting
              ? "default"
              : "pointer",
            background:
              "var(--button-secondary-bg, var(--bg-elevated))",
            color: "var(--text)",
            fontWeight: 500,
            fontSize: 14,
            opacity: isSubmitting ? 0.7 : 1,
          }}
        >
          {isSubmitting
            ? "Connecting..."
            : "Connect cloud account"}
        </button>
      </form>

      <div
        style={{
          marginTop: 10,
          fontSize: 13,
        }}
      >
        <span>Need a cloud account? </span>
        <Link to="/register">Register</Link>
      </div>

      <span
        aria-label={`Pioneer Work Suite version ${APP_VERSION}`}
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          color: "var(--text-muted)",
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

