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
} from "./materialsRepository";
import { toDate, toDayKey } from "./dateTime";

export async function loadWorkerDashboardData({ currentUid, organizationId }) {
  if (!currentUid || !organizationId) {
    return {
      workerRecord: null,
      projectNames: {},
      tasks: [],
      taskMaterialsByTaskId: {},
    };
  }

  let workerRecord = null;
  const workerSnap = await getDoc(doc(db, "users", currentUid));
  if (workerSnap.exists()) {
    workerRecord = { uid: workerSnap.id, ...workerSnap.data() };
  }

  const projectQ = query(
    collection(db, "projects"),
    where("organizationId", "==", organizationId),
  );
  const projectSnap = await getDocs(projectQ);

  const projectNames = {};
  const activeProjectIds = new Set();
  projectSnap.forEach((docSnap) => {
    const projectData = docSnap.data() || {};
    projectNames[docSnap.id] = projectData.name || "Project";
    const projectStatus = projectData.status || "active";
    if (projectStatus === "active") {
      activeProjectIds.add(docSnap.id);
    }
  });

  const taskQ = query(
    collection(db, "tasks"),
    where("assignedWorkerId", "==", currentUid),
  );
  const taskSnap = await getDocs(taskQ);
  const tasks = taskSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(
      (task) =>
        task.organizationId === organizationId &&
        activeProjectIds.has(task.projectId),
    )
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));

  if (tasks.length === 0) {
    return {
      workerRecord,
      projectNames,
      tasks,
      taskMaterialsByTaskId: {},
    };
  }

  const uniqueProjectIds = Array.from(
    new Set(tasks.map((task) => task.projectId).filter(Boolean)),
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
    tasks.map(async (task) => {
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

  return {
    workerRecord,
    projectNames,
    tasks,
    taskMaterialsByTaskId: Object.fromEntries(entries),
  };
}

export async function clockInWorker({ currentUid }) {
  await updateDoc(doc(db, "users", currentUid), {
    isClockedIn: true,
    clockedInAt: serverTimestamp(),
    clockedOutAt: null,
  });
}

export async function clockOutWorker({
  currentUid,
  organizationId,
  workerName,
  clockInAt,
}) {
  const clockOutDate = new Date();
  const clockInDate = toDate(clockInAt) || clockOutDate;
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
      workerName: workerName || "Worker",
      dayKey,
      clockInAt: clockInDate,
      clockOutAt: clockOutDate,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return {
    clockInDate,
    clockOutDate,
  };
}