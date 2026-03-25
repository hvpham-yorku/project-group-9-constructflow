/**
 * WorkersPage.jsx
 *
 * Manager-only page showing all workers in the current organisation.
 * Manager can change a worker's trade role or remove them from the org.
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
  updateDoc,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { MdEdit, MdCheck, MdClose, MdPersonRemove } from "react-icons/md";
import "../styles/Dashboard.css";
import "../styles/WorkersPage.css";

const ROLE_COLORS = {
  electrician: { bg: "#eff6ff", fg: "#2563eb" },
  plumber: { bg: "#e0e7ff", fg: "#be123c" },
  manager: { bg: "#eff6ff", fg: "#1e3a8a" },
};

const WORKER_ROLES = [
  { value: "electrician", label: "Electrician" },
  { value: "plumber", label: "Plumber" },
];

const ROLE_LABELS = {
  electrician: "Electrician",
  plumber: "Plumber",
  manager: "Manager",
};

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toInputDateTimeValue(value) {
  const date = toDate(value);
  if (!date) return "";
  const tzOffset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return "No shift assigned";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function WorkersPage() {
  const { organizationId, userProfile } = useAuth();
  const [members, setMembers] = useState([]);
  const [orgData, setOrgData] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [showCode, setShowCode] = useState(false);

  // Per-worker inline role editing
  const [editingRoleUid, setEditingRoleUid] = useState(null);
  const [roleEditValue, setRoleEditValue] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);
  const [editingShiftUid, setEditingShiftUid] = useState(null);
  const [shiftStartValue, setShiftStartValue] = useState("");
  const [shiftEndValue, setShiftEndValue] = useState("");
  const [shiftSaving, setShiftSaving] = useState(false);
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    const load = async () => {
      setLoadingData(true);
      try {
        const orgSnap = await getDoc(doc(db, "organizations", organizationId));
        if (orgSnap.exists()) setOrgData(orgSnap.data());

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

  // ── Change a worker's role ───────────────────────────────────────────
  const startEditRole = (member) => {
    setEditingRoleUid(member.uid);
    setRoleEditValue(member.role);
  };

  const saveRole = async (uid) => {
    if (!roleEditValue) return;
    setRoleSaving(true);
    try {
      await updateDoc(doc(db, "users", uid), { role: roleEditValue });
      // Also update the members map in the org doc
      await updateDoc(doc(db, "organizations", organizationId), {
        [`members.${uid}.role`]: roleEditValue,
      });
      setMembers((prev) =>
        prev.map((m) => (m.uid === uid ? { ...m, role: roleEditValue } : m)),
      );
      setEditingRoleUid(null);
    } catch (err) {
      console.error("Role save failed:", err);
      alert("Failed to update role.");
    }
    setRoleSaving(false);
  };

  // ── Remove a worker from the org ────────────────────────────────────
  const removeWorker = async (member) => {
    if (
      !window.confirm(
        `Remove ${member.name || "this worker"} from the organisation? They will lose access.`,
      )
    )
      return;
    try {
      // Reset user: clear org + revert to general role
      await updateDoc(doc(db, "users", member.uid), {
        organizationId: null,
        role: "general",
      });
      // Remove from org members map
      await updateDoc(doc(db, "organizations", organizationId), {
        [`members.${member.uid}`]: deleteField(),
      });
      setMembers((prev) => prev.filter((m) => m.uid !== member.uid));
    } catch (err) {
      console.error("Remove worker failed:", err);
      alert("Failed to remove worker.");
    }
  };

  const workers = members.filter((m) => m.role !== "manager");

  const getShiftState = (member) => {
    const start = toDate(member.shiftStartAt);
    const end = toDate(member.shiftEndAt);
    if (!start || !end || end <= start) {
      return { label: "No shift", className: "off", isInShiftNow: false };
    }
    const startMs = start.getTime();
    const endMs = end.getTime();
    const withinWindow = nowMs >= startMs && nowMs <= endMs;

    if (withinWindow && member.isClockedIn) {
      return {
        label: "In shift now",
        className: "in-shift",
        isInShiftNow: true,
      };
    }
    if (withinWindow && !member.isClockedIn) {
      return {
        label: "Scheduled now",
        className: "scheduled",
        isInShiftNow: false,
      };
    }
    if (nowMs < startMs) {
      return {
        label: "Scheduled",
        className: "scheduled",
        isInShiftNow: false,
      };
    }
    if (member.isClockedIn) {
      return {
        label: "Clocked in (past shift)",
        className: "scheduled",
        isInShiftNow: true,
      };
    }
    return { label: "Off shift", className: "off", isInShiftNow: false };
  };

  const workersInShiftNow = workers.filter(
    (worker) => getShiftState(worker).isInShiftNow,
  );

  const startEditShift = (member) => {
    setEditingShiftUid(member.uid);
    setShiftStartValue(toInputDateTimeValue(member.shiftStartAt));
    setShiftEndValue(toInputDateTimeValue(member.shiftEndAt));
  };

  const saveShift = async (uid) => {
    if (!shiftStartValue || !shiftEndValue) {
      alert("Please set both shift start and shift end.");
      return;
    }
    const startDate = new Date(shiftStartValue);
    const endDate = new Date(shiftEndValue);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      alert("Please provide valid shift dates.");
      return;
    }
    if (endDate <= startDate) {
      alert("Shift end must be after shift start.");
      return;
    }

    setShiftSaving(true);
    try {
      await updateDoc(doc(db, "users", uid), {
        shiftStartAt: Timestamp.fromDate(startDate),
        shiftEndAt: Timestamp.fromDate(endDate),
      });
      setMembers((prev) =>
        prev.map((member) =>
          member.uid === uid
            ? {
                ...member,
                shiftStartAt: Timestamp.fromDate(startDate),
                shiftEndAt: Timestamp.fromDate(endDate),
              }
            : member,
        ),
      );
      setEditingShiftUid(null);
    } catch (err) {
      console.error("Shift save failed:", err);
      alert("Failed to save shift.");
    }
    setShiftSaving(false);
  };

  const clearShift = async (uid) => {
    if (!window.confirm("Clear this worker's shift assignment?")) return;
    setShiftSaving(true);
    try {
      await updateDoc(doc(db, "users", uid), {
        shiftStartAt: null,
        shiftEndAt: null,
        isClockedIn: false,
      });
      setMembers((prev) =>
        prev.map((member) =>
          member.uid === uid
            ? {
                ...member,
                shiftStartAt: null,
                shiftEndAt: null,
                isClockedIn: false,
              }
            : member,
        ),
      );
      if (editingShiftUid === uid) {
        setEditingShiftUid(null);
      }
    } catch (err) {
      console.error("Shift clear failed:", err);
      alert("Failed to clear shift.");
    }
    setShiftSaving(false);
  };

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

            <div className="shift-now-panel">
              <h3>In Shift Right Now</h3>
              {workersInShiftNow.length === 0 ? (
                <p>No workers are currently clocked in for an active shift.</p>
              ) : (
                <div className="shift-now-list">
                  {workersInShiftNow.map((worker) => (
                    <span key={worker.uid} className="shift-now-chip">
                      {worker.name || worker.email}
                    </span>
                  ))}
                </div>
              )}
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
                  const shiftState = getShiftState(member);
                  const isMe = member.uid === userProfile?.uid;
                  const isManagerMember = member.role === "manager";
                  const isEditingThisRole = editingRoleUid === member.uid;
                  const isEditingShift = editingShiftUid === member.uid;

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
                              <span className="worker-you-tag">(you)</span>
                            )}
                          </h3>
                          <p>{member.email}</p>
                        </div>

                        {/* Manager actions — only for non-manager members, not self */}
                        {!isManagerMember && !isMe && (
                          <div className="worker-actions">
                            {isEditingThisRole ? (
                              <>
                                <button
                                  className="waction-btn confirm"
                                  onClick={() => saveRole(member.uid)}
                                  disabled={roleSaving}
                                  title="Save role"
                                >
                                  <MdCheck />
                                </button>
                                <button
                                  className="waction-btn cancel"
                                  onClick={() => setEditingRoleUid(null)}
                                  title="Cancel"
                                >
                                  <MdClose />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="waction-btn edit"
                                  onClick={() => startEditRole(member)}
                                  title="Change role"
                                >
                                  <MdEdit />
                                </button>
                                <button
                                  className="waction-btn remove"
                                  onClick={() => removeWorker(member)}
                                  title="Remove from org"
                                >
                                  <MdPersonRemove />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="worker-card-footer">
                        {isEditingThisRole ? (
                          <select
                            className="role-select"
                            value={roleEditValue}
                            onChange={(e) => setRoleEditValue(e.target.value)}
                            autoFocus
                          >
                            {WORKER_ROLES.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className="status-badge"
                            style={{ background: rc.bg, color: rc.fg }}
                          >
                            {rl}
                          </span>
                        )}
                        <span className="worker-joined">
                          Joined{" "}
                          {member.createdAt
                            ? new Date(member.createdAt).toLocaleDateString()
                            : "—"}
                        </span>
                      </div>

                      {!isManagerMember && (
                        <div className="worker-shift-block">
                          <div className="worker-shift-top">
                            <span className="worker-shift-label">Shift</span>
                            <span
                              className={`status-badge shift-status ${shiftState.className}`}
                            >
                              {shiftState.label}
                            </span>
                          </div>
                          <p className="worker-shift-window">
                            {formatDateTime(member.shiftStartAt)}
                            {toDate(member.shiftEndAt)
                              ? ` - ${formatDateTime(member.shiftEndAt)}`
                              : ""}
                          </p>

                          {isEditingShift ? (
                            <div className="shift-editor">
                              <input
                                type="datetime-local"
                                value={shiftStartValue}
                                onChange={(e) =>
                                  setShiftStartValue(e.target.value)
                                }
                              />
                              <input
                                type="datetime-local"
                                value={shiftEndValue}
                                onChange={(e) =>
                                  setShiftEndValue(e.target.value)
                                }
                              />
                              <div className="shift-editor-actions">
                                <button
                                  className="btn-secondary"
                                  onClick={() => saveShift(member.uid)}
                                  disabled={shiftSaving}
                                >
                                  {shiftSaving ? "Saving..." : "Save Shift"}
                                </button>
                                <button
                                  className="btn-secondary"
                                  onClick={() => setEditingShiftUid(null)}
                                  disabled={shiftSaving}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="shift-editor-actions">
                              <button
                                className="btn-secondary"
                                onClick={() => startEditShift(member)}
                              >
                                {toDate(member.shiftStartAt)
                                  ? "Edit Shift"
                                  : "Assign Shift"}
                              </button>
                              {toDate(member.shiftStartAt) && (
                                <button
                                  className="btn-secondary"
                                  onClick={() => clearShift(member.uid)}
                                  disabled={shiftSaving}
                                >
                                  Clear Shift
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
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
