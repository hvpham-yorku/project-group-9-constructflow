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
} from "react-icons/md";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import "../styles/Dashboard.css";

const ROLE_LABELS = {
  electrician: "Electrician",
  plumber: "Plumber",
};

const ROLE_COLORS = {
  electrician: { bg: "#eff6ff", fg: "#2563eb" },
  plumber: { bg: "#e0e7ff", fg: "#be123c" },
};

export default function WorkerDashboard() {
  const { currentUser, userProfile, organizationId } = useAuth();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState([]); // { id, title, dueDate, projectId, completed }
  const [projectNames, setProjectNames] = useState({}); // { [projectId]: projectName }
  const [loadingData, setLoadingData] = useState(true);

  const currentUid = currentUser?.uid || null;

  useEffect(() => {
    if (!currentUid || !organizationId) return;
    const load = async () => {
      setLoadingData(true);
      try {
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
      } catch (err) {
        console.error("Worker dashboard load:", err);
      }
      setLoadingData(false);
    };
    load();
  }, [currentUid, organizationId]);

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
                  {loadingData ? "—" : totalTasks}
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
                  {loadingData ? "—" : doneTasks}
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
                <p>
                  No tasks yet. Ask your manager to assign work to you.
                </p>
              </div>
            ) : (
              <div className="recent-projects-list">
                {tasks.map((task) => {
                  const statusLabel = task.completed ? "Done" : "Pending";
                  return (
                    <div
                      key={task.id}
                      className="recent-project-row"
                      onClick={() =>
                        navigate(`/projects/${task.projectId}/tasks/${task.id}/blueprints`)
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
