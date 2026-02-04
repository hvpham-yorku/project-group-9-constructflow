/**
 * Sidebar.jsx
 *
 * Left navigation sidebar component providing main application navigation. Displays the
 * ConstructOS branding and navigation links appropriate for the user's role (manager or worker).
 * Highlights the current active page with an orange accent. Fixed to viewport height for
 * persistent visibility while scrolling page content.
 */

import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "../styles/Sidebar.css";

function Sidebar({ role }) {
  const location = useLocation();
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Failed to log out:", error);
    }
  };

  const managerLinks = [
    { name: "Dashboard", icon: "📊", path: "/dashboard" },
    { name: "Projects", icon: "📁", path: "/projects" },
    { name: "Blueprints", icon: "📐", path: "/blueprint" },
    { name: "Workers", icon: "👥", path: "/workers" },
    { name: "Reports", icon: "📈", path: "/reports" },
    { name: "Settings", icon: "⚙️", path: "/settings" },
  ];

  const workerLinks = [
    { name: "Dashboard", icon: "📊", path: "/worker/dashboard" },
    { name: "My Tasks", icon: "✓", path: "/tasks" },
    { name: "Blueprints", icon: "📐", path: "/blueprint" },
    { name: "Profile", icon: "👤", path: "/profile" },
  ];

  const links = role === "manager" ? managerLinks : workerLinks;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img
          src="/logo.png"
          alt="ConstructFlow Logo"
          className="sidebar-logo"
        />
        <h2>CONSTRUCTFLOW</h2>
      </div>

      <nav className="sidebar-nav">
        {links.map((link, index) => (
          <a
            key={index}
            href={link.path}
            className={`nav-link ${location.pathname === link.path ? "active" : ""}`}
          >
            <span className="nav-icon">{link.icon}</span>
            <span className="nav-text">{link.name}</span>
          </a>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button onClick={handleLogout} className="nav-link logout-link">
          <span className="nav-icon">🚪</span>
          <span className="nav-text">Logout</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
