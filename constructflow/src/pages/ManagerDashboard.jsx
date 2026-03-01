/**
 * ManagerDashboard.jsx
 *
 * Landing page for the organisation manager.
 * Shows live stats (projects, workers, invite code) and quick links.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  MdFolder,
  MdEngineering,
  MdConstruction,
  MdArrowForward,
  MdBarChart,
  MdSettings,
} from "react-icons/md";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../contexts/AuthContext";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import "../styles/Dashboard.css";

export default function ManagerDashboard() {
  const { currentUser, userProfile, organizationId } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    projects: 0,
    workers: 0,
    blueprints: 0,
  });
  const [orgData, setOrgData] = useState(null);
  const [recentProjects, setRecentProjects] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    const load = async () => {
      setLoadingData(true);
      try {
        // Org details (for invite code)
        const orgSnap = await getDoc(doc(db, "organizations", organizationId));
        if (orgSnap.exists()) setOrgData(orgSnap.data());

        // Projects
        const projQ = query(
          collection(db, "projects"),
          where("organizationId", "==", organizationId),
        );
        const projSnap = await getDocs(projQ);
        const projs = projSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        projs.sort(
          (a, b) =>
            (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0),
        );
        setRecentProjects(projs.slice(0, 3));

        // Workers (members who are not manager)
        const workerQ = query(
          collection(db, "users"),
          where("organizationId", "==", organizationId),
          where("role", "in", ["carpenter", "electrician", "plumber"]),
        );
        const workerSnap = await getDocs(workerQ);

        setStats({
          projects: projs.length,
          workers: workerSnap.size,
          blueprints: 0,
        });
      } catch (err) {
        console.error("Dashboard load error:", err);
      }
      setLoadingData(false);
    };
    load();
  }, [organizationId]);

  const STATUS_COLORS = {
    active: { bg: "#dcfce7", fg: "#16a34a" },
    completed: { bg: "#dbeafe", fg: "#1d4ed8" },
    pending: { bg: "#fef9c3", fg: "#b45309" },
  };

  return (
    <div className="dashboard">
      <Sidebar />
      <div className="dashboard-content">
        <Header title="Dashboard" />

        <div className="dashboard-main">
          {/* ── Welcome banner ── */}
          <div className="welcome-banner">
            <div className="welcome-text">
              <h2>
                Welcome back, {userProfile?.name?.split(" ")[0] || "Manager"}
              </h2>
              <p>{orgData?.name || "Your Organisation"}</p>
            </div>
            <div className="invite-code-box">
              <span className="invite-label">Invite Code</span>
              <span
                className={`invite-code${showCode ? " visible" : ""}`}
                onClick={() => setShowCode((v) => !v)}
                title="Click to reveal/hide"
              >
                {showCode ? orgData?.inviteCode || "—" : "••••••"}
              </span>
              {showCode && orgData?.inviteCode && (
                <button
                  className="copy-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(orgData.inviteCode);
                  }}
                  title="Copy to clipboard"
                >
                  Copy
                </button>
              )}
            </div>
          </div>

          {/* ── Stats ── */}
          <div className="dashboard-stats">
            <div className="stat-card">
              <div className="stat-icon">
                <MdFolder />
              </div>
              <div>
                <p className="stat-label">Projects</p>
                <p className="stat-number">
                  {loadingData ? "—" : stats.projects}
                </p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <MdEngineering />
              </div>
              <div>
                <p className="stat-label">Workers</p>
                <p className="stat-number">
                  {loadingData ? "—" : stats.workers}
                </p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <MdConstruction />
              </div>
              <div>
                <p className="stat-label">Organisation</p>
                <p className="stat-org-name">{orgData?.name || "—"}</p>
              </div>
            </div>
          </div>

          {/* ── Recent projects ── */}
          <div className="section">
            <div className="section-header">
              <h2>Recent Projects</h2>
              <button
                className="btn-secondary"
                onClick={() => navigate("/projects")}
              >
                View All <MdArrowForward />
              </button>
            </div>
            {loadingData ? (
              <div className="loading-rows">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="loading-row" />
                ))}
              </div>
            ) : recentProjects.length === 0 ? (
              <div className="empty-state">
                <p>
                  No projects yet.{" "}
                  <button
                    className="link-btn"
                    onClick={() => navigate("/projects")}
                  >
                    Create one →
                  </button>
                </p>
              </div>
            ) : (
              <div className="recent-projects-list">
                {recentProjects.map((p) => {
                  const status = p.status || "active";
                  const sc = STATUS_COLORS[status] || STATUS_COLORS.active;
                  return (
                    <div
                      key={p.id}
                      className="recent-project-row"
                      onClick={() => navigate(`/projects/${p.id}/blueprints`)}
                    >
                      <span className="rp-icon">
                        <MdConstruction />
                      </span>
                      <span className="rp-name">{p.name}</span>
                      <span
                        className="rp-status"
                        style={{ background: sc.bg, color: sc.fg }}
                      >
                        {status}
                      </span>
                      <span className="rp-arrow">
                        <MdArrowForward />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Quick Actions ── */}
          <div className="section">
            <div className="section-header">
              <h2>Quick Actions</h2>
            </div>
            <div className="quick-actions">
              <button
                className="action-btn"
                onClick={() => navigate("/projects")}
              >
                <span className="action-icon">
                  <MdFolder />
                </span>
                <span>Manage Projects</span>
              </button>
              <button
                className="action-btn"
                onClick={() => navigate("/workers")}
              >
                <span className="action-icon">
                  <MdEngineering />
                </span>
                <span>View Workers</span>
              </button>
              <button
                className="action-btn"
                onClick={() => navigate("/reports")}
              >
                <span className="action-icon">
                  <MdBarChart />
                </span>
                <span>Reports</span>
              </button>
              <button
                className="action-btn"
                onClick={() => navigate("/settings")}
              >
                <span className="action-icon">
                  <MdSettings />
                </span>
                <span>Settings</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
