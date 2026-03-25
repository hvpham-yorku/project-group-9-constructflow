import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { MdArrowBack, MdAssignment, MdSchedule, MdPerson } from "react-icons/md";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";
import "../styles/TasksPage.css";

export default function TasksPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { currentUser, organizationId, isManager } = useAuth();

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedWorkerId, setAssignedWorkerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const workersById = useMemo(
    () => Object.fromEntries(workers.map((worker) => [worker.uid, worker])),
    [workers],
  );

  const visibleTasks = useMemo(() => {
    if (isManager) return tasks;
    return tasks.filter((task) => task.assignedWorkerId === currentUser?.uid);
  }, [tasks, isManager, currentUser?.uid]);

  const handleOpenBlueprint = (task) => {
    navigate(`/projects/${projectId}/tasks/${task.id}/blueprints`);
  };

  const loadProjectAndTasks = async () => {
    if (!projectId) return;
    setLoadingData(true);
    try {
      const projectSnap = await getDoc(doc(db, "projects", projectId));
      if (projectSnap.exists()) {
        setProject({ id: projectSnap.id, ...projectSnap.data() });
      } else {
        setProject(null);
      }

      const taskQ = query(collection(db, "tasks"), where("projectId", "==", projectId));
      const taskSnap = await getDocs(taskQ);
      const list = taskSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
      setTasks(list);
    } catch (err) {
      console.error("Load tasks page:", err);
    }
    setLoadingData(false);
  };

  const loadWorkers = async () => {
    if (!organizationId || !isManager) return;
    try {
      const q = query(
        collection(db, "users"),
        where("organizationId", "==", organizationId),
      );
      const snap = await getDocs(q);
      const list = snap.docs
        .map((d) => ({ uid: d.id, ...d.data() }))
        .filter((u) => ["electrician", "plumber"].includes(u.role))
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setWorkers(list);
      if (!assignedWorkerId && list.length > 0) {
        setAssignedWorkerId(list[0].uid);
      }
    } catch (err) {
      console.error("Load workers:", err);
    }
  };

  useEffect(() => {
    loadProjectAndTasks();
  }, [projectId]);

  useEffect(() => {
    loadWorkers();
  }, [organizationId, isManager]);

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (
      !title.trim() ||
      !description.trim() ||
      !dueDate ||
      !assignedWorkerId
    ) {
      setError("Please fill title, description, due date, and assignee.");
      return;
    }

    setError("");
    setSaving(true);
    try {
      await addDoc(collection(db, "tasks"), {
        projectId,
        organizationId,
        title: title.trim(),
        description: description.trim(),
        dueDate,
        assignedWorkerId,
        assignedWorkerName: workersById[assignedWorkerId]?.name || "Worker",
        createdBy: currentUser?.uid || "",
        createdAt: serverTimestamp(),
      });

      setTitle("");
      setDescription("");
      setDueDate("");
      await loadProjectAndTasks();
    } catch (err) {
      setError(err.message || "Failed to create task.");
    }
    setSaving(false);
  };

  return (
    <div className="dashboard">
      <Sidebar />
      <div className="dashboard-content">
        <Header title="Tasks" />

        <div className="tasks-page">
          <div className="tasks-page-header">
            <div>
              <h2>{project?.name || "Project Tasks"}</h2>
              <p>
                {isManager
                  ? "Create and assign tasks to workers."
                  : "Tasks assigned to you by your manager."}
              </p>
            </div>
            <button className="btn-secondary" onClick={() => navigate("/projects")}>
              <MdArrowBack /> Back to Projects
            </button>
          </div>

          {isManager && (
            <form className="task-create-form" onSubmit={handleCreateTask}>
              <div className="task-form-grid">
                <div className="form-group">
                  <label>Task Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group task-assignee-group">
                  <label>Assign Worker</label>
                  <select
                    value={assignedWorkerId}
                    onChange={(e) => setAssignedWorkerId(e.target.value)}
                    required
                  >
                    {workers.length === 0 ? (
                      <option value="">No workers available</option>
                    ) : (
                      workers.map((worker) => (
                        <option key={worker.uid} value={worker.uid}>
                          {worker.name || worker.email}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  required
                />
              </div>

              {error && <p className="task-form-error">{error}</p>}

              <button
                type="submit"
                className="btn-primary"
                disabled={saving || workers.length === 0}
              >
                {saving ? "Creating…" : "Create Task"}
              </button>
            </form>
          )}

          <div className="tasks-section">
            <h3>Task List</h3>

            {loadingData ? (
              <div className="tasks-empty">Loading tasks…</div>
            ) : visibleTasks.length === 0 ? (
              <div className="tasks-empty">
                {isManager
                  ? "No tasks yet. Create the first task for this project."
                  : "No tasks assigned to you in this project yet."}
              </div>
            ) : (
              <div className="tasks-list">
                {visibleTasks.map((task) => (
                  <div key={task.id} className="task-card">
                    <div className="task-card-top">
                      <div className="task-title-wrap">
                        <span className="task-icon">
                          <MdAssignment />
                        </span>
                        <h4>{task.title}</h4>
                      </div>
                    </div>

                    <p className="task-desc">{task.description}</p>

                    <div className="task-meta">
                      <span>
                        <MdSchedule /> Due: {task.dueDate || "—"}
                      </span>
                      <span>
                        <MdPerson /> Worker: {task.assignedWorkerName || workersById[task.assignedWorkerId]?.name || "—"}
                      </span>
                    </div>

                    <div className="task-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleOpenBlueprint(task)}
                      >
                        Open Blueprint
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
