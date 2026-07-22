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

import "../styles/auth.css";

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localName, setLocalName] = useState(getLocalWorkspaceName());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openConfiguredStartupPage(): void {
    navigate(getConfiguredStartupPath(), { replace: true });
  }

  function continueLocally(): void {
    createOrUpdateLocalWorkspace(localName);
    openConfiguredStartupPage();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const { user, token } = await login(normalizedEmail, password);
      connectCloudSession(user, token);
      openConfiguredStartupPage();
    } catch (submitError: unknown) {
      console.error("Login error:", submitError);
      setError(
        getApiErrorMessage(submitError, "Unable to connect to your cloud account.")
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-intro" aria-labelledby="auth-login-title">
        <p className="auth-brand">Pioneer Work Suite</p>
        <h1 id="auth-login-title">Your workspace, ready when you are.</h1>
        <p className="auth-intro__copy">
          Work locally without waiting for a server. Connect cloud only when you want syncing
          across devices.
        </p>
        <ul className="auth-benefits">
          <li><span aria-hidden="true">✓</span><div><strong>Local first</strong><small>Tasks, documents, and calendar stay available on this device.</small></div></li>
          <li><span aria-hidden="true">✓</span><div><strong>Backup ready</strong><small>Export and restore your workspace from Settings.</small></div></li>
          <li><span aria-hidden="true">✓</span><div><strong>Cloud optional</strong><small>Reconnect when the backend is available again.</small></div></li>
        </ul>
      </section>

      <section className="auth-card" aria-label="Open Pioneer Work Suite">
        <div className="auth-card__section auth-card__section--local">
          <p className="auth-eyebrow">Recommended</p>
          <h2>Continue locally</h2>
          <p>Open the workspace stored on this device. No account or network connection is required.</p>
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              continueLocally();
            }}
          >
            <label>
              <span>Workspace name</span>
              <input
                type="text"
                value={localName}
                onChange={(event) => setLocalName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </label>
            <button className="auth-button auth-button--primary" type="submit">
              Open local workspace
            </button>
          </form>
        </div>

        <div className="auth-divider"><span>or connect cloud</span></div>

        <div className="auth-card__section">
          <h2>Cloud account</h2>
          <p>Sign in to enable syncing and Mail when cloud services are available.</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Connecting…" : "Connect cloud account"}
            </button>
          </form>
          <p className="auth-switch">Need a cloud account? <Link to="/register">Register</Link></p>
        </div>

        <footer className="auth-version" aria-label={`Pioneer Work Suite version ${APP_VERSION}`}>
          v{APP_VERSION}
        </footer>
      </section>
    </div>
  );
};

export default LoginPage;
