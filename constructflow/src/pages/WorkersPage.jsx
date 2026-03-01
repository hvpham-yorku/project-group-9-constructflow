/**
 * WorkersPage.jsx
 *
 * Manager-only page showing all workers in the current organisation.
 * Displays each worker's trade, and allows the manager to copy the invite code
 * to share with new members.
 */

import { useState, useEffect } from "react";
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

const ROLE_COLORS = {
  carpenter: { bg: "#f3e8ff", fg: "#7c3aed" },
  electrician: { bg: "#eff6ff", fg: "#2563eb" },
  plumber: { bg: "#fff1f2", fg: "#be123c" },
  manager: { bg: "#fff7ed", fg: "#c2410c" },
};

const ROLE_LABELS = {
  carpenter: "Carpenter",
  electrician: "Electrician",
  plumber: "Plumber",
  manager: "Manager",
};

export default function WorkersPage() {
  const { organizationId, userProfile } = useAuth();
  const [members, setMembers] = useState([]);
  const [orgData, setOrgData] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    const load = async () => {
      setLoadingData(true);
      try {
        // Org info
        const orgSnap = await getDoc(doc(db, "organizations", organizationId));
        if (orgSnap.exists()) setOrgData(orgSnap.data());

        // All users in the org
        const q = query(
          collection(db, "users"),
          where("organizationId", "==", organizationId),
        );
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
        list.sort((a, b) =>
          a.role === "manager"
            ? -1
            : b.role === "manager"
              ? 1
              : (a.name || "").localeCompare(b.name || ""),
        );
        setMembers(list);
      } catch (err) {
        console.error("Workers load:", err);
      }
      setLoadingData(false);
    };
    load();
  }, [organizationId]);

  const workers = members.filter((m) => m.role !== "manager");

  return (
    <div className="dashboard">
      <Sidebar />
      <div className="dashboard-content">
        <Header title="Team" />

        <div className="dashboard-main">
          {/* ── Invite code banner ── */}
          {orgData && (
            <div className="welcome-banner" style={{ marginBottom: 28 }}>
              <div className="welcome-text">
                <h2>Team Members</h2>
                <p>
                  {workers.length} worker{workers.length !== 1 ? "s" : ""} ·{" "}
                  {orgData.name}
                </p>
              </div>
              <div className="invite-code-box">
                <span className="invite-label">Invite Code</span>
                <span
                  className={`invite-code${showCode ? " visible" : ""}`}
                  onClick={() => setShowCode((v) => !v)}
                  title="Click to reveal"
                >
                  {showCode ? orgData.inviteCode : "••••••"}
                </span>
                {showCode && (
                  <button
                    className="copy-btn"
                    onClick={() =>
                      navigator.clipboard.writeText(orgData.inviteCode)
                    }
                  >
                    Copy
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="section">
            <div className="section-header">
              <h2>All Members</h2>
              <span style={{ fontSize: 13, color: "#718096" }}>
                {members.length} total
              </span>
            </div>

            {loadingData ? (
              <div className="loading-rows">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="loading-row" />
                ))}
              </div>
            ) : members.length === 0 ? (
              <div className="empty-state">
                <p>
                  No members yet. Share the invite code for workers to join.
                </p>
              </div>
            ) : (
              <div className="workers-grid">
                {members.map((member) => {
                  const rc = ROLE_COLORS[member.role] || {
                    bg: "#f1f5f9",
                    fg: "#64748b",
                  };
                  const rl = ROLE_LABELS[member.role] || member.role;
                  const isMe = member.uid === userProfile?.uid;
                  return (
                    <div key={member.uid} className="worker-card">
                      <div className="worker-header">
                        <div className="worker-avatar">
                          {(member.name || "?")[0].toUpperCase()}
                        </div>
                        <div className="worker-info">
                          <h3>
                            {member.name || "—"}
                            {isMe && (
                              <span
                                style={{
                                  fontSize: 11,
                                  color: "#a0aec0",
                                  fontWeight: 400,
                                  marginLeft: 6,
                                }}
                              >
                                (you)
                              </span>
                            )}
                          </h3>
                          <p>{member.email}</p>
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginTop: 4,
                        }}
                      >
                        <span
                          className="status-badge"
                          style={{ background: rc.bg, color: rc.fg }}
                        >
                          {rl}
                        </span>
                        <span style={{ fontSize: 12, color: "#a0aec0" }}>
                          Joined{" "}
                          {member.createdAt
                            ? new Date(member.createdAt).toLocaleDateString()
                            : "—"}
                        </span>
                      </div>
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
