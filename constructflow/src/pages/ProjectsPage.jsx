/**
 * ProjectsPage.jsx
 *
 * Lists all projects for the current user's organisation.
 * Manager can create / delete projects.
 * Clicking a project navigates to its Tasks page.
 * Data is stored in Firestore: /projects/{id}
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  MdFolder,
  MdConstruction,
  MdClose,
  MdArrowForward,
  MdCheckCircle,
} from "react-icons/md";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../contexts/AuthContext";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import "../styles/ProjectsPage.css";

const STATUS_COLORS = {
  active: { bg: "#dcfce7", fg: "#16a34a" },
  completed: { bg: "#dbeafe", fg: "#1d4ed8" },
};

export default function ProjectsPage() {
  const { organizationId, isManager, userProfile } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [filter, setFilter] = useState("all");

  // Create-project modal state
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // ── Fetch projects ──────────────────────────────────────────────────────
  const fetchProjects = async () => {
    if (!organizationId) return;
    setLoadingData(true);
    try {
      const q = query(
        collection(db, "projects"),
        where("organizationId", "==", organizationId),
      );
      const snap = await getDocs(q);
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (!isManager && userProfile?.uid) {
        const taskQ = query(
          collection(db, "tasks"),
          where("assignedWorkerId", "==", userProfile.uid),
        );
        const taskSnap = await getDocs(taskQ);
        const assignedProjectIds = new Set(
          taskSnap.docs
            .map((d) => d.data())
            .filter((task) => task.organizationId === organizationId)
            .map((task) => task.projectId)
            .filter(Boolean),
        );

        list = list.filter((project) => assignedProjectIds.has(project.id));
      }

      list.sort(
        (a, b) =>
          (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0),
      );
      setProjects(list);
    } catch (err) {
      console.error("Fetch projects:", err);
    }
    setLoadingData(false);
  };

  useEffect(() => {
    fetchProjects();
  }, [organizationId, isManager, userProfile?.uid]);

  // ── Create project ──────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return setCreateError("Project name is required.");
    setCreateError("");
    setCreating(true);
    try {
      await addDoc(collection(db, "projects"), {
        name: newName.trim(),
        description: newDesc.trim(),
        organizationId,
        managerId: userProfile?.uid || "",
        status: "active",
        createdAt: serverTimestamp(),
      });
      setNewName("");
      setNewDesc("");
      setShowModal(false);
      await fetchProjects();
    } catch (err) {
      setCreateError(err.message || "Failed to create project.");
    }
    setCreating(false);
  };

  // ── Mark project complete ────────────────────────────────────────────────
  const handleMarkComplete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Mark this project as completed?")) return;
    try {
      await updateDoc(doc(db, "projects", id), { status: "completed" });
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: "completed" } : p)),
      );
    } catch (err) {
      alert("Failed to update project status.");
    }
  };

  // ── Delete project ──────────────────────────────────────────────────────
  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (
      !window.confirm(
        "Delete this project? Blueprints inside it will not be deleted.",
      )
    )
      return;
    try {
      await deleteDoc(doc(db, "projects", id));
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert("Failed to delete project.");
    }
  };

  const filtered =
    filter === "all"
      ? projects
      : projects.filter((p) => (p.status || "active") === filter);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="dashboard">
      <Sidebar />
      <div className="dashboard-content">
        <Header title="Projects" />

        <div className="projects-page">
          <div className="page-header">
            <div>
              <h2>Projects</h2>
              <p className="page-sub">
                {projects.length} project{projects.length !== 1 ? "s" : ""} in
                your organisation
              </p>
            </div>
            {isManager && (
              <button
                className="btn-primary"
                onClick={() => setShowModal(true)}
              >
                + New Project
              </button>
            )}
          </div>

          <div className="projects-filters">
            {["all", "active", "completed"].map((f) => (
              <button
                key={f}
                className={`filter-btn${filter === f ? " active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {loadingData ? (
            <div className="projects-loading">
              <div className="loading-spinner" />
              <p>Loading projects…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="projects-empty">
              <span className="empty-icon">
                <MdFolder />
              </span>
              <h3>
                {filter === "all" ? "No projects yet" : `No ${filter} projects`}
              </h3>
              {isManager && filter === "all" && (
                <p>Create your first project to get started.</p>
              )}
            </div>
          ) : (
            <div className="projects-grid">
              {filtered.map((project) => {
                const status = project.status || "active";
                const sc = STATUS_COLORS[status] || STATUS_COLORS.active;
                return (
                  <div
                    key={project.id}
                    className="project-card"
                    onClick={() => navigate(`/projects/${project.id}/tasks`)}
                  >
                    <div className="project-card-top">
                      <div className="project-card-icon">
                        <MdConstruction />
                      </div>
                      <span
                        className="project-status-badge"
                        style={{ background: sc.bg, color: sc.fg }}
                      >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </div>
                    <h3 className="project-card-name">{project.name}</h3>
                    {project.description && (
                      <p className="project-card-desc">{project.description}</p>
                    )}
                    <div className="project-card-footer">
                      <span className="project-card-date">
                        {project.createdAt?.toDate
                          ? project.createdAt.toDate().toLocaleDateString()
                          : "—"}
                      </span>
                      <div className="project-card-actions">
                        <button
                          className="btn-view"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/projects/${project.id}/tasks`);
                          }}
                        >
                          Open <MdArrowForward />
                        </button>
                        {isManager && status !== "completed" && (
                          <button
                            className="btn-complete-project"
                            onClick={(e) => handleMarkComplete(project.id, e)}
                            title="Mark as completed"
                          >
                            <MdCheckCircle />
                          </button>
                        )}
                        {isManager && (
                          <button
                            className="btn-delete-sm"
                            onClick={(e) => handleDelete(project.id, e)}
                            title="Delete project"
                          >
                            <MdClose />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Create project modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowModal(false)}>
              <MdClose />
            </button>
            <div className="modal-header">
              <div className="modal-logo">
                <MdConstruction />
              </div>
              <h2>New Project</h2>
              <p>Create a project for your organisation</p>
            </div>
            {createError && <div className="error-message">{createError}</div>}
            <form onSubmit={handleCreate} className="auth-form">
              <div className="form-group">
                <label>Project Name</label>
                <input
                  type="text"
                  placeholder=""
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>
                  Description{" "}
                  <span style={{ fontWeight: 400, color: "#a0aec0" }}>
                    (optional)
                  </span>
                </label>
                <input
                  type="text"
                  placeholder=""
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary" disabled={creating}>
                {creating ? "Creating…" : "Create Project"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
