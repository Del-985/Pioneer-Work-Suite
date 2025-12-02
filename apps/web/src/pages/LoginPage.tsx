import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login } from "../api/auth";

const LoginPage: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!email || !password) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const { user, token } = await login(email, password);

      // Persist token and basic user info for later
      window.localStorage.setItem("token", token);
      window.localStorage.setItem("userEmail", user.email);
      window.localStorage.setItem("userName", user.name);
      window.localStorage.setItem("userRole", user.role);

      // After login, go to the main dashboard
      navigate("/dashboard");
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

  return (
    <div style={{ maxWidth: 420, width: "100%" }}>
      <h2 style={{ marginTop: 0 }}>Student Login</h2>
      <p style={{ fontSize: 13, color: "#9da2c8" }}>
        Sign in to your Pioneer student workspace.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 13 }}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 13 }}>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          <p style={{ color: "#ff7b88", fontSize: 13, margin: "2px 0 0" }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            marginTop: 8,
            padding: "8px 0",
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            background:
              "linear-gradient(135deg, #3f64ff, #7f3dff)",
            color: "#ffffff",
            fontWeight: 500,
            fontSize: 14,
          }}
        >
          {isSubmitting ? "Logging in..." : "Log in"}
        </button>
      </form>

      <div style={{ marginTop: 10, fontSize: 13 }}>
        <span>Need an account? </span>
        <Link to="/register">Register as a student</Link>
      </div>
    </div>
  );
};

export default LoginPage;