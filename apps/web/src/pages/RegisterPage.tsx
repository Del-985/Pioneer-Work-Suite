import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { register } from "../api/auth";
import {
  connectCloudSession,
  createOrUpdateLocalWorkspace,
  getLocalWorkspaceName,
} from "../api/session";
import { getConfiguredStartupPath } from "../api/settings";
import { APP_VERSION } from "../config/appMetadata";
import { getApiErrorMessage } from "../utils/apiErrors";

import "../styles/auth.css";

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [name, setName] = useState(getLocalWorkspaceName());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openConfiguredStartupPage(): void {
    navigate(getConfiguredStartupPath(), { replace: true });
  }

  function continueLocally(): void {
    createOrUpdateLocalWorkspace(name.trim());
    openConfiguredStartupPage();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedEmail = email.trim();
    if (!normalizedName || !normalizedEmail || !password) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const { user, token } = await register(normalizedName, normalizedEmail, password);
      connectCloudSession(user, token);
      openConfiguredStartupPage();
    } catch (submitError: unknown) {
      console.error("Register error:", submitError);
      setError(
        getApiErrorMessage(submitError, "Unable to create the cloud account.")
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-page auth-page--register">
      <section className="auth-intro" aria-labelledby="auth-register-title">
        <p className="auth-brand">Pioneer Work Suite</p>
        <h1 id="auth-register-title">Take your workspace across devices.</h1>
        <p className="auth-intro__copy">
          Create a cloud account for synchronization and Mail. Your local workspace remains
          usable independently.
        </p>
        <div className="auth-local-note">
          <strong>Not ready for cloud?</strong>
          <span>You can continue locally now and connect later from the sidebar.</span>
          <button type="button" onClick={continueLocally}>Continue locally</button>
        </div>
      </section>

      <section className="auth-card auth-card--single" aria-label="Create cloud account">
        <div className="auth-card__section">
          <p className="auth-eyebrow">Cloud setup</p>
          <h2>Create your account</h2>
          <p>Use an email and password to prepare cross-device synchronization.</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              <span>Name</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoComplete="name"
              />
            </label>
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
                autoComplete="new-password"
              />
            </label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-button auth-button--primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating account…" : "Create cloud account"}
            </button>
          </form>
          <p className="auth-switch">Already have a cloud account? <Link to="/login">Log in</Link></p>
        </div>
        <footer className="auth-version" aria-label={`Pioneer Work Suite version ${APP_VERSION}`}>
          v{APP_VERSION}
        </footer>
      </section>
    </div>
  );
};

export default RegisterPage;
