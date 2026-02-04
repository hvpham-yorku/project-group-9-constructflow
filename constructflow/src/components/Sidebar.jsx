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
import {
  MdDashboard,
  MdFolder,
  MdArchitecture,
  MdPeople,
  MdBarChart,
  MdSettings,
  MdCheckCircle,
  MdPerson,
  MdLogout,
} from "react-icons/md";
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
    { name: "Dashboard", icon: MdDashboard, path: "/dashboard" },
    { name: "Projects", icon: MdFolder, path: "/projects" },
    { name: "Blueprints", icon: MdArchitecture, path: "/blueprint" },
    { name: "Workers", icon: MdPeople, path: "/workers" },
    { name: "Reports", icon: MdBarChart, path: "/reports" },
    { name: "Settings", icon: MdSettings, path: "/settings" },
  ];

  const workerLinks = [
    { name: "Dashboard", icon: MdDashboard, path: "/worker/dashboard" },
    { name: "My Tasks", icon: MdCheckCircle, path: "/tasks" },
    { name: "Blueprints", icon: MdArchitecture, path: "/blueprint" },
    { name: "Profile", icon: MdPerson, path: "/profile" },
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
        {links.map((link, index) => {
          const IconComponent = link.icon;
          return (
            <a
              key={index}
              href={link.path}
              className={`nav-link ${location.pathname === link.path ? "active" : ""}`}
            >
              <IconComponent className="nav-icon" />
              <span className="nav-text">{link.name}</span>
            </a>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button onClick={handleLogout} className="nav-link logout-link">
          <MdLogout className="nav-icon" />
          <span className="nav-text">Logout</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
