/**
 * WorkerDashboard.jsx
 *
 * Dashboard for trade workers. Shows tasks assigned to the worker,
 * task counts, and completion stats. Clicking a task row navigates to its blueprint.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  MdAssignment,
  MdCheckCircle,
  MdSchedule,
  MdArrowForward,
  MdLogin,
  MdLogout,
} from "react-icons/md";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../contexts/AuthContext";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  listProjectMaterials,
  listTaskMaterialAllocations,
} from "../utils/materialsRepository";
import "../styles/Dashboard.css";

const ROLE_LABELS = {
  electrician: "Electrician",
  plumber: "Plumber",
};

const ROLE_COLORS = {
  electrician: { bg: "#eff6ff", fg: "#2563eb" },
  plumber: { bg: "#e0e7ff", fg: "#be123c" },
};

const INITIAL_NOW_MS = Date.now();

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return "--";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function toDayKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function WorkerDashboard() {
  const { currentUser, userProfile, organizationId } = useAuth();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState([]); // { id, title, dueDate, projectId, completed }
  const [projectNames, setProjectNames] = useState({}); // { [projectId]: projectName }
  const [loadingData, setLoadingData] = useState(true);
  const [workerRecord, setWorkerRecord] = useState(null);
  const [clockActionLoading, setClockActionLoading] = useState(false);
  const [clockMessage, setClockMessage] = useState("");
  const [nowMs, setNowMs] = useState(INITIAL_NOW_MS);
  const [taskMaterialsByTaskId, setTaskMaterialsByTaskId] = useState({});

  const currentUid = currentUser?.uid || null;

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!currentUid || !organizationId) return;
    const load = async () => {
      setLoadingData(true);
      try {
        const workerSnap = await getDoc(doc(db, "users", currentUid));
        if (workerSnap.exists()) {
          setWorkerRecord({ uid: workerSnap.id, ...workerSnap.data() });
        }

        const projectQ = query(
          collection(db, "projects"),
          where("organizationId", "==", organizationId),
        );
        const projectSnap = await getDocs(projectQ);
        const nameMap = {};
        const activeProjectIds = new Set();
        projectSnap.forEach((docSnap) => {
          const projectData = docSnap.data() || {};
          nameMap[docSnap.id] = projectData.name || "Project";
          const projectStatus = projectData.status || "active";
          if (projectStatus === "active") {
            activeProjectIds.add(docSnap.id);
          }
        });
        setProjectNames(nameMap);

        const taskQ = query(
          collection(db, "tasks"),
          where("assignedWorkerId", "==", currentUid),
        );
        const taskSnap = await getDocs(taskQ);
        const taskList = taskSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter(
            (task) =>
              task.organizationId === organizationId &&
              activeProjectIds.has(task.projectId),
          )
          .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
        setTasks(taskList);

        if (taskList.length === 0) {
          setTaskMaterialsByTaskId({});
        } else {
          const uniqueProjectIds = Array.from(
            new Set(taskList.map((task) => task.projectId).filter(Boolean)),
          );

          const materialMapsByProjectId = {};
          await Promise.all(
            uniqueProjectIds.map(async (pid) => {
              const materials = await listProjectMaterials({
                organizationId,
                projectId: pid,
              });
              materialMapsByProjectId[pid] = Object.fromEntries(
                materials.map((material) => [material.id, material]),
              );
            }),
          );

          const entries = await Promise.all(
            taskList.map(async (task) => {
              const allocations = await listTaskMaterialAllocations({
                organizationId,
                projectId: task.projectId,
                taskId: task.id,
              });

              const materialsById = materialMapsByProjectId[task.projectId] || {};
              const resolved = allocations.map((allocation) => {
                const material = materialsById[allocation.materialId] || {};
                return {
                  materialId: allocation.materialId,
                  quantityRequired: allocation.quantityRequired,
                  materialName: material.name || "Material",
                  unit: material.unit || "unit",
                };
              });

              return [task.id, resolved];
            }),
          );

          setTaskMaterialsByTaskId(Object.fromEntries(entries));
        }
      } catch (err) {
        console.error("Worker dashboard load:", err);
      }
      setLoadingData(false);
    };
    load();
  }, [currentUid, organizationId]);

  const shiftStart = toDate(workerRecord?.shiftStartAt);
  const shiftEnd = toDate(workerRecord?.shiftEndAt);
  const hasShift = Boolean(shiftStart && shiftEnd && shiftEnd > shiftStart);
  const isClockedIn = Boolean(workerRecord?.isClockedIn);
  const withinShiftWindow =
    hasShift && nowMs >= shiftStart.getTime() && nowMs <= shiftEnd.getTime();
  const clockedOutToday = (() => {
    const out = toDate(workerRecord?.clockedOutAt);
    if (!out) return false;
    return toDayKey(out) === toDayKey(new Date(nowMs));
  })();

  const shiftStatusLabel = (() => {
    if (!hasShift) return "No shift assigned";
    if (withinShiftWindow && isClockedIn) return "In shift now";
    if (withinShiftWindow) return "Shift active - clock in required";
    if (nowMs < shiftStart.getTime()) return "Upcoming shift";
    if (isClockedIn) return "Clocked in (past shift end)";
    return "Shift ended";
  })();

  const handleClockIn = async () => {
    if (!currentUid) return;
    if (clockedOutToday) {
      setClockMessage(
        "You already clocked out today and cannot clock back in.",
      );
      return;
    }
    if (!withinShiftWindow) {
      setClockMessage("Clock in is only available during your assigned shift.");
      return;
    }
    setClockActionLoading(true);
    setClockMessage("");
    try {
      await updateDoc(doc(db, "users", currentUid), {
        isClockedIn: true,
        clockedInAt: serverTimestamp(),
        clockedOutAt: null,
      });
      setWorkerRecord((prev) => ({
        ...(prev || {}),
        isClockedIn: true,
        clockedInAt: new Date(),
        clockedOutAt: null,
      }));
      setClockMessage("Clocked in successfully.");
    } catch (err) {
      console.error("Clock in failed:", err);
      setClockMessage("Failed to clock in.");
    }
    setClockActionLoading(false);
  };

  const handleClockOut = async () => {
    if (!currentUid) return;
    if (!isClockedIn) return;
    setClockActionLoading(true);
    setClockMessage("");
    const clockOutDate = new Date();
    try {
      const clockInDate = toDate(workerRecord?.clockedInAt) || clockOutDate;
      const dayKey = toDayKey(clockInDate);
      await updateDoc(doc(db, "users", currentUid), {
        isClockedIn: false,
        clockedOutAt: serverTimestamp(),
      });
      await setDoc(
        doc(db, "workerAttendance", `${currentUid}_${dayKey}`),
        {
          organizationId,
          workerId: currentUid,
          workerName: userProfile?.name || "Worker",
          dayKey,
          clockInAt: clockInDate,
          clockOutAt: clockOutDate,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setWorkerRecord((prev) => ({
        ...(prev || {}),
        isClockedIn: false,
        clockedOutAt: clockOutDate,
      }));
      setClockMessage("Clocked out successfully.");
    } catch (err) {
      console.error("Clock out failed:", err);
      setClockMessage("Failed to clock out.");
    }
    setClockActionLoading(false);
  };

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((task) => task.completed).length;
  const pendingTasks = totalTasks - doneTasks;

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

            <div className="clock-box">
              <span className="clock-label">Shift Status</span>
              <span className={`clock-status${isClockedIn ? " in" : " out"}`}>
                {shiftStatusLabel}
              </span>
              <p className="clock-window">
                Shift:{" "}
                {hasShift
                  ? `${formatDateTime(shiftStart)} - ${formatDateTime(shiftEnd)}`
                  : "Not assigned"}
              </p>
              <p className="clock-window">
                Clock in: {formatDateTime(workerRecord?.clockedInAt)}
              </p>
              <p className="clock-window">
                Clock out: {formatDateTime(workerRecord?.clockedOutAt)}
              </p>
              <div className="clock-actions">
                <button
                  className="btn-secondary"
                  onClick={handleClockIn}
                  disabled={
                    clockActionLoading ||
                    isClockedIn ||
                    !hasShift ||
                    clockedOutToday
                  }
                >
                  <MdLogin /> Clock In
                </button>
                <button
                  className="btn-secondary"
                  onClick={handleClockOut}
                  disabled={clockActionLoading || !isClockedIn}
                >
                  <MdLogout /> Clock Out
                </button>
              </div>
              {clockMessage && <p className="clock-feedback">{clockMessage}</p>}
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
                <p className="stat-number">{loadingData ? "—" : totalTasks}</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <MdCheckCircle />
              </div>
              <div>
                <p className="stat-label">Completed</p>
                <p className="stat-number">{loadingData ? "—" : doneTasks}</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <MdSchedule />
              </div>
              <div>
                <p className="stat-label">Pending</p>
                <p className="stat-number">
                  {loadingData ? "—" : pendingTasks}
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
            ) : tasks.length === 0 ? (
              <div className="empty-state">
                <p>No tasks yet. Ask your manager to assign work to you.</p>
              </div>
            ) : (
              <div className="recent-projects-list">
                {tasks.map((task) => {
                  const statusLabel = task.completed ? "Done" : "Pending";
                  const taskMaterials = taskMaterialsByTaskId[task.id] || [];
                  return (
                    <div
                      key={task.id}
                      className="recent-project-row"
                      onClick={() =>
                        navigate(
                          `/projects/${task.projectId}/tasks/${task.id}/blueprints`,
                        )
                      }
                    >
                      <span className="rp-icon">
                        <MdAssignment />
                      </span>
                      <div style={{ flex: 1 }}>
                        <div className="rp-name">{task.title || "Task"}</div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginTop: 4,
                          }}
                        >
                          <span style={{ fontSize: 12, color: "#718096" }}>
                            {projectNames[task.projectId] || "Project"}
                          </span>
                          <span style={{ fontSize: 12, color: "#718096" }}>
                            Due: {task.dueDate || "—"}
                          </span>
                          <span style={{ fontSize: 12, color: "#718096" }}>
                            {statusLabel}
                          </span>
                        </div>

                        <div className="worker-task-materials">
                          {taskMaterials.length === 0 ? (
                            <span className="worker-task-materials-empty">
                              No materials attached
                            </span>
                          ) : (
                            taskMaterials.slice(0, 3).map((item) => (
                              <span
                                key={`${task.id}-${item.materialId}`}
                                className="worker-task-material-chip"
                              >
                                {item.materialName}: {item.quantityRequired} {item.unit}
                              </span>
                            ))
                          )}

                          {taskMaterials.length > 3 && (
                            <span className="worker-task-materials-more">
                              +{taskMaterials.length - 3} more
                            </span>
                          )}
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
