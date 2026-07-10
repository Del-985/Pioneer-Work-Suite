
// apps/web/src/pages/RegisterPage.tsx

import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { register } from "../api/auth";
import {
  connectCloudSession,
  createOrUpdateLocalWorkspace,
  getLocalWorkspaceName,
} from "../api/session";
import { getConfiguredStartupPath } from "../api/settings";

const APP_VERSION =
  import.meta.env.VITE_APP_VERSION || "0.0.0";

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();

  const [name, setName] = useState(
    getLocalWorkspaceName()
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
    const workspaceName = name.trim();

    createOrUpdateLocalWorkspace(workspaceName);
    openConfiguredStartupPage();
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();

    const normalizedName = name.trim();
    const normalizedEmail = email.trim();

    if (
      !normalizedName ||
      !normalizedEmail ||
      !password
    ) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { user, token } = await register(
        normalizedName,
        normalizedEmail,
        password
      );

      connectCloudSession(user, token);
      openConfiguredStartupPage();
    } catch (error: unknown) {
      console.error("Register error:", error);

      let message =
        "Unable to create the cloud account.";

      if (
        typeof error === "object" &&
        error !== null
      ) {
        const possibleError = error as {
          message?: unknown;
          response?: {
            data?: {
              error?: unknown;
            };
          };
        };

        const responseMessage =
          possibleError.response?.data?.error;

        if (typeof responseMessage === "string") {
          message = responseMessage;
        } else if (
          typeof possibleError.message === "string"
        ) {
          message = possibleError.message;
        }
      }

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
      <h2 style={{ marginTop: 0 }}>
        Connect a cloud account
      </h2>

      <p
        style={{
          fontSize: 13,
          color: "var(--text-muted)",
        }}
      >
        A cloud account is optional. It will be used
        for syncing across devices; your local
        workspace remains available either way.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginTop: 16,
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
            Name
          </span>

          <input
            type="text"
            value={name}
            onChange={(event) =>
              setName(event.target.value)
            }
            required
            autoComplete="name"
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--surface-input)",
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
              border: "1px solid var(--border)",
              background: "var(--surface-input)",
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
            autoComplete="new-password"
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--surface-input)",
              color: "var(--text)",
            }}
          />
        </label>

        {error && (
          <p
            role="alert"
            style={{
              color: "var(--danger)",
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
            border: "none",
            cursor: isSubmitting
              ? "default"
              : "pointer",
            background: "var(--accent-gradient)",
            color: "var(--text-on-accent)",
            fontWeight: 500,
            fontSize: 14,
            opacity: isSubmitting ? 0.7 : 1,
          }}
        >
          {isSubmitting
            ? "Creating account..."
            : "Create cloud account"}
        </button>
      </form>

      <button
        type="button"
        onClick={continueLocally}
        style={{
          width: "100%",
          marginTop: 12,
          padding: "8px 0",
          borderRadius: 999,
          border: "1px solid var(--border)",
          cursor: "pointer",
          background: "transparent",
          color: "var(--accent-text)",
          fontWeight: 500,
          fontSize: 14,
        }}
      >
        Continue with local workspace
      </button>

      <div
        style={{
          marginTop: 10,
          fontSize: 13,
        }}
      >
        <span>Already have a cloud account? </span>
        <Link to="/login">Log in</Link>
      </div>

      <span
        aria-label={`Pioneer Work Suite version ${APP_VERSION}`}
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          color: "var(--text-faint)",
          fontSize: 11,
          userSelect: "none",
        }}
      >
        v{APP_VERSION}
      </span>
    </div>
  );
};

export default RegisterPage;
