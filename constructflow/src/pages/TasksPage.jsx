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
import {
  assignMaterialsToTaskWithDeduction,
  createMaterial,
  listProjectMaterials,
  listTaskMaterialAllocations,
  removeMaterial,
  updateMaterial,
} from "../utils/materialsRepository";
import { DEFAULT_MATERIAL_UNIT, MATERIAL_UNITS } from "../utils/materialsConstants";
import "../styles/TasksPage.css";

const countBlueprintUnits = (objects = {}) => {
  const stats = { total: 0, completed: 0 };

  Object.values(objects).forEach((obj) => {
    const pointTasks = Array.isArray(obj?.pointTasks) ? obj.pointTasks : [];
    const requiredPointTasks = pointTasks.filter((task) => task?.requiredType);

    if (requiredPointTasks.length > 0) {
      stats.total += requiredPointTasks.length;
      stats.completed += requiredPointTasks.filter((task) => task.completed).length;
      return;
    }

    stats.total += 1;
    if (obj?.completed) {
      stats.completed += 1;
    }
  });

  return stats;
};

const getBlueprintCompletion = (blueprint) => {
  const { total, completed } = countBlueprintUnits(blueprint?.objects || {});
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
};

const getTaskCompletion = (taskId, blueprints) => {
  const taskBlueprints = blueprints.filter((blueprint) => blueprint.taskId === taskId);
  if (taskBlueprints.length === 0) return 0;

  const totalPercentage = taskBlueprints.reduce(
    (sum, blueprint) => sum + getBlueprintCompletion(blueprint),
    0,
  );

  return Math.round(totalPercentage / taskBlueprints.length);
};

export default function TasksPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { currentUser, organizationId, isManager } = useAuth();

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [taskBlueprints, setTaskBlueprints] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [projectMaterials, setProjectMaterials] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [materialsError, setMaterialsError] = useState("");
  const [materialNotice, setMaterialNotice] = useState("");
  const [materialNoticeType, setMaterialNoticeType] = useState("info");
  const [taskAllocationsByTaskId, setTaskAllocationsByTaskId] = useState({});
  const [assignMaterialByTaskId, setAssignMaterialByTaskId] = useState({});
  const [assignQtyByTaskId, setAssignQtyByTaskId] = useState({});
  const [assigningTaskId, setAssigningTaskId] = useState("");
  const [taskMaterialNoticeByTaskId, setTaskMaterialNoticeByTaskId] = useState({});

  const [newMaterialName, setNewMaterialName] = useState("");
  const [newMaterialUnit, setNewMaterialUnit] = useState(DEFAULT_MATERIAL_UNIT);
  const [newMaterialQty, setNewMaterialQty] = useState("0");
  const [savingMaterial, setSavingMaterial] = useState(false);

  const [editingMaterialId, setEditingMaterialId] = useState("");
  const [editMaterialName, setEditMaterialName] = useState("");
  const [editMaterialUnit, setEditMaterialUnit] = useState(DEFAULT_MATERIAL_UNIT);
  const [editMaterialQty, setEditMaterialQty] = useState("0");
  const [updatingMaterial, setUpdatingMaterial] = useState(false);
  const [deletingMaterialId, setDeletingMaterialId] = useState("");

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
    const taskList = isManager
      ? tasks
      : tasks.filter((task) => task.assignedWorkerId === currentUser?.uid);

    return taskList.map((task) => ({
      ...task,
      completion: getTaskCompletion(task.id, taskBlueprints),
    }));
  }, [tasks, taskBlueprints, isManager, currentUser?.uid]);

  const safeProjectMaterials = useMemo(
    () =>
      (Array.isArray(projectMaterials) ? projectMaterials : [])
        .filter((material) => material && typeof material === "object")
        .map((material) => ({
          id: String(material.id || ""),
          name: String(material.name || "Unnamed Material"),
          unit: String(material.unit || DEFAULT_MATERIAL_UNIT),
          quantityOnHand: Math.max(0, Number(material.quantityOnHand) || 0),
          status: material.status === "depleted" ? "depleted" : "active",
        })),
    [projectMaterials],
  );

  const materialsById = useMemo(
    () => Object.fromEntries(safeProjectMaterials.map((material) => [material.id, material])),
    [safeProjectMaterials],
  );

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

      const blueprintsQ = query(
        collection(db, "blueprints"),
        where("projectId", "==", projectId),
      );
      const blueprintsSnap = await getDocs(blueprintsQ);
      const blueprints = blueprintsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((blueprint) => blueprint.taskId);
      setTaskBlueprints(blueprints);
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

  const loadProjectMaterials = async () => {
    if (!organizationId || !projectId) return;

    setLoadingMaterials(true);
    setMaterialsError("");
    try {
      const materials = await listProjectMaterials({ organizationId, projectId });
      materials.sort((a, b) =>
        String(a?.name || "").localeCompare(String(b?.name || "")),
      );
      setProjectMaterials(materials);
    } catch (err) {
      console.error("Load project materials:", err);
      setMaterialsError("Failed to load project inventory.");
    }
    setLoadingMaterials(false);
  };

  useEffect(() => {
    loadProjectMaterials();
  }, [organizationId, projectId]);

  const loadTaskMaterialMap = async (taskList = tasks) => {
    if (!organizationId || !projectId) return;

    if (!Array.isArray(taskList) || taskList.length === 0) {
      setTaskAllocationsByTaskId({});
      return;
    }

    try {
      const entries = await Promise.all(
        taskList.map(async (task) => {
          const allocations = await listTaskMaterialAllocations({
            organizationId,
            projectId,
            taskId: task.id,
          });
          return [task.id, allocations];
        }),
      );
      setTaskAllocationsByTaskId(Object.fromEntries(entries));
    } catch (err) {
      console.error("Load task material allocations:", err);
    }
  };

  useEffect(() => {
    loadTaskMaterialMap(tasks);
  }, [tasks, organizationId, projectId]);

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

  const resetMaterialNotice = () => {
    setMaterialNotice("");
    setMaterialNoticeType("info");
  };

  const handleCreateMaterial = async (e) => {
    e.preventDefault();
    const qty = Math.max(0, Number(newMaterialQty) || 0);

    if (!newMaterialName.trim()) {
      setMaterialNotice("Material name is required.");
      setMaterialNoticeType("error");
      return;
    }

    setSavingMaterial(true);
    resetMaterialNotice();
    try {
      await createMaterial({
        organizationId,
        projectId,
        name: newMaterialName,
        unit: newMaterialUnit,
        quantityOnHand: qty,
        createdBy: currentUser?.uid || "",
      });

      setNewMaterialName("");
      setNewMaterialUnit(DEFAULT_MATERIAL_UNIT);
      setNewMaterialQty("0");
      setMaterialNotice("Material added.");
      setMaterialNoticeType("success");
      await loadProjectMaterials();
    } catch (err) {
      setMaterialNotice(err.message || "Failed to add material.");
      setMaterialNoticeType("error");
    }
    setSavingMaterial(false);
  };

  const startMaterialEdit = (material) => {
    setEditingMaterialId(material.id);
    setEditMaterialName(material.name || "");
    setEditMaterialUnit(material.unit || DEFAULT_MATERIAL_UNIT);
    setEditMaterialQty(String(material.quantityOnHand ?? 0));
    resetMaterialNotice();
  };

  const cancelMaterialEdit = () => {
    setEditingMaterialId("");
    setEditMaterialName("");
    setEditMaterialUnit(DEFAULT_MATERIAL_UNIT);
    setEditMaterialQty("0");
  };

  const handleSaveMaterialEdit = async () => {
    if (!editingMaterialId) return;
    if (!editMaterialName.trim()) {
      setMaterialNotice("Material name is required.");
      setMaterialNoticeType("error");
      return;
    }

    setUpdatingMaterial(true);
    resetMaterialNotice();
    try {
      await updateMaterial({
        materialId: editingMaterialId,
        updates: {
          name: editMaterialName,
          unit: editMaterialUnit,
          quantityOnHand: Math.max(0, Number(editMaterialQty) || 0),
        },
      });

      setMaterialNotice("Material updated.");
      setMaterialNoticeType("success");
      cancelMaterialEdit();
      await loadProjectMaterials();
    } catch (err) {
      setMaterialNotice(err.message || "Failed to update material.");
      setMaterialNoticeType("error");
    }
    setUpdatingMaterial(false);
  };

  const handleDeleteMaterial = async (material) => {
    if (!window.confirm(`Remove material \"${material.name}\"?`)) return;

    setDeletingMaterialId(material.id);
    resetMaterialNotice();
    try {
      await removeMaterial({ materialId: material.id });
      setMaterialNotice("Material removed.");
      setMaterialNoticeType("success");
      if (editingMaterialId === material.id) {
        cancelMaterialEdit();
      }
      await loadProjectMaterials();
    } catch (err) {
      setMaterialNotice(err.message || "Failed to remove material.");
      setMaterialNoticeType("error");
    }
    setDeletingMaterialId("");
  };

  const setTaskMaterialNotice = (taskId, message, type = "info") => {
    setTaskMaterialNoticeByTaskId((prev) => ({
      ...prev,
      [taskId]: { message, type },
    }));
  };

  const handleAttachMaterialToTask = async (task) => {
    const selectedMaterialId = assignMaterialByTaskId[task.id] || "";
    const qty = Math.max(0, Number(assignQtyByTaskId[task.id]) || 0);

    if (!selectedMaterialId) {
      setTaskMaterialNotice(task.id, "Select a material first.", "error");
      return;
    }

    if (qty <= 0) {
      setTaskMaterialNotice(task.id, "Quantity must be greater than zero.", "error");
      return;
    }

    const existing = taskAllocationsByTaskId[task.id] || [];
    if (existing.some((allocation) => allocation.materialId === selectedMaterialId)) {
      setTaskMaterialNotice(
        task.id,
        "This material is already attached to the task.",
        "error",
      );
      return;
    }

    const selectedMaterial = materialsById[selectedMaterialId];
    if (!selectedMaterial) {
      setTaskMaterialNotice(task.id, "Selected material is not available.", "error");
      return;
    }

    if (selectedMaterial.quantityOnHand < qty) {
      setTaskMaterialNotice(
        task.id,
        `Not enough stock. Available: ${selectedMaterial.quantityOnHand} ${selectedMaterial.unit}.`,
        "error",
      );
      return;
    }

    setAssigningTaskId(task.id);
    setTaskMaterialNotice(task.id, "", "info");
    try {
      await assignMaterialsToTaskWithDeduction({
        organizationId,
        projectId,
        taskId: task.id,
        allocations: [{ materialId: selectedMaterialId, quantityRequired: qty }],
        performedBy: currentUser?.uid || "",
        note: `Attached to task ${task.title}`,
      });

      setTaskMaterialNotice(task.id, "Material attached to task.", "success");
      setAssignMaterialByTaskId((prev) => ({ ...prev, [task.id]: "" }));
      setAssignQtyByTaskId((prev) => ({ ...prev, [task.id]: "" }));
      await Promise.all([loadProjectMaterials(), loadTaskMaterialMap(tasks)]);
    } catch (err) {
      setTaskMaterialNotice(task.id, err.message || "Failed to attach material.", "error");
    }
    setAssigningTaskId("");
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

          <div className="project-inventory-section">
            <div className="project-inventory-header">
              <h3>Inventory</h3>
              <p>
                {isManager
                  ? "Current stock available for this project."
                  : "Materials currently available in this project."}
              </p>
            </div>

            {isManager && (
              <form className="material-create-form" onSubmit={handleCreateMaterial}>
                <div className="material-create-grid">
                  <input
                    type="text"
                    placeholder="Material name"
                    value={newMaterialName}
                    onChange={(e) => setNewMaterialName(e.target.value)}
                    aria-label="Material name"
                    required
                  />

                  <select
                    value={newMaterialUnit}
                    onChange={(e) => setNewMaterialUnit(e.target.value)}
                    aria-label="Material unit"
                  >
                    {MATERIAL_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="In stock"
                    value={newMaterialQty}
                    onChange={(e) => setNewMaterialQty(e.target.value)}
                    aria-label="Material quantity"
                  />

                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={savingMaterial}
                  >
                    {savingMaterial ? "Adding…" : "Add Material"}
                  </button>
                </div>
              </form>
            )}

            {materialNotice && (
              <p className={`material-notice ${materialNoticeType}`}>{materialNotice}</p>
            )}

            {loadingMaterials ? (
              <div className="tasks-empty">Loading inventory…</div>
            ) : materialsError ? (
              <div className="tasks-empty tasks-empty-error">{materialsError}</div>
            ) : safeProjectMaterials.length === 0 ? (
              <div className="tasks-empty">
                No materials in this project yet.
              </div>
            ) : (
              <div className="project-inventory-table-wrap">
                <table className="project-inventory-table">
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>In Stock</th>
                      <th>Status</th>
                      {isManager && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {safeProjectMaterials.map((material) => (
                      <tr key={material.id}>
                        <td>
                          {editingMaterialId === material.id ? (
                            <input
                              className="inventory-edit-input"
                              type="text"
                              value={editMaterialName}
                              onChange={(e) => setEditMaterialName(e.target.value)}
                            />
                          ) : (
                            material.name
                          )}
                        </td>
                        <td>
                          {editingMaterialId === material.id ? (
                            <div className="inventory-inline-fields">
                              <input
                                className="inventory-edit-input"
                                type="number"
                                min="0"
                                step="0.01"
                                value={editMaterialQty}
                                onChange={(e) => setEditMaterialQty(e.target.value)}
                              />
                              <select
                                className="inventory-edit-input"
                                value={editMaterialUnit}
                                onChange={(e) => setEditMaterialUnit(e.target.value)}
                              >
                                {MATERIAL_UNITS.map((unit) => (
                                  <option key={unit} value={unit}>
                                    {unit}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <>
                              {material.quantityOnHand} {material.unit}
                            </>
                          )}
                        </td>
                        <td>
                          <span
                            className={`material-status-chip ${
                              material.status === "depleted"
                                ? "depleted"
                                : "active"
                            }`}
                          >
                            {material.status === "depleted"
                              ? "Depleted"
                              : "In stock"}
                          </span>
                        </td>

                        {isManager && (
                          <td className="inventory-actions-cell">
                            {editingMaterialId === material.id ? (
                              <>
                                <button
                                  type="button"
                                  className="btn-secondary inventory-action-btn"
                                  onClick={handleSaveMaterialEdit}
                                  disabled={updatingMaterial}
                                >
                                  {updatingMaterial ? "Saving…" : "Save"}
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary inventory-action-btn"
                                  onClick={cancelMaterialEdit}
                                  disabled={updatingMaterial}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="btn-secondary inventory-action-btn"
                                  onClick={() => startMaterialEdit(material)}
                                  disabled={deletingMaterialId === material.id}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary inventory-action-btn danger"
                                  onClick={() => handleDeleteMaterial(material)}
                                  disabled={deletingMaterialId === material.id}
                                >
                                  {deletingMaterialId === material.id ? "Removing…" : "Remove"}
                                </button>
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

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

                    <div className="task-materials-block">
                      <h5>Task Materials</h5>

                      {(taskAllocationsByTaskId[task.id] || []).length === 0 ? (
                        <p className="task-materials-empty">No materials attached.</p>
                      ) : (
                        <ul className="task-materials-list">
                          {(taskAllocationsByTaskId[task.id] || []).map((allocation) => {
                            const material = materialsById[allocation.materialId];
                            return (
                              <li key={`${task.id}-${allocation.materialId}`}>
                                <span>{material?.name || "Material"}</span>
                                <strong>
                                  {allocation.quantityRequired} {material?.unit || "unit"}
                                </strong>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {isManager && (
                        <div className="task-materials-attach-row">
                          <select
                            value={assignMaterialByTaskId[task.id] || ""}
                            onChange={(e) =>
                              setAssignMaterialByTaskId((prev) => ({
                                ...prev,
                                [task.id]: e.target.value,
                              }))
                            }
                            aria-label={`Select material for ${task.title}`}
                          >
                            <option value="">Select material</option>
                            {safeProjectMaterials.map((material) => (
                              <option key={material.id} value={material.id}>
                                {material.name} ({material.quantityOnHand} {material.unit} available)
                              </option>
                            ))}
                          </select>

                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Qty"
                            value={assignQtyByTaskId[task.id] || ""}
                            onChange={(e) =>
                              setAssignQtyByTaskId((prev) => ({
                                ...prev,
                                [task.id]: e.target.value,
                              }))
                            }
                            aria-label={`Material quantity for ${task.title}`}
                          />

                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleAttachMaterialToTask(task)}
                            disabled={assigningTaskId === task.id || safeProjectMaterials.length === 0}
                          >
                            {assigningTaskId === task.id ? "Attaching…" : "Attach"}
                          </button>
                        </div>
                      )}

                      {taskMaterialNoticeByTaskId[task.id]?.message && (
                        <p className={`task-material-notice ${taskMaterialNoticeByTaskId[task.id]?.type || "info"}`}>
                          {taskMaterialNoticeByTaskId[task.id].message}
                        </p>
                      )}
                    </div>

                    <div className="task-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleOpenBlueprint(task)}
                      >
                        Open Blueprint
                      </button>

                      <div
                        className="task-progress"
                        aria-label={`Task progress ${task.completion}%`}
                      >
                        <div className="task-progress-copy">
                          <span>Progress</span>
                          <strong>{task.completion}%</strong>
                        </div>
                        <div className="task-progress-bar" aria-hidden="true">
                          <div
                            className="task-progress-fill"
                            style={{ width: `${task.completion}%` }}
                          />
                        </div>
                      </div>
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
