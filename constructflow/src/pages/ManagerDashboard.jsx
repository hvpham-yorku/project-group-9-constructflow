/**
 * ManagerDashboard.jsx
 *
 * Landing page for the organisation manager.
 * Shows live stats (projects, workers, invite code) and recent projects.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  MdFolder,
  MdEngineering,
  MdConstruction,
  MdArrowForward,
  MdEdit,
  MdCheck,
  MdClose,
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
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import "../styles/Dashboard.css";

const getEffectiveProjectStatus = (project) => {
  const completion = Number(project?.completion);
  if (Number.isFinite(completion) && completion >= 100) {
    return "completed";
  }
  return project?.status || "active";
};

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
  const [editingOrgName, setEditingOrgName] = useState(false);
  const [orgNameValue, setOrgNameValue] = useState("");
  const [savingOrgName, setSavingOrgName] = useState(false);
  const [orgNameError, setOrgNameError] = useState("");

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
          where("role", "in", ["electrician", "plumber"]),
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

  useEffect(() => {
    setOrgNameValue(orgData?.name || "");
  }, [orgData?.name]);

  const handleSaveOrgName = async () => {
    const nextName = orgNameValue.trim();
    if (!nextName) {
      setOrgNameError("Organisation name cannot be empty.");
      return;
    }
    if (!organizationId) return;

    setSavingOrgName(true);
    setOrgNameError("");
    try {
      await updateDoc(doc(db, "organizations", organizationId), {
        name: nextName,
      });
      setOrgData((prev) => ({ ...(prev || {}), name: nextName }));
      setEditingOrgName(false);
    } catch (err) {
      setOrgNameError(err.message || "Failed to update organisation name.");
    }
    setSavingOrgName(false);
  };

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
                {editingOrgName ? (
                  <div className="org-name-edit-wrap">
                    <input
                      className="org-name-input"
                      value={orgNameValue}
                      onChange={(e) => setOrgNameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveOrgName();
                        if (e.key === "Escape") {
                          setEditingOrgName(false);
                          setOrgNameValue(orgData?.name || "");
                          setOrgNameError("");
                        }
                      }}
                      disabled={savingOrgName}
                      autoFocus
                    />
                    <div className="org-name-actions">
                      <button
                        className="org-name-btn save"
                        onClick={handleSaveOrgName}
                        disabled={savingOrgName}
                        title="Save organisation name"
                      >
                        <MdCheck />
                      </button>
                      <button
                        className="org-name-btn cancel"
                        onClick={() => {
                          setEditingOrgName(false);
                          setOrgNameValue(orgData?.name || "");
                          setOrgNameError("");
                        }}
                        disabled={savingOrgName}
                        title="Cancel"
                      >
                        <MdClose />
                      </button>
                    </div>
                    {orgNameError && (
                      <span className="org-name-error">{orgNameError}</span>
                    )}
                  </div>
                ) : (
                  <div className="org-name-row">
                    <p className="stat-org-name">{orgData?.name || "—"}</p>
                    <button
                      className="org-name-edit-btn"
                      onClick={() => {
                        setEditingOrgName(true);
                        setOrgNameValue(orgData?.name || "");
                        setOrgNameError("");
                      }}
                      title="Edit organisation name"
                    >
                      <MdEdit />
                    </button>
                  </div>
                )}
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
                  const status = getEffectiveProjectStatus(p);
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

        </div>
      </div>
    </div>
  );
}
