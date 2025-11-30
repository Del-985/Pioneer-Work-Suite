import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login as apiLogin } from "../api/authApi";

const LoginPage: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // basic guard
    if (!email || !password) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const { user, token } = await apiLogin(email, password);

      // store token; rememberMe could later change how we store it
      window.localStorage.setItem("token", token);
      window.localStorage.setItem("userEmail", user.email);
      window.localStorage.setItem("userName", user.name);

      // TODO: later we can use a global auth store instead of localStorage-only

      // after successful login, send them to organizations (we'll build that route later)
      navigate("/orgs");
    } catch (err: any) {
      console.error("Login error:", err);
      const message =
        err?.response?.data?.error ||
        err?.message ||
        "Unable to log in. Please check your credentials.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleRegisterClick() {
    navigate("/register");
  }

  function handleForgotPasswordClick() {
    navigate("/forgot-password");
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Top nav bar inside the auth card */}
        <header className="auth-navbar">
          <div className="auth-brand">
            <span className="auth-brand-mark">PW</span>
            <span className="auth-brand-text">Pioneer Work Suite</span>
          </div>

          <nav className="auth-tabs">
            <button className="auth-tab auth-tab-active" type="button">
              Login
            </button>
            <button
              className="auth-tab"
              type="button"
              onClick={handleRegisterClick}
            >
              Register
            </button>
          </nav>
        </header>

        {/* Main auth form */}
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-form-header">
            <h1 className="auth-title">Welcome back</h1>
            <p className="auth-subtitle">
              Sign in to your workspace to manage invoices, sheets, and email.
            </p>
          </div>

          <div className="auth-field">
            <label htmlFor="email" className="auth-label">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className="auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password" className="auth-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <div className="auth-row">
            <label className="auth-checkbox">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember me</span>
            </label>

            <button
              type="button"
              className="auth-link-button"
              onClick={handleForgotPasswordClick}
            >
              Forgot password?
            </button>
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button
            type="submit"
            className="auth-primary-button"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Logging in..." : "Log in"}
          </button>

          <div className="auth-footer">
            <span>New here?</span>
            <button
              type="button"
              className="auth-link-button"
              onClick={handleRegisterClick}
            >
              Create an account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;