/**
 * LoginPage.jsx
 *
 * Full-page sign-in / sign-up screen, styled to match the rest of the app.
 * On success the router redirects to /dashboard where role-based routing
 * takes over (org setup → manager dashboard / worker dashboard).
 */

import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import "../styles/LoginPage.css";

function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signup, login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (isSignUp && name.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        await signup(email, password, name.trim());
      } else {
        await login(email, password);
      }
      navigate("/dashboard");
    } catch (err) {
      const msg =
        err.code === "auth/email-already-in-use"
          ? "An account with this email already exists."
          : err.code === "auth/user-not-found" ||
              err.code === "auth/wrong-password"
            ? "Invalid email or password."
            : err.message || "Authentication failed.";
      setError(msg);
    }
    setLoading(false);
  };

  const switchMode = () => {
    setIsSignUp((v) => !v);
    setError("");
    setName("");
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* ── Brand ── */}
        <div className="login-brand">
          <div className="login-brand-icon">
            <img src="/favicon.svg" alt="ConstructFlow logo" className="login-brand-logo" />
          </div>
          <h1>ConstructFlow</h1>
          <p>Construction Project Management</p>
        </div>

        {/* ── Heading ── */}
        <h2 className="login-mode-heading">
          {isSignUp ? "Create Account" : "Welcome Back"}
        </h2>

        {/* ── Error ── */}
        {error && <div className="login-error">{error}</div>}

        {/* ── Form ── */}
        <form className="login-form" onSubmit={handleSubmit}>
          {isSignUp && (
            <div className="login-field">
              <label htmlFor="lp-name">Full Name</label>
              <input
                id="lp-name"
                type="text"
                placeholder=""
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                autoFocus
              />
            </div>
          )}

          <div className="login-field">
            <label htmlFor="lp-email">Email</label>
            <input
              id="lp-email"
              type="email"
              placeholder=""
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus={!isSignUp}
            />
          </div>

          <div className="login-field">
            <label htmlFor="lp-password">Password</label>
            <input
              id="lp-password"
              type="password"
              placeholder=""
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isSignUp ? "new-password" : "current-password"}
            />
          </div>

          {isSignUp && (
            <div className="login-field">
              <label htmlFor="lp-confirm">Confirm Password</label>
              <input
                id="lp-confirm"
                type="password"
                placeholder=""
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
          )}

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? "Please wait…" : isSignUp ? "Create Account" : "Sign In"}
          </button>
        </form>

        {/* ── Switch ── */}
        <div className="login-switch">
          {isSignUp ? "Already have an account? " : "Don't have an account? "}
          <button
            type="button"
            className="login-switch-btn"
            onClick={switchMode}
          >
            {isSignUp ? "Sign In" : "Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
