/**
 * Sidebar.jsx
 *
 * Role-aware navigation sidebar.
 *   Manager  — Dashboard, Projects, Workers, Settings
 *   Worker   — Dashboard, Projects, Settings
 *
 * Projects link goes to /projects (list); individual blueprints are accessed
 * from within each project card.
 */

import { useLocation, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  MdDashboard,
  MdFolder,
  MdPeople,
  // MdBarChart,
  MdSettings,
  MdLogout,
} from "react-icons/md";
import "../styles/Sidebar.css";

const MANAGER_LINKS = [
  { name: "Dashboard", icon: MdDashboard, path: "/dashboard" },
  { name: "Projects", icon: MdFolder, path: "/projects" },
  { name: "Workers", icon: MdPeople, path: "/workers" },
  // { name: "Reports", icon: MdBarChart, path: "/reports" },
  { name: "Settings", icon: MdSettings, path: "/settings" },
];

const WORKER_LINKS = [
  { name: "Dashboard", icon: MdDashboard, path: "/dashboard" },
  { name: "Projects", icon: MdFolder, path: "/projects" },
  { name: "Settings", icon: MdSettings, path: "/settings" },
];

const ROLE_LABELS = {
  manager: "Manager",
  electrician: "Electrician",
  plumber: "Plumber",
  general: "General",
};

function Sidebar() {
  const location = useLocation();
  const { logout, userProfile, isManager } = useAuth();
  const links = isManager ? MANAGER_LINKS : WORKER_LINKS;

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <img
            src="/favicon.svg"
            alt="ConstructFlow logo"
            className="brand-icon"
          />
          <div className="brand-text">
            <span className="brand-name">ConstructFlow</span>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.path}
              to={link.path}
              className={`nav-link${isActive(link.path) ? " active" : ""}`}
            >
              <Icon className="nav-icon" />
              <span className="nav-text">{link.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        {userProfile && (
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {(userProfile.name || "U")[0].toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">
                {userProfile.name || "User"}
              </span>
              <span className={`sidebar-user-role role-${userProfile.role}`}>
                {ROLE_LABELS[userProfile.role] || userProfile.role}
              </span>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="nav-link logout-link"
          title="Logout"
        >
          <MdLogout className="nav-icon" />
          <span className="nav-text">Logout</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
