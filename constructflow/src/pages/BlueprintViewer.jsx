/**
 * BlueprintViewer.jsx
 *
 * Role-aware blueprint page (accessed via /projects/:projectId/blueprints)
 *   Manager — full edit: upload, draw pipe/connection/wood, assign, delete, save/update
 *   Worker  — read-only: select blueprint, view assigned elements, mark own elements complete
 *
 * Three drawing types:
 *   pipe       → plumbers    (blue)
 *   connection → electricians (yellow)
 *   wood       → carpenters  (brown)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import BlueprintCanvas from "../components/BlueprintCanvas";
import {
  MdSave,
  MdExpandMore,
  MdArrowBack,
  MdPerson,
  MdEdit,
  MdImage,
  MdUpload,
} from "react-icons/md";
import { storage, db } from "../firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import "../styles/BlueprintViewer.css";

const LS_KEY = "cf_last_blueprint_id";

let _nextId = 1;
const makeId = () => `obj-${Date.now()}-${_nextId++}`;

// Type → trade mapping
const TYPE_TRADE = {
  pipe: "plumber",
  connection: "electrician",
  wood: "carpenter",
};

const TYPE_LABELS = {
  pipe: "Pipe",
  connection: "Connection",
  wood: "Wood",
};

export default function BlueprintViewer() {
  const { currentUser, userProfile, isManager, organizationId } = useAuth();
  const { projectId } = useParams();
  const navigate = useNavigate();

  const isAuthenticated = Boolean(currentUser);
  const isWorker = isAuthenticated && !isManager;
  const currentUid = currentUser?.uid || null;
  // Worker trade role (null for manager)
  const workerTrade = isWorker ? userProfile?.role : null;

  // ── Blueprint state ──────────────────────────────────────────────────
  const [blueprintName, setBlueprintName] = useState("");
  const [blueprintImage, setBlueprintImage] = useState(null);
  const [currentBlueprintId, setCurrentBlueprintId] = useState(null);
  const [objects, setObjects] = useState([]);
  const [isDirty, setIsDirty] = useState(false);

  // ── Drawing state ────────────────────────────────────────────────────
  const [activeObjectId, setActiveObjectId] = useState(null);
  const [selectedObjectId, setSelectedObjectId] = useState(null);

  // ── UI state ─────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Data ─────────────────────────────────────────────────────────────
  const [workers, setWorkers] = useState({
    plumbers: [],
    electricians: [],
    carpenters: [],
  });
  const [savedBlueprints, setSavedBlueprints] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // ── Dirty tracking ───────────────────────────────────────────────────
  const [objectsInitialized, setObjectsInitialized] = useState(false);
  useEffect(() => {
    if (!isManager) return;
    if (!objectsInitialized) {
      setObjectsInitialized(true);
      return;
    }
    setIsDirty(true);
  }, [objects]); // eslint-disable-line

  // ── Unsaved-changes guard: browser close ─────────────────────────────
  useEffect(() => {
    if (!isManager) return;
    const handler = (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, isManager]);

  // ── Unsaved-changes guard: React Router nav ──────────────────────────
  useEffect(() => {
    if (!isManager || !isDirty) return;
    const handleClick = (e) => {
      const anchor = e.target.closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.includes("/blueprints")) return;
      e.preventDefault();
      if (window.confirm("You have unsaved changes. Leave without saving?")) {
        setIsDirty(false);
        navigate(href);
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isDirty, isManager, navigate]);

  // ── Close dropdown on outside click ─────────────────────────────────
  useEffect(() => {
    if (!showDropdown) return;
    const handleOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showDropdown]);

  // ── Fetch workers (org-scoped, manager only) ─────────────────────────
  useEffect(() => {
    if (!isManager || !organizationId) return;
    const fetch = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "users"),
            where("organizationId", "==", organizationId),
            where("role", "in", ["plumber", "electrician", "carpenter"]),
          ),
        );
        const plumbers = [],
          electricians = [],
          carpenters = [];
        snap.forEach((d) => {
          const data = { uid: d.id, ...d.data() };
          if (data.role === "plumber") plumbers.push(data);
          else if (data.role === "electrician") electricians.push(data);
          else if (data.role === "carpenter") carpenters.push(data);
        });
        setWorkers({ plumbers, electricians, carpenters });
      } catch (err) {
        console.error("Fetch workers:", err);
      }
    };
    fetch();
  }, [isManager, organizationId]);

  // ── Fetch blueprints for this project ───────────────────────────────
  const fetchBlueprints = useCallback(async () => {
    if (!projectId) return [];
    try {
      const snap = await getDocs(
        query(
          collection(db, "blueprints"),
          where("projectId", "==", projectId),
        ),
      );
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort(
        (a, b) =>
          (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0),
      );
      setSavedBlueprints(list);
      return list;
    } catch (err) {
      console.error("Fetch blueprints:", err);
      return [];
    }
  }, [projectId]);

  // ── On mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchBlueprints().then((list) => {
      const lastId = localStorage.getItem(LS_KEY);
      if (lastId) {
        const bp = list.find((b) => b.id === lastId);
        if (bp) loadBlueprintData(bp);
      }
    });
  }, [isAuthenticated, fetchBlueprints]);

  // ── Load blueprint (internal) ─────────────────────────────────────
  const loadBlueprintData = (bp) => {
    setActiveObjectId(null);
    setSelectedObjectId(null);
    setBlueprintName(bp.name || "");
    setBlueprintImage(bp.imageUrl || null);
    setCurrentBlueprintId(bp.id);
    const objs = Object.entries(bp.objects || {}).map(([id, obj]) => ({
      id,
      ...obj,
      drawing: false,
    }));
    setObjects(objs);
    setObjectsInitialized(false);
    setIsDirty(false);
    localStorage.setItem(LS_KEY, bp.id);
  };

  const loadBlueprint = (bp) => {
    if (isManager && isDirty) {
      if (
        !window.confirm("You have unsaved changes. Load a different blueprint?")
      )
        return;
    }
    setShowDropdown(false);
    loadBlueprintData(bp);
  };

  // ── Delete blueprint (manager only) ─────────────────────────────────
  const deleteBlueprint = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this blueprint permanently?")) return;
    try {
      await deleteDoc(doc(db, "blueprints", id));
      setSavedBlueprints((prev) => prev.filter((b) => b.id !== id));
      if (currentBlueprintId === id) {
        setCurrentBlueprintId(null);
        setBlueprintName("");
        setBlueprintImage(null);
        setObjects([]);
        setIsDirty(false);
        localStorage.removeItem(LS_KEY);
      }
    } catch {
      alert("Failed to delete blueprint.");
    }
  };

  // ── Create new (reset) ────────────────────────────────────────────
  const createNewBlueprint = () => {
    if (isManager && isDirty) {
      if (
        !window.confirm(
          "You have unsaved changes. Start a new blueprint anyway?",
        )
      )
        return;
    }
    setBlueprintName("");
    setBlueprintImage(null);
    setCurrentBlueprintId(null);
    setObjects([]);
    setObjectsInitialized(false);
    setIsDirty(false);
    localStorage.removeItem(LS_KEY);
  };

  // ── Image upload (manager only) ───────────────────────────────────
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    try {
      const storageRef = ref(storage, `blueprints/${file.name}-${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setBlueprintImage(url);
      setCurrentBlueprintId(null);
      setObjects([]);
      setIsDirty(false);
      setObjectsInitialized(false);
      if (!blueprintName) setBlueprintName(file.name.replace(/\.[^.]+$/, ""));
    } catch {
      alert("Failed to upload image.");
    }
    setLoading(false);
  };

  // ── Drawing ───────────────────────────────────────────────────────
  const startDrawing = (type) => {
    if (!blueprintImage) {
      alert("Upload a blueprint image first.");
      return;
    }
    if (activeObjectId) cancelActiveDrawing();
    const id = makeId();
    setObjects((prev) => [
      ...prev,
      {
        id,
        type,
        pathPoints: [],
        assignedTo: null,
        assignedToName: null,
        completed: false,
        drawing: true,
      },
    ]);
    setActiveObjectId(id);
    setSelectedObjectId(id);
  };

  const cancelActiveDrawing = () => {
    setObjects((prev) => {
      const active = prev.find((o) => o.id === activeObjectId);
      if (!active) return prev;
      if (active.pathPoints.length === 0)
        return prev.filter((o) => o.id !== activeObjectId);
      return prev.map((o) =>
        o.id === activeObjectId ? { ...o, drawing: false } : o,
      );
    });
    setActiveObjectId(null);
  };

  const handlePathUpdate = (id, points) =>
    setObjects((prev) =>
      prev.map((o) => (o.id === id ? { ...o, pathPoints: points } : o)),
    );

  const handleFinishDrawing = (id) => {
    setObjects((prev) =>
      prev.map((o) => (o.id === id ? { ...o, drawing: false } : o)),
    );
    setActiveObjectId(null);
  };

  const deleteObject = (id) => {
    if (id === activeObjectId) setActiveObjectId(null);
    if (id === selectedObjectId) setSelectedObjectId(null);
    setObjects((prev) => prev.filter((o) => o.id !== id));
  };

  // ── Assign worker (manager only) ─────────────────────────────────
  const assignWorker = (workerId) => {
    const all = [
      ...workers.plumbers,
      ...workers.electricians,
      ...workers.carpenters,
    ];
    const worker = all.find((w) => w.uid === workerId);
    if (!worker) return;
    setObjects((prev) =>
      prev.map((o) =>
        o.id === selectedObjectId
          ? { ...o, assignedTo: worker.uid, assignedToName: worker.name }
          : o,
      ),
    );
  };

  // ── Mark complete ─────────────────────────────────────────────────
  const toggleComplete = (id) => {
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;
    if (isWorker && (obj.assignedTo !== currentUid || !currentUid)) return;
    const newCompleted = !obj.completed;
    setObjects((prev) =>
      prev.map((o) => (o.id === id ? { ...o, completed: newCompleted } : o)),
    );
    if (isWorker && currentBlueprintId) {
      persistCompletion(id, newCompleted);
    }
  };

  const persistCompletion = async (objId, completed) => {
    try {
      const bp = savedBlueprints.find((b) => b.id === currentBlueprintId);
      if (!bp) return;
      const updatedObjects = { ...bp.objects };
      if (updatedObjects[objId])
        updatedObjects[objId] = { ...updatedObjects[objId], completed };
      await updateDoc(doc(db, "blueprints", currentBlueprintId), {
        objects: updatedObjects,
      });
      setSavedBlueprints((prev) =>
        prev.map((b) =>
          b.id === currentBlueprintId ? { ...b, objects: updatedObjects } : b,
        ),
      );
    } catch (err) {
      console.error("Failed to persist completion:", err);
    }
  };

  // ── Save / update (manager only) ─────────────────────────────────
  const saveBlueprint = async () => {
    if (!blueprintImage || !blueprintName.trim()) {
      alert("Please upload an image and provide a name.");
      return;
    }
    setSaving(true);
    try {
      const objectsMap = {};
      objects.forEach((obj) => {
        objectsMap[obj.id] = {
          type: obj.type,
          pathPoints: obj.pathPoints,
          assignedTo: obj.assignedTo || null,
          assignedToName: obj.assignedToName || null,
          completed: obj.completed,
        };
      });
      const data = {
        name: blueprintName.trim(),
        imageUrl: blueprintImage,
        objects: objectsMap,
        projectId,
        organizationId,
        updatedAt: new Date(),
      };
      let savedId = currentBlueprintId;
      if (currentBlueprintId) {
        await updateDoc(doc(db, "blueprints", currentBlueprintId), data);
      } else {
        const docRef = await addDoc(collection(db, "blueprints"), {
          ...data,
          createdAt: new Date(),
        });
        savedId = docRef.id;
        setCurrentBlueprintId(savedId);
      }
      localStorage.setItem(LS_KEY, savedId);
      await fetchBlueprints();
      setIsDirty(false);
      alert("Blueprint saved!");
    } catch {
      alert("Failed to save blueprint.");
    }
    setSaving(false);
  };

  // ── Derived ───────────────────────────────────────────────────────
  const selectedObject = objects.find((o) => o.id === selectedObjectId) || null;
  const activeType = activeObjectId
    ? objects.find((o) => o.id === activeObjectId)?.type
    : null;
  const isDrawingPipe = activeType === "pipe";
  const isDrawingConnection = activeType === "connection";
  const isDrawingWood = activeType === "wood";

  const canvasObjects = objects.map((obj) => ({
    ...obj,
    isOwn: isWorker && currentUid !== null && obj.assignedTo === currentUid,
  }));

  // Worker-specific filtering: only show elements relevant to them
  // (they can see all but only interact with their own)
  const workerListObjects =
    isWorker && workerTrade
      ? objects.filter(
          (o) =>
            TYPE_TRADE[o.type] === workerTrade || o.assignedTo === currentUid,
        )
      : objects;

  // Workers for the selected element type
  const workersForType = selectedObject
    ? selectedObject.type === "pipe"
      ? workers.plumbers
      : selectedObject.type === "connection"
        ? workers.electricians
        : workers.carpenters
    : [];

  if (!isAuthenticated) {
    return (
      <div className="dashboard">
        <Sidebar />
        <div className="dashboard-content">
          <div className="sign-in-message">Sign in to view blueprints.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <Sidebar />
      <div className="dashboard-content">
        <Header title="Blueprint Planner" />

        <div className="blueprint-viewer">
          {/* ── Toolbar ── */}
          <div className="blueprint-toolbar">
            {/* Back to projects */}
            <button
              className="btn-back"
              onClick={() => navigate("/projects")}
              title="Back to Projects"
            >
              <MdArrowBack /> Projects
            </button>

            {/* Blueprint name */}
            <input
              type="text"
              placeholder="Blueprint Name"
              value={blueprintName}
              onChange={(e) => isManager && setBlueprintName(e.target.value)}
              className={`blueprint-name-input${isWorker ? " readonly" : ""}`}
              readOnly={isWorker}
            />

            {/* Manager-only controls */}
            {isManager && (
              <>
                {!blueprintImage && (
                  <label
                    className={`btn-secondary${loading ? " disabled" : ""}`}
                  >
                    {loading ? (
                      "Uploading…"
                    ) : (
                      <>
                        <MdUpload className="icon" /> Upload Image
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      style={{ display: "none" }}
                      disabled={loading}
                    />
                  </label>
                )}
                {blueprintImage && (
                  <span className="image-set-badge" title="Image uploaded">
                    <MdImage className="icon" /> Image set
                  </span>
                )}

                <button
                  className={`btn-secondary draw-btn pipe-btn${isDrawingPipe ? " active" : ""}`}
                  onClick={() =>
                    isDrawingPipe ? cancelActiveDrawing() : startDrawing("pipe")
                  }
                  disabled={!blueprintImage}
                  title="Draw pipe (Plumbers)"
                >
                  <span className="draw-icon pipe-icon" />
                  {isDrawingPipe ? "Cancel Pipe" : "Draw Pipe"}
                </button>

                <button
                  className={`btn-secondary draw-btn connection-btn${isDrawingConnection ? " active" : ""}`}
                  onClick={() =>
                    isDrawingConnection
                      ? cancelActiveDrawing()
                      : startDrawing("connection")
                  }
                  disabled={!blueprintImage}
                  title="Draw wiring (Electricians)"
                >
                  <span className="draw-icon connection-icon" />
                  {isDrawingConnection ? "Cancel Wiring" : "Draw Wiring"}
                </button>

                <button
                  className={`btn-secondary draw-btn wood-btn${isDrawingWood ? " active" : ""}`}
                  onClick={() =>
                    isDrawingWood ? cancelActiveDrawing() : startDrawing("wood")
                  }
                  disabled={!blueprintImage}
                  title="Draw wood (Carpenters)"
                >
                  <span className="draw-icon wood-icon" />
                  {isDrawingWood ? "Cancel Wood" : "Draw Wood"}
                </button>

                <button
                  className="btn-secondary"
                  onClick={createNewBlueprint}
                  title="New blank blueprint"
                >
                  + New
                </button>

                <button
                  className={`btn-secondary save-btn${isDirty ? " dirty" : ""}`}
                  onClick={saveBlueprint}
                  disabled={saving || !blueprintImage}
                >
                  <MdSave className="icon" />
                  {saving ? "Saving…" : currentBlueprintId ? "Update" : "Save"}
                  {isDirty && (
                    <span className="dirty-dot" title="Unsaved changes" />
                  )}
                </button>
              </>
            )}

            {/* Blueprint selector */}
            <div className="blueprint-selector" ref={dropdownRef}>
              <button
                className="btn-secondary selector-btn"
                onClick={() => setShowDropdown((v) => !v)}
              >
                <MdExpandMore className="icon" />
                {currentBlueprintId
                  ? savedBlueprints.find((b) => b.id === currentBlueprintId)
                      ?.name || "Blueprints"
                  : savedBlueprints.length > 0
                    ? "Select Blueprint"
                    : "No blueprints"}
              </button>
              {showDropdown && (
                <div className="blueprint-dropdown">
                  <div className="dropdown-header">Blueprints</div>
                  {savedBlueprints.length === 0 && (
                    <div className="dropdown-empty">
                      No blueprints saved yet.
                    </div>
                  )}
                  {savedBlueprints.map((bp) => (
                    <div
                      key={bp.id}
                      className={`dropdown-item${currentBlueprintId === bp.id ? " current" : ""}`}
                      onClick={() => loadBlueprint(bp)}
                    >
                      <span className="dropdown-item-name">{bp.name}</span>
                      <span className="dropdown-item-count">
                        {Object.keys(bp.objects || {}).length} elements
                      </span>
                      {isManager && (
                        <button
                          className="dropdown-delete"
                          onClick={(e) => deleteBlueprint(bp.id, e)}
                          title="Delete"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* ── Hint bar — always same height so toolbar never shifts ── */}
          <div className="blueprint-hint-bar">
            {activeObjectId ? (
              <span className="hint-chip drawing-hint">
                ✏️ Click to add points · Double-click to finish · Ctrl+Z undo
              </span>
            ) : isWorker && blueprintImage ? (
              <span className="hint-chip worker-hint">
                🟡 Highlighted = assigned to you · Click "Mark Done" to complete
              </span>
            ) : null}
          </div>

          {/* ── Main area ── */}
          <div className="blueprint-main">
            <div className="blueprint-canvas-container">
              <BlueprintCanvas
                imageUrl={blueprintImage}
                objects={canvasObjects}
                activeObjectId={isManager ? activeObjectId : null}
                selectedObjectId={selectedObjectId}
                onPathUpdate={isManager ? handlePathUpdate : undefined}
                onFinishDrawing={isManager ? handleFinishDrawing : undefined}
                onObjectSelected={(obj) => {
                  if (!activeObjectId) setSelectedObjectId(obj.id);
                }}
                isWorker={isWorker}
              />
            </div>

            {/* Right panel */}
            <div className="blueprint-sidebar">
              <h3>
                Elements{" "}
                <span className="element-count">({objects.length})</span>
              </h3>

              <div className="sections-list">
                {objects.length === 0 && (
                  <p className="no-sections">
                    {isManager ? (
                      <>
                        No elements yet.
                        <br />
                        Upload an image then draw pipes, connections, or wood.
                      </>
                    ) : (
                      "Select a blueprint to view elements."
                    )}
                  </p>
                )}

                {objects.map((obj) => {
                  const isOwn =
                    isWorker &&
                    currentUid !== null &&
                    obj.assignedTo === currentUid;
                  const canComplete = isManager || isOwn;
                  return (
                    <div
                      key={obj.id}
                      className={`section-card ${obj.type}${selectedObjectId === obj.id ? " active" : ""}${obj.drawing ? " drawing-active" : ""}${isOwn ? " own-element" : ""}`}
                      onClick={() => {
                        if (!activeObjectId) setSelectedObjectId(obj.id);
                      }}
                    >
                      <div className="section-header">
                        <div className="section-title">
                          <span
                            className={`type-dot ${obj.type}${isOwn ? " own" : ""}`}
                          />
                          <span className="section-type-label">
                            {TYPE_LABELS[obj.type] || obj.type}
                            {obj.drawing && (
                              <span className="drawing-badge">
                                <MdEdit
                                  style={{
                                    verticalAlign: "middle",
                                    marginLeft: 4,
                                  }}
                                />
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="section-actions-inline">
                          {canComplete && !obj.drawing && (
                            <button
                              className={`btn-complete${obj.completed ? " done" : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleComplete(obj.id);
                              }}
                              title={
                                obj.completed ? "Mark pending" : "Mark complete"
                              }
                            >
                              {obj.completed ? "✓ Done" : "Mark Done"}
                            </button>
                          )}
                          {!canComplete && (
                            <span
                              className={`section-status${obj.completed ? " completed" : ""}`}
                            >
                              {obj.completed ? "Done" : "Pending"}
                            </span>
                          )}
                          {isManager && (
                            <button
                              className="btn-icon-sm delete-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteObject(obj.id);
                              }}
                              title="Delete"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="section-meta">
                        {obj.assignedTo ? (
                          <span
                            className={`assigned-worker${isOwn ? " own" : ""}`}
                          >
                            <MdPerson
                              style={{
                                verticalAlign: "middle",
                                marginRight: 2,
                              }}
                            />
                            {isOwn ? "You" : obj.assignedToName}
                          </span>
                        ) : (
                          <span className="unassigned">Unassigned</span>
                        )}
                        {obj.pathPoints?.length > 0 && (
                          <span className="point-count">
                            {obj.pathPoints.length} pts
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Assignment panel — manager only */}
              {isManager && selectedObject && !selectedObject.drawing && (
                <div className="assignment-panel">
                  <h4>
                    Assign {TYPE_LABELS[selectedObject.type]}
                    <span className="worker-type-hint">
                      {selectedObject.type === "pipe"
                        ? " (Plumbers)"
                        : selectedObject.type === "connection"
                          ? " (Electricians)"
                          : " (Carpenters)"}
                    </span>
                  </h4>
                  <select
                    value={selectedObject.assignedTo || ""}
                    onChange={(e) => assignWorker(e.target.value)}
                  >
                    <option value="">— Select Worker —</option>
                    {workersForType.map((w) => (
                      <option key={w.uid} value={w.uid}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                  {workersForType.length === 0 && (
                    <p className="no-workers-hint">
                      No{" "}
                      {selectedObject.type === "pipe"
                        ? "plumbers"
                        : selectedObject.type === "connection"
                          ? "electricians"
                          : "carpenters"}{" "}
                      in this organisation.
                    </p>
                  )}
                </div>
              )}

              {isWorker &&
                selectedObject &&
                !selectedObject.drawing &&
                selectedObject.assignedTo !== currentUid && (
                  <div className="assignment-panel readonly">
                    <p className="readonly-hint">
                      This element is not assigned to you.
                    </p>
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
