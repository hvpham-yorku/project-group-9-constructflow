/**
 * BlueprintViewer.jsx
 *
 * Role-aware blueprint page:
 *   Admin  — full edit: upload, draw, assign, delete, mark complete, save/update
 *   Worker — read-only: select blueprint, see elements, mark OWN elements complete
 *
 * Unsaved-changes guard fires on browser close AND React Router navigation (admin only).
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import BlueprintCanvas from "../components/BlueprintCanvas";
import { MdUpload, MdSave, MdExpandMore } from "react-icons/md";
import { storage, db } from "../firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where,
} from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import "../styles/BlueprintViewer.css";

let _nextId = 1;
const makeId = () => `obj-${Date.now()}-${_nextId++}`;

function BlueprintViewer() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();

  const isAdmin  = userProfile?.role === "admin";
  const isWorker = !isAdmin; // plumber or electrician
  const currentUid = userProfile?.uid || null;

  // ── Blueprint state ──────────────────────────────────────────────────────
  const [blueprintName, setBlueprintName]       = useState("");
  const [blueprintImage, setBlueprintImage]     = useState(null);
  const [currentBlueprintId, setCurrentBlueprintId] = useState(null);
  const [objects, setObjects]                   = useState([]);
  const [isDirty, setIsDirty]                   = useState(false); // unsaved changes

  // ── Drawing state (admin only) ───────────────────────────────────────────
  const [activeObjectId, setActiveObjectId]     = useState(null);
  const [selectedObjectId, setSelectedObjectId] = useState(null);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);

  // ── Data ─────────────────────────────────────────────────────────────────
  const [workers, setWorkers]                   = useState({ plumbers: [], electricians: [] });
  const [savedBlueprints, setSavedBlueprints]   = useState([]);
  const [showDropdown, setShowDropdown]         = useState(false);

  // ── Mark dirty whenever objects change (admin only) ──────────────────────
  // We use a ref trick: skip the very first render
  const [objectsInitialized, setObjectsInitialized] = useState(false);
  useEffect(() => {
    if (!isAdmin) return;
    if (!objectsInitialized) { setObjectsInitialized(true); return; }
    setIsDirty(true);
  }, [objects]);

  // ── Unsaved-changes guard: browser close / refresh ───────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    const handler = (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, isAdmin]);

  // ── Unsaved-changes guard: React Router navigation ───────────────────────
  // We intercept Link clicks by listening to popstate + click on nav links
  useEffect(() => {
    if (!isAdmin || !isDirty) return;
    const handleClick = (e) => {
      const anchor = e.target.closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href === "/blueprint") return;
      e.preventDefault();
      if (window.confirm("You have unsaved changes. Leave without saving?")) {
        setIsDirty(false);
        navigate(href);
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isDirty, isAdmin, navigate]);

  // ── Fetch workers ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    const fetch = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "users"), where("role", "in", ["plumber", "electrician"]))
        );
        const plumbers = [], electricians = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data.role === "plumber") plumbers.push(data);
          else electricians.push(data);
        });
        setWorkers({ plumbers, electricians });
      } catch (err) { console.error("Fetch workers:", err); }
    };
    fetch();
  }, [isAdmin]);

  // ── Fetch blueprints list ────────────────────────────────────────────────
  const fetchBlueprints = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, "blueprints"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setSavedBlueprints(list);
    } catch (err) { console.error("Fetch blueprints:", err); }
  }, []);

  useEffect(() => { fetchBlueprints(); }, [fetchBlueprints]);

  // ── Load blueprint ───────────────────────────────────────────────────────
  const loadBlueprint = (bp) => {
    if (isAdmin && isDirty) {
      if (!window.confirm("You have unsaved changes. Load a different blueprint?")) return;
    }
    setShowDropdown(false);
    setActiveObjectId(null);
    setSelectedObjectId(null);
    setBlueprintName(bp.name || "");
    setBlueprintImage(bp.imageUrl || null);
    setCurrentBlueprintId(bp.id);
    const objs = Object.entries(bp.objects || {}).map(([id, obj]) => ({
      id, ...obj, drawing: false,
    }));
    setObjects(objs);
    setObjectsInitialized(false); // reset dirty tracking
    setIsDirty(false);
  };

  // ── Delete blueprint (admin only) ────────────────────────────────────────
  const deleteBlueprint = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this blueprint permanently?")) return;
    try {
      await deleteDoc(doc(db, "blueprints", id));
      setSavedBlueprints((prev) => prev.filter((b) => b.id !== id));
      if (currentBlueprintId === id) {
        setCurrentBlueprintId(null); setBlueprintName(""); setBlueprintImage(null); setObjects([]);
        setIsDirty(false);
      }
    } catch (err) { alert("Failed to delete blueprint."); }
  };

  // ── Image upload (admin only) ────────────────────────────────────────────
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
    } catch (err) { alert("Failed to upload image."); }
    setLoading(false);
  };

  // ── Drawing (admin only) ─────────────────────────────────────────────────
  const startDrawing = (type) => {
    if (!blueprintImage) { alert("Upload a blueprint image first."); return; }
    if (activeObjectId) cancelActiveDrawing();
    const id = makeId();
    setObjects((prev) => [
      ...prev,
      { id, type, pathPoints: [], assignedTo: null, assignedToName: null, completed: false, drawing: true },
    ]);
    setActiveObjectId(id);
    setSelectedObjectId(id);
  };

  const cancelActiveDrawing = () => {
    setObjects((prev) => {
      const active = prev.find((o) => o.id === activeObjectId);
      if (!active) return prev;
      if (active.pathPoints.length === 0) return prev.filter((o) => o.id !== activeObjectId);
      return prev.map((o) => o.id === activeObjectId ? { ...o, drawing: false } : o);
    });
    setActiveObjectId(null);
  };

  const handlePathUpdate   = (id, points) =>
    setObjects((prev) => prev.map((o) => o.id === id ? { ...o, pathPoints: points } : o));

  const handleFinishDrawing = (id) => {
    setObjects((prev) => prev.map((o) => o.id === id ? { ...o, drawing: false } : o));
    setActiveObjectId(null);
  };

  const deleteObject = (id) => {
    if (id === activeObjectId)  setActiveObjectId(null);
    if (id === selectedObjectId) setSelectedObjectId(null);
    setObjects((prev) => prev.filter((o) => o.id !== id));
  };

  // ── Assign worker (admin only) ───────────────────────────────────────────
  const assignWorker = (workerId) => {
    const all = [...workers.plumbers, ...workers.electricians];
    const worker = all.find((w) => w.uid === workerId);
    if (!worker) return;
    setObjects((prev) =>
      prev.map((o) =>
        o.id === selectedObjectId
          ? { ...o, assignedTo: worker.uid, assignedToName: worker.name }
          : o
      )
    );
  };

  // ── Mark complete ────────────────────────────────────────────────────────
  // Admin: any element. Worker: only elements assigned to them.
  const toggleComplete = (id) => {
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;
    if (isWorker && obj.assignedTo !== currentUid) return; // workers can only touch their own
    setObjects((prev) =>
      prev.map((o) => o.id === id ? { ...o, completed: !o.completed } : o)
    );
    // For workers, persist immediately to Firestore
    if (isWorker && currentBlueprintId) {
      persistCompletion(id, !obj.completed);
    }
  };

  const persistCompletion = async (objId, completed) => {
    try {
      const bp = savedBlueprints.find((b) => b.id === currentBlueprintId);
      if (!bp) return;
      const updatedObjects = { ...bp.objects };
      if (updatedObjects[objId]) updatedObjects[objId] = { ...updatedObjects[objId], completed };
      await updateDoc(doc(db, "blueprints", currentBlueprintId), { objects: updatedObjects });
      // Refresh local list
      setSavedBlueprints((prev) =>
        prev.map((b) => b.id === currentBlueprintId ? { ...b, objects: updatedObjects } : b)
      );
    } catch (err) { console.error("Failed to persist completion:", err); }
  };

  // ── Save / update (admin only) ───────────────────────────────────────────
  const saveBlueprint = async () => {
    if (!blueprintImage || !blueprintName.trim()) {
      alert("Please upload an image and provide a name."); return;
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
      const data = { name: blueprintName.trim(), imageUrl: blueprintImage, objects: objectsMap, updatedAt: new Date() };
      if (currentBlueprintId) {
        await updateDoc(doc(db, "blueprints", currentBlueprintId), data);
      } else {
        const docRef = await addDoc(collection(db, "blueprints"), { ...data, createdAt: new Date() });
        setCurrentBlueprintId(docRef.id);
      }
      await fetchBlueprints();
      setIsDirty(false);
      alert("Blueprint saved!");
    } catch (err) { alert("Failed to save blueprint."); }
    setSaving(false);
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  const selectedObject      = objects.find((o) => o.id === selectedObjectId) || null;
  const isDrawingPipe       = activeObjectId && objects.find((o) => o.id === activeObjectId)?.type === "pipe";
  const isDrawingConnection = activeObjectId && objects.find((o) => o.id === activeObjectId)?.type === "connection";

  // For canvas: pass currentUid so it can color worker's own elements yellow
  const canvasObjects = objects.map((obj) => ({
    ...obj,
    isOwn: isWorker && obj.assignedTo === currentUid,
  }));

  return (
    <div className="dashboard">
      <Sidebar />
      <div className="dashboard-content">
        <Header title="Blueprint Planner" role={isAdmin ? "manager" : "worker"} />

        <div className="blueprint-viewer">
          {/* ── Toolbar ── */}
          <div className="blueprint-toolbar">

            {/* Blueprint name — editable for admin, readonly for worker */}
            <input
              type="text"
              placeholder="Blueprint Name"
              value={blueprintName}
              onChange={(e) => isAdmin && setBlueprintName(e.target.value)}
              className={`blueprint-name-input${isWorker ? " readonly" : ""}`}
              readOnly={isWorker}
            />

            {/* Admin-only controls */}
            {isAdmin && (
              <>
                <label className={`btn-secondary${loading ? " disabled" : ""}`}>
                  <MdUpload className="icon" /> Upload Image
                  <input type="file" accept="image/*" onChange={handleImageUpload}
                    style={{ display: "none" }} disabled={loading} />
                </label>

                <button
                  className={`btn-secondary draw-btn pipe-btn${isDrawingPipe ? " active" : ""}`}
                  onClick={() => isDrawingPipe ? cancelActiveDrawing() : startDrawing("pipe")}
                  disabled={!blueprintImage}
                >
                  <span className="draw-icon pipe-icon" />
                  {isDrawingPipe ? "Cancel Pipe" : "Draw Pipe"}
                </button>

                <button
                  className={`btn-secondary draw-btn connection-btn${isDrawingConnection ? " active" : ""}`}
                  onClick={() => isDrawingConnection ? cancelActiveDrawing() : startDrawing("connection")}
                  disabled={!blueprintImage}
                >
                  <span className="draw-icon connection-icon" />
                  {isDrawingConnection ? "Cancel Connection" : "Draw Connection"}
                </button>

                <button
                  className={`btn-secondary save-btn${isDirty ? " dirty" : ""}`}
                  onClick={saveBlueprint}
                  disabled={saving || !blueprintImage}
                >
                  <MdSave className="icon" />
                  {saving ? "Saving…" : currentBlueprintId ? "Update" : "Save"}
                  {isDirty && <span className="dirty-dot" title="Unsaved changes" />}
                </button>
              </>
            )}

            {/* Blueprint selector — both roles */}
            <div className="blueprint-selector">
              <button
                className="btn-secondary selector-btn"
                onClick={() => setShowDropdown((v) => !v)}
              >
                <MdExpandMore className="icon" />
                {savedBlueprints.length > 0 ? "Blueprints" : "No blueprints"}
              </button>

              {showDropdown && (
                <div className="blueprint-dropdown">
                  <div className="dropdown-header">Saved Blueprints</div>
                  {savedBlueprints.length === 0 && (
                    <div className="dropdown-empty">No blueprints saved yet.</div>
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
                      {isAdmin && (
                        <button className="dropdown-delete"
                          onClick={(e) => deleteBlueprint(bp.id, e)} title="Delete">✕</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {activeObjectId && (
              <div className="drawing-hint">
                ✏️ Click to add points · Double-click to finish · Ctrl+Z undo · Ctrl+Shift+Z redo
              </div>
            )}

            {isWorker && blueprintImage && (
              <div className="worker-hint">
                🟡 Yellow = assigned to you &nbsp;·&nbsp; Click an element to mark complete
              </div>
            )}
          </div>

          {/* ── Main area ── */}
          <div className="blueprint-main">
            <div className="blueprint-canvas-container">
              <BlueprintCanvas
                imageUrl={blueprintImage}
                objects={canvasObjects}
                activeObjectId={isAdmin ? activeObjectId : null}
                selectedObjectId={selectedObjectId}
                onPathUpdate={isAdmin ? handlePathUpdate : undefined}
                onFinishDrawing={isAdmin ? handleFinishDrawing : undefined}
                onObjectSelected={(obj) => {
                  if (!activeObjectId) setSelectedObjectId(obj.id);
                }}
                currentUid={currentUid}
                isWorker={isWorker}
              />
            </div>

            {/* Right sidebar */}
            <div className="blueprint-sidebar">
              <h3>
                Elements <span className="element-count">({objects.length})</span>
              </h3>

              <div className="sections-list">
                {objects.length === 0 && (
                  <p className="no-sections">
                    {isAdmin
                      ? <>No elements yet.<br />Upload an image then draw pipes or connections.</>
                      : "Select a blueprint from the dropdown to view elements."}
                  </p>
                )}

                {objects.map((obj) => {
                  const isOwn = isWorker && obj.assignedTo === currentUid;
                  const canComplete = isAdmin || isOwn;
                  return (
                    <div
                      key={obj.id}
                      className={`section-card ${obj.type}${selectedObjectId === obj.id ? " active" : ""}${obj.drawing ? " drawing-active" : ""}${isOwn ? " own-element" : ""}`}
                      onClick={() => { if (!activeObjectId) setSelectedObjectId(obj.id); }}
                    >
                      <div className="section-header">
                        <div className="section-title">
                          <span className={`type-dot ${obj.type}${obj.completed ? " completed" : ""}${isOwn ? " own" : ""}`} />
                          <span className="section-type-label">
                            {obj.type === "pipe" ? "Pipe" : "Connection"}
                            {obj.drawing && <span className="drawing-badge"> ✏️</span>}
                          </span>
                        </div>
                        <div className="section-actions-inline">
                          {/* Complete toggle */}
                          {canComplete && !obj.drawing && (
                            <button
                              className={`btn-complete${obj.completed ? " done" : ""}`}
                              onClick={(e) => { e.stopPropagation(); toggleComplete(obj.id); }}
                              title={obj.completed ? "Mark as pending" : "Mark as complete"}
                            >
                              {obj.completed ? "✓ Done" : "Mark Done"}
                            </button>
                          )}
                          {/* Status badge for non-completable */}
                          {!canComplete && (
                            <span className={`section-status${obj.completed ? " completed" : ""}`}>
                              {obj.completed ? "Done" : "Pending"}
                            </span>
                          )}
                          {/* Delete — admin only */}
                          {isAdmin && (
                            <button
                              className="btn-icon-sm delete-btn"
                              onClick={(e) => { e.stopPropagation(); deleteObject(obj.id); }}
                              title="Delete"
                            >✕</button>
                          )}
                        </div>
                      </div>
                      <div className="section-meta">
                        {obj.assignedTo
                          ? <span className={`assigned-worker${isOwn ? " own" : ""}`}>
                              {isOwn ? "👷 You" : `👷 ${obj.assignedToName}`}
                            </span>
                          : <span className="unassigned">Unassigned</span>
                        }
                        {obj.pathPoints?.length > 0 && (
                          <span className="point-count">{obj.pathPoints.length} pts</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Assignment panel — admin only */}
              {isAdmin && selectedObject && !selectedObject.drawing && (
                <div className="assignment-panel">
                  <h4>
                    Assign {selectedObject.type === "pipe" ? "Pipe" : "Connection"}
                    <span className="worker-type-hint">
                      {selectedObject.type === "pipe" ? " (Plumbers)" : " (Electricians)"}
                    </span>
                  </h4>
                  <select
                    value={selectedObject.assignedTo || ""}
                    onChange={(e) => assignWorker(e.target.value)}
                  >
                    <option value="">— Select Worker —</option>
                    {selectedObject.type === "pipe" &&
                      workers.plumbers.map((w) => (
                        <option key={w.uid} value={w.uid}>{w.name}</option>
                      ))}
                    {selectedObject.type === "connection" &&
                      workers.electricians.map((w) => (
                        <option key={w.uid} value={w.uid}>{w.name}</option>
                      ))}
                  </select>
                  {selectedObject.type === "pipe" && workers.plumbers.length === 0 && (
                    <p className="no-workers-hint">No plumbers in the system.</p>
                  )}
                  {selectedObject.type === "connection" && workers.electricians.length === 0 && (
                    <p className="no-workers-hint">No electricians in the system.</p>
                  )}
                </div>
              )}

              {/* Worker: show "not assigned to you" message */}
              {isWorker && selectedObject && !selectedObject.drawing && selectedObject.assignedTo !== currentUid && (
                <div className="assignment-panel readonly">
                  <p className="readonly-hint">This element is not assigned to you.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BlueprintViewer;
