import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const LoginPage: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // TODO: wire this to your auth API + store
    console.log("Login attempt:", { email, password, rememberMe });

    // Once login works, you might:
    // - set token in store
    // - navigate("/orgs");
  }

  function handleRegisterClick() {
    // This assumes you'll later create a /register route
    navigate("/register");
  }

  function handleForgotPasswordClick() {
    // Placeholder route for now; you can add it later
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

          <button type="submit" className="auth-primary-button">
            Log in
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