/**
 * AuthModal.jsx
 *
 * Clean sign-in / sign-up modal.
 * Sign-up only asks for name + email + password — role is assigned later
 * through the organisation flow (create org → manager; join org → worker type).
 */

import { useState } from "react";
import { MdClose } from "react-icons/md";
import { useAuth } from "../contexts/AuthContext";
import "../styles/AuthModal.css";

function AuthModal({ isOpen, onClose }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signup, login } = useAuth();

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSignUp && password !== confirmPassword) {
      return setError("Passwords do not match");
    }
    if (isSignUp && name.trim().length < 2) {
      return setError("Please enter your full name");
    }

    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        await signup(email, password, name.trim());
      } else {
        await login(email, password);
      }
      onClose();
      reset();
    } catch (err) {
      const msg =
        err.code === "auth/email-already-in-use"
          ? "An account with this email already exists."
          : err.code === "auth/user-not-found" ||
              err.code === "auth/wrong-password"
            ? "Invalid email or password."
            : err.message || "Failed to authenticate";
      setError(msg);
    }

    setLoading(false);
  };

  const reset = () => {
    setName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError("");
  };

  const switchMode = () => {
    setIsSignUp((v) => !v);
    reset();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <MdClose />
        </button>

        <div className="modal-header">
          <div className="modal-logo">
            <img
              src="/favicon.svg"
              alt="ConstructFlow logo"
              className="modal-logo-image"
            />
          </div>
          <h2>{isSignUp ? "Create Account" : "Welcome Back"}</h2>
          <p>
            {isSignUp
              ? "Join ConstructFlow today"
              : "Sign in to your workspace"}
          </p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          {isSignUp && (
            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <input
                id="name"
                type="text"
                placeholder=""
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder=""
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder=""
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isSignUp ? "new-password" : "current-password"}
            />
          </div>

          {isSignUp && (
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                placeholder=""
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Please wait…" : isSignUp ? "Create Account" : "Sign In"}
          </button>
        </form>

        <div className="auth-switch">
          <p>
            {isSignUp ? "Already have an account? " : "Don't have an account? "}
            <button type="button" onClick={switchMode} className="link-btn">
              {isSignUp ? "Sign In" : "Sign Up"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default AuthModal;
