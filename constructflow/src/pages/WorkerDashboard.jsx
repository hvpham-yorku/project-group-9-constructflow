/**
 * WorkerDashboard.jsx
 *
 * Dashboard for trade workers. Shows all blueprints where they have assigned elements,
 * element counts, and completion stats. Clicking a blueprint row navigates to it.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  MdAssignment,
  MdCheckCircle,
  MdSchedule,
  MdDesignServices,
  MdArrowForward,
} from "react-icons/md";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import "../styles/Dashboard.css";

const ROLE_LABELS = {
  carpenter: "Carpenter",
  electrician: "Electrician",
  plumber: "Plumber",
};

const ROLE_COLORS = {
  carpenter: { bg: "#f3e8ff", fg: "#7c3aed" },
  electrician: { bg: "#eff6ff", fg: "#2563eb" },
  plumber: { bg: "#fff1f2", fg: "#be123c" },
};

export default function WorkerDashboard() {
  const { currentUser, userProfile, organizationId } = useAuth();
  const navigate = useNavigate();

  const [assignments, setAssignments] = useState([]); // { blueprintId, blueprintName, projectId, elements: [...] }
  const [loadingData, setLoadingData] = useState(true);

  const currentUid = currentUser?.uid || null;

  useEffect(() => {
    if (!currentUid || !organizationId) return;
    const load = async () => {
      setLoadingData(true);
      try {
        // Fetch all blueprints in the org
        const bpQ = query(
          collection(db, "blueprints"),
          where("organizationId", "==", organizationId),
        );
        const bpSnap = await getDocs(bpQ);

        const result = [];

        bpSnap.forEach((bpDoc) => {
          const bp = { id: bpDoc.id, ...bpDoc.data() };
          const objects = Object.entries(bp.objects || {}).map(([id, obj]) => ({
            id,
            ...obj,
          }));
          const mine = objects.filter((o) => o.assignedTo === currentUid);
          if (mine.length > 0) {
            result.push({
              blueprintId: bp.id,
              blueprintName: bp.name,
              projectId: bp.projectId,
              elements: mine,
            });
          }
        });

        result.sort((a, b) => b.elements.length - a.elements.length);
        setAssignments(result);
      } catch (err) {
        console.error("Worker dashboard load:", err);
      }
      setLoadingData(false);
    };
    load();
  }, [currentUid, organizationId]);

  const totalElements = assignments.reduce((s, a) => s + a.elements.length, 0);
  const doneElements = assignments.reduce(
    (s, a) => s + a.elements.filter((e) => e.completed).length,
    0,
  );
  const pendingElements = totalElements - doneElements;

  const roleLabel =
    ROLE_LABELS[userProfile?.role] || userProfile?.role || "Worker";
  const roleBadge = ROLE_COLORS[userProfile?.role] || {
    bg: "#f1f5f9",
    fg: "#64748b",
  };

  return (
    <div className="dashboard">
      <Sidebar />
      <div className="dashboard-content">
        <Header title="Dashboard" />

        <div className="dashboard-main">
          {/* ── Welcome ── */}
          <div className="welcome-banner">
            <div className="welcome-text">
              <h2>Welcome, {userProfile?.name?.split(" ")[0] || "Worker"}</h2>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 4,
                }}
              >
                <span
                  className="sidebar-user-role"
                  style={{
                    background: roleBadge.bg,
                    color: roleBadge.fg,
                    fontSize: 12,
                    padding: "3px 10px",
                    borderRadius: 20,
                    fontWeight: 700,
                  }}
                >
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>

          {/* ── Stats ── */}
          <div className="dashboard-stats">
            <div className="stat-card">
              <div className="stat-icon">
                <MdAssignment />
              </div>
              <div>
                <p className="stat-label">Assigned</p>
                <p className="stat-number">
                  {loadingData ? "—" : totalElements}
                </p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <MdCheckCircle />
              </div>
              <div>
                <p className="stat-label">Completed</p>
                <p className="stat-number">
                  {loadingData ? "—" : doneElements}
                </p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <MdSchedule />
              </div>
              <div>
                <p className="stat-label">Pending</p>
                <p className="stat-number">
                  {loadingData ? "—" : pendingElements}
                </p>
              </div>
            </div>
          </div>

          {/* ── My Assignments ── */}
          <div className="section">
            <div className="section-header">
              <h2>My Assignments</h2>
              <button
                className="btn-secondary"
                onClick={() => navigate("/projects")}
              >
                Browse Projects <MdArrowForward />
              </button>
            </div>

            {loadingData ? (
              <div className="loading-rows">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="loading-row" />
                ))}
              </div>
            ) : assignments.length === 0 ? (
              <div className="empty-state">
                <p>
                  No assignments yet. Ask your manager to assign work to you.
                </p>
              </div>
            ) : (
              <div className="recent-projects-list">
                {assignments.map((a) => {
                  const done = a.elements.filter((e) => e.completed).length;
                  const total = a.elements.length;
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                  return (
                    <div
                      key={a.blueprintId}
                      className="recent-project-row"
                      onClick={() =>
                        navigate(`/projects/${a.projectId}/blueprints`)
                      }
                    >
                      <span className="rp-icon">
                        <MdDesignServices />
                      </span>
                      <div style={{ flex: 1 }}>
                        <div className="rp-name">{a.blueprintName}</div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginTop: 4,
                          }}
                        >
                          <div
                            className="progress-bar"
                            style={{ width: 120, height: 5, margin: 0 }}
                          >
                            <div
                              className="progress-fill"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span style={{ fontSize: 12, color: "#718096" }}>
                            {done}/{total} done
                          </span>
                        </div>
                      </div>
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
