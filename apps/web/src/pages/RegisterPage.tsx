// apps/web/src/pages/RegisterPage.tsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../api/auth";
import {
  connectCloudSession,
  createOrUpdateLocalWorkspace,
  getLocalWorkspaceName,
} from "../api/session";

const APP_VERSION = import.meta.env.VITE_APP_VERSION || "0.0.0";

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();

  const [name, setName] = useState(getLocalWorkspaceName());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function continueLocally() {
    createOrUpdateLocalWorkspace(name);
    navigate("/dashboard", { replace: true });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!name.trim() || !email.trim() || !password) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { user, token } = await register(
        name.trim(),
        email.trim(),
        password
      );

      connectCloudSession(user, token);
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      console.error("Register error:", err);

      const message =
        err?.response?.data?.error ||
        err?.message ||
        "Unable to create the cloud account.";

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
      <h2 style={{ marginTop: 0 }}>Connect a cloud account</h2>

      <p style={{ fontSize: 13, color: "#9da2c8" }}>
        A cloud account is optional. It will be used for future syncing across
        devices; your local workspace remains available either way.
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
          <span style={{ fontSize: 13 }}>Name</span>

          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
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
            border: "none",
            cursor: isSubmitting ? "default" : "pointer",
            background: "linear-gradient(135deg, #3f64ff, #7f3dff)",
            color: "#ffffff",
            fontWeight: 500,
            fontSize: 14,
          }}
        >
          {isSubmitting ? "Creating account..." : "Create cloud account"}
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
          border: "1px solid rgba(255,255,255,0.16)",
          cursor: "pointer",
          background: "transparent",
          color: "#c7ceff",
          fontWeight: 500,
          fontSize: 14,
        }}
      >
        Continue with local workspace
      </button>

      <div style={{ marginTop: 10, fontSize: 13 }}>
        <span>Already have a cloud account? </span>
        <Link to="/login">Log in</Link>
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

export default RegisterPage;
