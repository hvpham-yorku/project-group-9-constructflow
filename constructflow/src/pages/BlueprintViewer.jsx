/**
 * BlueprintViewer.jsx
 *
 * Role-aware blueprint page (accessed via /projects/:projectId/blueprints)
 *   Manager — full edit: upload, draw hot/cold pipes + wire, assign, delete, save/update
 *   Worker  — read-only: select blueprint, view assigned elements, mark own elements complete
 *
 * Drawing types:
 *   hot_pipe   → plumbers     (red)
 *   cold_pipe  → plumbers     (blue)
 *   drain_pipe → plumbers     (silver)
 *   connection → electricians
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import BlueprintCanvas from "../components/BlueprintCanvas";
import {
  MdSave,
  MdExpandMore,
  MdArrowBack,
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
  getDoc,
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
  hot_pipe: "plumber",
  cold_pipe: "plumber",
  drain_pipe: "plumber",
  fixture_area: "plumber",
  pipe: "plumber",
  connection: "electrician",
};

const TYPE_LABELS = {
  hot_pipe: "Hot Water Pipe",
  cold_pipe: "Cold Water Pipe",
  drain_pipe: "Drainage Pipe",
  fixture_area: "Fixture",
  pipe: "Hot Water Pipe",
  connection: "Wire",
};

const POINT_TASK_LABELS = {
  valve: "Valve",
  fixture: "Valve",
  join_2_way: "2 Way Joints",
  join_3_way: "3 Way Joints",
  join_4_way: "4 Way Joints",
};

const POINT_TOOL_TYPES = ["valve", "join_2_way", "join_3_way", "join_4_way"];

const POINT_TOOL_BUTTONS = [
  {
    key: "valve",
    label: "Valve",
    className: "valve-btn",
    iconClass: "valve-icon",
    title: "Assign valve task to point",
  },
  {
    key: "join_2_way",
    label: "2 Way Joints",
    className: "join-2-btn",
    iconClass: "join-2-icon",
    title: "Assign 2 way joints task to point",
  },
  {
    key: "join_3_way",
    label: "3 Way Joints",
    className: "join-3-btn",
    iconClass: "join-3-icon",
    title: "Assign 3 way joints task to point",
  },
  {
    key: "join_4_way",
    label: "4 Way Joints",
    className: "join-4-btn",
    iconClass: "join-4-icon",
    title: "Assign 4 way joints task to point",
  },
];

const clampFixtureConnections = (value) =>
  Math.min(4, Math.max(1, Number(value) || 1));

const pointChipLabel = (pointTasks = [], pointIndex = 0) => {
  const task = pointTasks[pointIndex];
  if (!task?.requiredType) return `P${pointIndex + 1}`;
  return POINT_TASK_LABELS[task.requiredType] || task.requiredType;
};

const syncPointTasksWithPoints = (pointTasks = [], pointCount = 0) =>
  Array.from({ length: pointCount }, (_, index) => {
    const task = pointTasks[index] || {};
    return {
      requiredType: task.requiredType || null,
      completed: Boolean(task.completed),
      instructions:
        typeof task.instructions === "string" ? task.instructions : "",
    };
  });

const withComputedCompletion = (obj) => {
  const pathPoints = obj.pathPoints || [];
  const pointTasks = syncPointTasksWithPoints(
    obj.pointTasks,
    pathPoints.length,
  );
  const requiredTasks = pointTasks.filter((task) => task.requiredType);
  const completed =
    requiredTasks.length > 0
      ? requiredTasks.every((task) => task.completed)
      : Boolean(obj.completed);

  return {
    ...obj,
    pathPoints,
    pointTasks,
    completed,
  };
};

const hydrateObject = (id, raw) =>
  withComputedCompletion({
    id,
    type: raw.type,
    pathPoints: raw.pathPoints || [],
    pointTasks: raw.pointTasks || [],
    rect: raw.rect || null,
    fixtureName: raw.fixtureName || "",
    connectionCount: clampFixtureConnections(raw.connectionCount || 1),
    assignedTo: raw.assignedTo || null,
    assignedToName: raw.assignedToName || null,
    completed: raw.completed || false,
    drawing: Boolean(raw.drawing),
  });

export default function BlueprintViewer() {
  const { currentUser, userProfile, isManager, organizationId } = useAuth();
  const { projectId, taskId } = useParams();
  const [searchParams] = useSearchParams();
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
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [activePlumbingTool, setActivePlumbingTool] = useState("hot_pipe");

  // ── UI state ─────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeToolGroup, setActiveToolGroup] = useState("plumbing");
  const [showGrid, setShowGrid] = useState(false);

  // ── Data ─────────────────────────────────────────────────────────────
  const [savedBlueprints, setSavedBlueprints] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const [taskAccessChecked, setTaskAccessChecked] = useState(false);
  const [canAccessTaskBlueprints, setCanAccessTaskBlueprints] = useState(true);

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

  const canWorkerOperateOnObject = useCallback(
    (obj) => {
      if (!isWorker) return false;
      if (taskId) return canAccessTaskBlueprints;
      return currentUid !== null && obj.assignedTo === currentUid;
    },
    [isWorker, taskId, canAccessTaskBlueprints, currentUid],
  );

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
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (taskId) {
        list = list.filter((blueprint) => blueprint.taskId === taskId);
      }
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
  }, [projectId, taskId]);

  // ── Task access control (for task-scoped blueprints) ────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!taskId) {
      setCanAccessTaskBlueprints(true);
      setTaskAccessChecked(true);
      return;
    }

    const checkTaskAccess = async () => {
      setTaskAccessChecked(false);
      try {
        const snap = await getDoc(doc(db, "tasks", taskId));
        if (!snap.exists()) {
          setCanAccessTaskBlueprints(false);
          return;
        }

        const task = snap.data();
        const belongsToProject = task.projectId === projectId;
        const isAssignedWorker =
          Boolean(currentUid) && task.assignedWorkerId === currentUid;
        const canAccess = belongsToProject && (isManager || isAssignedWorker);
        setCanAccessTaskBlueprints(canAccess);
      } catch (err) {
        console.error("Task access check:", err);
        setCanAccessTaskBlueprints(false);
      } finally {
        setTaskAccessChecked(true);
      }
    };

    checkTaskAccess();
  }, [isAuthenticated, taskId, projectId, currentUid, isManager]);

  // ── On mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    if (taskId && !taskAccessChecked) return;
    if (taskId && !canAccessTaskBlueprints) {
      setSavedBlueprints([]);
      return;
    }

    fetchBlueprints().then((list) => {
      const requestedId = searchParams.get("blueprintId");
      if (requestedId) {
        const requestedBlueprint = list.find((b) => b.id === requestedId);
        if (requestedBlueprint) {
          loadBlueprintData(requestedBlueprint);
          return;
        }
      }

      const lastId = localStorage.getItem(LS_KEY);
      if (lastId) {
        const bp = list.find((b) => b.id === lastId);
        if (bp) loadBlueprintData(bp);
      }
    });
  }, [
    isAuthenticated,
    fetchBlueprints,
    searchParams,
    taskId,
    taskAccessChecked,
    canAccessTaskBlueprints,
  ]);

  // ── Load blueprint (internal) ─────────────────────────────────────
  const loadBlueprintData = (bp) => {
    setActiveObjectId(null);
    setSelectedObjectId(null);
    setSelectedPoint(null);
    setActivePlumbingTool("hot_pipe");
    setBlueprintName(bp.name || "");
    setBlueprintImage(bp.imageUrl || null);
    setCurrentBlueprintId(bp.id);
    const objs = Object.entries(bp.objects || {}).map(([id, obj]) =>
      hydrateObject(id, { ...obj, drawing: false }),
    );
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
        setSelectedPoint(null);
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
      setSelectedPoint(null);
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
      withComputedCompletion({
        id,
        type,
        pathPoints: [],
        pointTasks: [],
        rect: null,
        fixtureName: type === "fixture_area" ? "Fixture" : "",
        connectionCount: 1,
        assignedTo: null,
        assignedToName: null,
        completed: false,
        drawing: true,
      }),
    ]);
    if (
      ["pipe", "hot_pipe", "cold_pipe", "drain_pipe", "fixture_area"].includes(
        type,
      )
    ) {
      setActivePlumbingTool(type);
    }
    setSelectedPoint(null);
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
      prev.map((o) =>
        o.id === id ? withComputedCompletion({ ...o, pathPoints: points }) : o,
      ),
    );

  const handleObjectUpdate = (id, patch) =>
    setObjects((prev) =>
      prev.map((obj) =>
        obj.id === id ? withComputedCompletion({ ...obj, ...patch }) : obj,
      ),
    );

  const updateFixtureConfig = (id, fields) =>
    setObjects((prev) =>
      prev.map((obj) => {
        if (obj.id !== id || obj.type !== "fixture_area") return obj;
        return withComputedCompletion({
          ...obj,
          ...fields,
          connectionCount:
            fields.connectionCount !== undefined
              ? clampFixtureConnections(fields.connectionCount)
              : clampFixtureConnections(obj.connectionCount || 1),
        });
      }),
    );

  const handleFinishDrawing = (id) => {
    setObjects((prev) =>
      prev.map((o) =>
        o.id === id ? withComputedCompletion({ ...o, drawing: false }) : o,
      ),
    );
    setActiveObjectId(null);
  };

  const deleteObject = (id) => {
    if (id === activeObjectId) setActiveObjectId(null);
    if (id === selectedObjectId) setSelectedObjectId(null);
    if (selectedPoint?.objectId === id) setSelectedPoint(null);
    setObjects((prev) => prev.filter((o) => o.id !== id));
  };

  const selectObject = (objId) => {
    if (activeObjectId) return;
    setSelectedObjectId((prev) => {
      const next = prev === objId ? null : objId;
      if (selectedPoint && selectedPoint.objectId !== next) {
        setSelectedPoint(null);
      }
      return next;
    });
  };

  const persistObjectForWorker = async (updatedObj) => {
    if (!isWorker || !currentBlueprintId) return;
    try {
      const bp = savedBlueprints.find((b) => b.id === currentBlueprintId);
      if (!bp) return;
      const updatedObjects = { ...bp.objects };
      updatedObjects[updatedObj.id] = {
        ...updatedObjects[updatedObj.id],
        type: updatedObj.type,
        pathPoints: updatedObj.pathPoints,
        pointTasks: updatedObj.pointTasks || [],
        rect: updatedObj.rect || null,
        fixtureName: updatedObj.fixtureName || "",
        connectionCount: clampFixtureConnections(
          updatedObj.connectionCount || 1,
        ),
        assignedTo: updatedObj.assignedTo || null,
        assignedToName: updatedObj.assignedToName || null,
        completed: updatedObj.completed,
      };
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

  const setPointRequiredType = (objId, pointIndex, requiredType) => {
    setObjects((prev) =>
      prev.map((obj) => {
        if (obj.id !== objId) return obj;
        if (!["pipe", "hot_pipe", "cold_pipe", "drain_pipe"].includes(obj.type))
          return obj;
        const pointTasks = syncPointTasksWithPoints(
          obj.pointTasks,
          obj.pathPoints.length,
        );
        const current = pointTasks[pointIndex] || {
          requiredType: null,
          completed: false,
          instructions: "",
        };
        pointTasks[pointIndex] = {
          requiredType,
          completed: requiredType ? current.completed : false,
          instructions: current.instructions || "",
        };
        return withComputedCompletion({ ...obj, pointTasks });
      }),
    );
  };

  const updatePointInstructions = (objId, pointIndex, instructions) => {
    if (!isManager) return;
    setObjects((prev) =>
      prev.map((obj) => {
        if (obj.id !== objId) return obj;
        const pointTasks = syncPointTasksWithPoints(
          obj.pointTasks,
          obj.pathPoints.length,
        );
        const current = pointTasks[pointIndex] || {
          requiredType: null,
          completed: false,
          instructions: "",
        };
        pointTasks[pointIndex] = {
          ...current,
          instructions,
        };
        return withComputedCompletion({ ...obj, pointTasks });
      }),
    );
  };

  const handlePointToolHover = (objId, pointIndex, tool) => {
    if (!isManager || !POINT_TOOL_TYPES.includes(tool)) return;
    const obj = objects.find((item) => item.id === objId);
    if (
      !obj ||
      !["pipe", "hot_pipe", "cold_pipe", "drain_pipe"].includes(obj.type)
    )
      return;
    const existingTask = obj.pointTasks?.[pointIndex];
    if (existingTask?.requiredType === tool) return;
    setPointRequiredType(objId, pointIndex, tool);
    setSelectedObjectId(objId);
    setSelectedPoint({ objectId: objId, pointIndex });
  };

  const togglePointComplete = (objId, pointIndex) => {
    const target = objects.find((obj) => obj.id === objId);
    if (!target) return;
    const isOwn = canWorkerOperateOnObject(target);
    const canComplete = isManager || isOwn;
    const task = target.pointTasks?.[pointIndex];
    if (!canComplete || !task?.requiredType) return;

    const updated = withComputedCompletion({
      ...target,
      pointTasks: target.pointTasks.map((pointTask, index) =>
        index === pointIndex
          ? { ...pointTask, completed: !pointTask.completed }
          : pointTask,
      ),
    });

    setObjects((prev) => prev.map((obj) => (obj.id === objId ? updated : obj)));
    if (isWorker) persistObjectForWorker(updated);
  };

  // ── Mark complete ─────────────────────────────────────────────────
  const toggleComplete = (id) => {
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;
    const hasPointRequirements = (obj.pointTasks || []).some(
      (task) => task.requiredType,
    );
    if (hasPointRequirements) return;
    if (isWorker && !canWorkerOperateOnObject(obj)) return;
    const newCompleted = !obj.completed;
    const updated = withComputedCompletion({ ...obj, completed: newCompleted });
    setObjects((prev) => prev.map((o) => (o.id === id ? updated : o)));
    if (isWorker && currentBlueprintId) {
      persistObjectForWorker(updated);
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
          pointTasks: obj.pointTasks || [],
          rect: obj.rect || null,
          fixtureName: obj.fixtureName || "",
          connectionCount: clampFixtureConnections(obj.connectionCount || 1),
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
        taskId: taskId || null,
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
  const activeType = activeObjectId
    ? objects.find((o) => o.id === activeObjectId)?.type
    : null;
  const isDrawingHotPipe = activeType === "hot_pipe" || activeType === "pipe";
  const isDrawingColdPipe = activeType === "cold_pipe";
  const isDrawingDrainPipe = activeType === "drain_pipe";
  const isDrawingFixtureArea = activeType === "fixture_area";
  const isDrawingConnection = activeType === "connection";
  const activePointTool =
    isManager &&
    activeToolGroup === "plumbing" &&
    !activeObjectId &&
    POINT_TOOL_TYPES.includes(activePlumbingTool)
      ? activePlumbingTool
      : null;

  const selectToolGroup = (group) => {
    if (activeObjectId) cancelActiveDrawing();
    setActiveToolGroup(group);
    if (
      group === "plumbing" &&
      ![
        "hot_pipe",
        "cold_pipe",
        "drain_pipe",
        "fixture_area",
        ...POINT_TOOL_TYPES,
      ].includes(activePlumbingTool)
    ) {
      setActivePlumbingTool("hot_pipe");
    }
  };

  useEffect(() => {
    if (!activeType) return;
    if (
      ["pipe", "hot_pipe", "cold_pipe", "drain_pipe", "fixture_area"].includes(
        activeType,
      )
    ) {
      setActiveToolGroup("plumbing");
      setActivePlumbingTool(activeType);
      return;
    }
    setActiveToolGroup("electrical");
  }, [activeType]);

  const canvasObjects = objects.map((obj) => ({
    ...obj,
    isOwn: canWorkerOperateOnObject(obj),
  }));

  // Worker-specific filtering: only show elements relevant to them
  // (they can see all but only interact with their own)
  const workerListObjects =
    isWorker && workerTrade
      ? taskId
        ? objects
        : objects.filter(
            (o) =>
              o.type === "fixture_area" ||
              TYPE_TRADE[o.type] === workerTrade ||
              (currentUid !== null && o.assignedTo === currentUid),
          )
      : objects;

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

  if (taskId && !taskAccessChecked) {
    return (
      <div className="dashboard">
        <Sidebar />
        <div className="dashboard-content">
          <div className="sign-in-message">Checking task access…</div>
        </div>
      </div>
    );
  }

  if (taskId && !canAccessTaskBlueprints) {
    return (
      <div className="dashboard">
        <Sidebar />
        <div className="dashboard-content">
          <div className="sign-in-message">
            You do not have access to this task blueprint.
          </div>
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
              onClick={() =>
                taskId
                  ? navigate(`/projects/${projectId}/tasks`)
                  : navigate("/projects")
              }
              title="Back to Projects"
            >
              <MdArrowBack /> {taskId ? "Tasks" : "Projects"}
            </button>

            {/* Blueprint name */}
            <input
              type="text"
              placeholder=""
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
            <button
              className={`btn-secondary${showGrid ? " active" : ""}`}
              onClick={() => setShowGrid((prev) => !prev)}
              disabled={!blueprintImage}
              title="Toggle grid overlay"
            >
              Grid
            </button>

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

          {isManager && (
            <div className={`tool-ribbon${!blueprintImage ? " disabled" : ""}`}>
              <div
                className="tool-group-switch"
                role="tablist"
                aria-label="Tool categories"
              >
                <button
                  className={`btn-secondary tool-group-btn${activeToolGroup === "plumbing" ? " active" : ""}`}
                  onClick={() => selectToolGroup("plumbing")}
                  disabled={!blueprintImage}
                  title="Open plumbing tools"
                >
                  PLUMBING TOOLS
                </button>
                <button
                  className={`btn-secondary tool-group-btn${activeToolGroup === "electrical" ? " active" : ""}`}
                  onClick={() => selectToolGroup("electrical")}
                  disabled={!blueprintImage}
                  title="Open electrical tools"
                >
                  ELECTRICAL TOOLS
                </button>
              </div>

              <div className="tool-ribbon-tools">
                {activeToolGroup === "plumbing" ? (
                  <>
                    <button
                      className={`btn-secondary draw-btn hot-pipe-btn${isDrawingHotPipe ? " active" : ""}`}
                      onClick={() => {
                        setActivePlumbingTool("hot_pipe");
                        isDrawingHotPipe
                          ? cancelActiveDrawing()
                          : startDrawing("hot_pipe");
                      }}
                      disabled={!blueprintImage}
                      title="Select hot water pipe tool"
                    >
                      <span className="draw-icon hot-pipe-icon" />
                      {isDrawingHotPipe ? "Cancel Hot Pipe" : "Hot Water Pipe"}
                    </button>
                    <button
                      className={`btn-secondary draw-btn cold-pipe-btn${isDrawingColdPipe ? " active" : ""}`}
                      onClick={() => {
                        setActivePlumbingTool("cold_pipe");
                        isDrawingColdPipe
                          ? cancelActiveDrawing()
                          : startDrawing("cold_pipe");
                      }}
                      disabled={!blueprintImage}
                      title="Select cold water pipe tool"
                    >
                      <span className="draw-icon cold-pipe-icon" />
                      {isDrawingColdPipe
                        ? "Cancel Cold Pipe"
                        : "Cold Water Pipe"}
                    </button>

                    <button
                      className={`btn-secondary draw-btn drain-pipe-btn${isDrawingDrainPipe ? " active" : ""}`}
                      onClick={() => {
                        setActivePlumbingTool("drain_pipe");
                        isDrawingDrainPipe
                          ? cancelActiveDrawing()
                          : startDrawing("drain_pipe");
                      }}
                      disabled={!blueprintImage}
                      title="Select drainage pipe tool"
                    >
                      <span className="draw-icon drain-pipe-icon" />
                      {isDrawingDrainPipe
                        ? "Cancel Drain Pipe"
                        : "Drainage Pipe"}
                    </button>

                    <button
                      className={`btn-secondary draw-btn fixture-area-btn${isDrawingFixtureArea ? " active" : ""}`}
                      onClick={() => {
                        setActivePlumbingTool("fixture_area");
                        isDrawingFixtureArea
                          ? cancelActiveDrawing()
                          : startDrawing("fixture_area");
                      }}
                      disabled={!blueprintImage}
                      title="Select fixture rectangle tool"
                    >
                      <span className="draw-icon fixture-area-icon" />
                      {isDrawingFixtureArea ? "Cancel Fixture" : "Fixture"}
                    </button>

                    {POINT_TOOL_BUTTONS.map((toolButton) => {
                      const isActive = activePointTool === toolButton.key;
                      return (
                        <button
                          key={toolButton.key}
                          className={`btn-secondary draw-btn ${toolButton.className}${isActive ? " active" : ""}`}
                          onClick={() => {
                            if (activeObjectId) cancelActiveDrawing();
                            setActivePlumbingTool(toolButton.key);
                          }}
                          disabled={!blueprintImage}
                          title={toolButton.title}
                        >
                          <span
                            className={`draw-icon ${toolButton.iconClass}`}
                          />
                          {toolButton.label}
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <button
                    className={`btn-secondary draw-btn connection-btn${isDrawingConnection ? " active" : ""}`}
                    onClick={() =>
                      isDrawingConnection
                        ? cancelActiveDrawing()
                        : startDrawing("connection")
                    }
                    disabled={!blueprintImage}
                    title="Select wire tool"
                  >
                    <span className="draw-icon connection-icon" />
                    {isDrawingConnection ? "Cancel Wire" : "Wire"}
                  </button>
                )}

                <span className="tool-ribbon-note">
                  Draw fixture rectangles, then click pipe points to assign
                  valve/join tasks
                </span>
              </div>
            </div>
          )}

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
                selectedPoint={selectedPoint}
                onPathUpdate={isManager ? handlePathUpdate : undefined}
                onObjectUpdate={isManager ? handleObjectUpdate : undefined}
                onFinishDrawing={isManager ? handleFinishDrawing : undefined}
                activePointTool={activePointTool}
                onPointToolHover={isManager ? handlePointToolHover : undefined}
                onPointSelected={({ objectId, pointIndex }) => {
                  if (!activeObjectId) {
                    setSelectedObjectId(objectId);
                    setSelectedPoint({ objectId, pointIndex });
                  }
                }}
                onObjectSelected={(obj) => {
                  if (!activeObjectId) selectObject(obj.id);
                }}
                isWorker={isWorker}
                showGrid={showGrid}
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
                        Upload an image then choose a tool and draw
                        hot/cold/drainage pipes or wires.
                      </>
                    ) : (
                      "Select a blueprint to view elements."
                    )}
                  </p>
                )}

                {objects.map((obj) => {
                  const isOwn = isWorker && canWorkerOperateOnObject(obj);
                  const canComplete = isManager || isOwn;
                  const hasPointRequirements = (obj.pointTasks || []).some(
                    (task) => task.requiredType,
                  );
                  const isFixture = obj.type === "fixture_area";
                  return (
                    <div
                      key={obj.id}
                      className={`section-card ${obj.type}${selectedObjectId === obj.id ? " active" : ""}${obj.drawing ? " drawing-active" : ""}${isOwn ? " own-element" : ""}`}
                      onClick={() => {
                        if (!activeObjectId) selectObject(obj.id);
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
                          {canComplete &&
                            !obj.drawing &&
                            !hasPointRequirements && (
                              <button
                                className={`btn-complete${obj.completed ? " done" : ""}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleComplete(obj.id);
                                }}
                                title={
                                  obj.completed
                                    ? "Mark pending"
                                    : "Mark complete"
                                }
                              >
                                {obj.completed ? "✓ Done" : "Mark Done"}
                              </button>
                            )}
                          {canComplete &&
                            !obj.drawing &&
                            hasPointRequirements && (
                              <span
                                className={`section-status${obj.completed ? " completed" : ""}`}
                              >
                                {obj.completed ? "✓ Auto Done" : "In Progress"}
                              </span>
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
                        {isFixture ? (
                          <span className="point-count">
                            {clampFixtureConnections(obj.connectionCount || 1)}{" "}
                            connections
                          </span>
                        ) : (
                          <span className="point-count">
                            {obj.pathPoints.length} pts
                          </span>
                        )}
                      </div>

                      {isFixture && (
                        <div className="fixture-config">
                          {isManager ? (
                            <>
                              <input
                                className="fixture-name-input"
                                type="text"
                                value={obj.fixtureName || ""}
                                placeholder="Fixture name"
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  updateFixtureConfig(obj.id, {
                                    fixtureName: e.target.value,
                                  })
                                }
                              />
                              <select
                                className="fixture-conn-select"
                                value={clampFixtureConnections(
                                  obj.connectionCount || 1,
                                )}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  updateFixtureConfig(obj.id, {
                                    connectionCount: Number(e.target.value),
                                  })
                                }
                              >
                                {[1, 2, 3, 4].map((count) => (
                                  <option key={count} value={count}>
                                    {count} connection{count > 1 ? "s" : ""}
                                  </option>
                                ))}
                              </select>
                            </>
                          ) : (
                            <p className="fixture-readonly-name">
                              {obj.fixtureName?.trim() || "Fixture"} ·{" "}
                              {clampFixtureConnections(
                                obj.connectionCount || 1,
                              )}{" "}
                              connection
                              {clampFixtureConnections(
                                obj.connectionCount || 1,
                              ) > 1
                                ? "s"
                                : ""}
                            </p>
                          )}
                        </div>
                      )}

                      {!isFixture && obj.pathPoints?.length > 0 && (
                        <div className="point-list">
                          {obj.pathPoints.map((_, pointIndex) => {
                            const pointTask = obj.pointTasks?.[pointIndex] || {
                              requiredType: null,
                              completed: false,
                              instructions: "",
                            };
                            const isPointSelected =
                              selectedPoint?.objectId === obj.id &&
                              selectedPoint?.pointIndex === pointIndex;
                            const canCompletePoint =
                              pointTask.requiredType && (isManager || isOwn);

                            return (
                              <div
                                key={`${obj.id}-point-${pointIndex}`}
                                className={`point-row${isPointSelected ? " active" : ""}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (activeObjectId) return;
                                  setSelectedObjectId(obj.id);
                                  setSelectedPoint({
                                    objectId: obj.id,
                                    pointIndex,
                                  });
                                }}
                              >
                                <button
                                  className="point-chip"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (activeObjectId) return;
                                    setSelectedObjectId(obj.id);
                                    setSelectedPoint({
                                      objectId: obj.id,
                                      pointIndex,
                                    });
                                  }}
                                  type="button"
                                >
                                  ▲{" "}
                                  {pointChipLabel(
                                    obj.pointTasks || [],
                                    pointIndex,
                                  )}
                                </button>

                                {isManager ? (
                                  <input
                                    className={`point-task-input${pointTask.requiredType ? " assigned" : ""}`}
                                    type="text"
                                    value={pointTask.instructions || ""}
                                    placeholder="No task"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (activeObjectId) return;
                                      setSelectedObjectId(obj.id);
                                      setSelectedPoint({
                                        objectId: obj.id,
                                        pointIndex,
                                      });
                                    }}
                                    onChange={(e) =>
                                      updatePointInstructions(
                                        obj.id,
                                        pointIndex,
                                        e.target.value,
                                      )
                                    }
                                  />
                                ) : (
                                  <span
                                    className={`point-task${pointTask.requiredType ? " assigned" : ""}`}
                                  >
                                    {pointTask.instructions?.trim() ||
                                      (pointTask.requiredType
                                        ? POINT_TASK_LABELS[
                                            pointTask.requiredType
                                          ] || pointTask.requiredType
                                        : "No task")}
                                  </span>
                                )}

                                {canCompletePoint && (
                                  <button
                                    className={`btn-point-complete${pointTask.completed ? " done" : ""}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      togglePointComplete(obj.id, pointIndex);
                                    }}
                                    title={
                                      pointTask.completed
                                        ? "Mark pending"
                                        : "Mark complete"
                                    }
                                  >
                                    {pointTask.completed ? "✓" : "Done"}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
