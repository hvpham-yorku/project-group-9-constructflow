/**
 * Header.jsx
 *
 * Top navigation header component displayed across all pages. Shows the current page title,
 * and user authentication status. When logged out, displays
 * a user icon that opens the authentication modal. Integrates with Firebase authentication.
 */

import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { MdPerson } from "react-icons/md";
import AuthModal from "./AuthModal";
import "../styles/Header.css";

function Header({ title, role }) {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { currentUser } = useAuth();

  const handleUserClick = () => {
    if (currentUser) {
      // Show user menu dropdown (future implementation)
    } else {
      setShowAuthModal(true);
    }
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h1>{title}</h1>
        </div>
        <div className="header-right">
          {!currentUser && (
            <button
              className="user-icon-btn"
              onClick={handleUserClick}
              title="Sign In"
            >
              <MdPerson className="icon" />
            </button>
          )}
        </div>
      </header>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </>
  );
}

export default Header;
