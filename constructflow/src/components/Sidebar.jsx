/**
 * Sidebar.jsx
 *
 * Role-aware navigation sidebar. Admins see all tabs. Workers (plumber/electrician)
 * see only Dashboard, Blueprints, and Settings.
 */

import { useLocation, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  MdDashboard,
  MdFolder,
  MdArchitecture,
  MdPeople,
  MdBarChart,
  MdSettings,
  MdLogout,
} from "react-icons/md";
import "../styles/Sidebar.css";

const ADMIN_LINKS = [
  { name: "Dashboard",  icon: MdDashboard,   path: "/dashboard" },
  { name: "Projects",   icon: MdFolder,      path: "/projects" },
  { name: "Blueprints", icon: MdArchitecture, path: "/blueprint" },
  { name: "Workers",    icon: MdPeople,      path: "/workers" },
  { name: "Reports",    icon: MdBarChart,    path: "/reports" },
  { name: "Settings",   icon: MdSettings,    path: "/settings" },
];

const WORKER_LINKS = [
  { name: "Dashboard",  icon: MdDashboard,   path: "/dashboard" },
  { name: "Blueprints", icon: MdArchitecture, path: "/blueprint" },
  { name: "Settings",   icon: MdSettings,    path: "/settings" },
];

function Sidebar() {
  const location = useLocation();
  const { logout, userProfile } = useAuth();

  const isAdmin = userProfile?.role === "admin";
  const links = isAdmin ? ADMIN_LINKS : WORKER_LINKS;

  const handleLogout = async () => {
    try { await logout(); } catch (err) { console.error("Logout failed:", err); }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img src="/logo.png" alt="ConstructFlow Logo" className="sidebar-logo" />
        <h2>CONSTRUCTFLOW</h2>
      </div>

      <nav className="sidebar-nav">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.path}
              to={link.path}
              className={`nav-link${location.pathname === link.path ? " active" : ""}`}
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
            <span className="sidebar-user-name">{userProfile.name || "User"}</span>
            <span className={`sidebar-user-role role-${userProfile.role}`}>
              {userProfile.role}
            </span>
          </div>
        )}
        <button onClick={handleLogout} className="nav-link logout-link">
          <MdLogout className="nav-icon" />
          <span className="nav-text">Logout</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
