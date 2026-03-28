import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  mergeAllocationsByMaterial,
  normalizeInventoryMaterial,
  normalizeTaskAllocation,
} from "./inventoryDomain";
import {
  MATERIAL_COLLECTIONS,
  MATERIAL_STATUS,
  MATERIAL_TRANSACTION_TYPE,
} from "./materialsConstants";

export const buildTaskMaterialAllocationId = (taskId, materialId) =>
  `${String(taskId || "").trim()}_${String(materialId || "").trim()}`;

const normalizeMaterialDoc = (docSnap) =>
  normalizeInventoryMaterial({
    id: docSnap.id,
    ...docSnap.data(),
  });

const normalizeAllocationDoc = (docSnap) => {
  const data = docSnap.data() || {};
  const normalized = normalizeTaskAllocation({
    materialId: data.materialId,
    quantityRequired: data.quantityRequired,
  });

  return {
    id: docSnap.id,
    organizationId: data.organizationId || "",
    projectId: data.projectId || "",
    taskId: data.taskId || "",
    ...normalized,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
};

const normalizeTransactionDoc = (docSnap) => {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    organizationId: data.organizationId || "",
    projectId: data.projectId || "",
    taskId: data.taskId || null,
    materialId: data.materialId || "",
    type: data.type || "",
    quantityDelta: Number.isFinite(Number(data.quantityDelta))
      ? Number(data.quantityDelta)
      : 0,
    beforeQty: Number.isFinite(Number(data.beforeQty))
      ? Number(data.beforeQty)
      : 0,
    afterQty: Number.isFinite(Number(data.afterQty)) ? Number(data.afterQty) : 0,
    performedBy: data.performedBy || "",
    performedAt: data.performedAt || null,
    note: data.note || "",
  };
};

export const listProjectMaterials = async ({ organizationId, projectId }) => {
  if (!organizationId || !projectId) return [];

  const ref = query(
    collection(db, MATERIAL_COLLECTIONS.MATERIALS),
    where("organizationId", "==", organizationId),
    where("projectId", "==", projectId),
  );

  const snap = await getDocs(ref);
  return snap.docs.map(normalizeMaterialDoc);
};

export const listTaskMaterialAllocations = async ({
  organizationId,
  projectId,
  taskId,
}) => {
  if (!organizationId || !projectId || !taskId) return [];

  const ref = query(
    collection(db, MATERIAL_COLLECTIONS.TASK_ALLOCATIONS),
    where("organizationId", "==", organizationId),
    where("projectId", "==", projectId),
    where("taskId", "==", taskId),
  );

  const snap = await getDocs(ref);
  return snap.docs.map(normalizeAllocationDoc);
};

export const listProjectMaterialTransactions = async ({
  organizationId,
  projectId,
}) => {
  if (!organizationId || !projectId) return [];

  const ref = query(
    collection(db, MATERIAL_COLLECTIONS.TRANSACTIONS),
    where("organizationId", "==", organizationId),
    where("projectId", "==", projectId),
  );

  const snap = await getDocs(ref);
  return snap.docs.map(normalizeTransactionDoc);
};

export const listTaskMaterialTransactions = async ({
  organizationId,
  projectId,
  taskId,
}) => {
  if (!organizationId || !projectId || !taskId) return [];

  const ref = query(
    collection(db, MATERIAL_COLLECTIONS.TRANSACTIONS),
    where("organizationId", "==", organizationId),
    where("projectId", "==", projectId),
    where("taskId", "==", taskId),
  );

  const snap = await getDocs(ref);
  return snap.docs.map(normalizeTransactionDoc);
};

export const createMaterial = async ({
  organizationId,
  projectId,
  name,
  unit,
  quantityOnHand,
  minimumThreshold,
  createdBy,
}) => {
  if (!organizationId || !projectId) {
    throw new Error("organizationId and projectId are required");
  }

  const normalized = normalizeInventoryMaterial({
    name,
    unit,
    quantityOnHand,
    minimumThreshold,
  });

  const status =
    normalized.quantityOnHand <= 0
      ? MATERIAL_STATUS.DEPLETED
      : MATERIAL_STATUS.ACTIVE;

  const payload = {
    organizationId,
    projectId,
    name: normalized.name,
    unit: normalized.unit,
    quantityOnHand: normalized.quantityOnHand,
    minimumThreshold: normalized.minimumThreshold,
    status,
    createdBy: createdBy || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, MATERIAL_COLLECTIONS.MATERIALS), payload);
  return { id: ref.id, ...payload };
};

export const updateMaterial = async ({ materialId, updates = {} }) => {
  if (!materialId) throw new Error("materialId is required");

  const patch = {};

  if (updates.name !== undefined) patch.name = String(updates.name || "").trim();
  if (updates.unit !== undefined) patch.unit = String(updates.unit || "").trim();
  if (updates.minimumThreshold !== undefined) {
    patch.minimumThreshold = Math.max(0, Number(updates.minimumThreshold) || 0);
  }

  if (updates.quantityOnHand !== undefined) {
    patch.quantityOnHand = Math.max(0, Number(updates.quantityOnHand) || 0);
    patch.status =
      patch.quantityOnHand <= 0
        ? MATERIAL_STATUS.DEPLETED
        : MATERIAL_STATUS.ACTIVE;
  }

  patch.updatedAt = serverTimestamp();

  await updateDoc(doc(db, MATERIAL_COLLECTIONS.MATERIALS, materialId), patch);
  return patch;
};

export const removeMaterial = async ({ materialId }) => {
  if (!materialId) throw new Error("materialId is required");

  await deleteDoc(doc(db, MATERIAL_COLLECTIONS.MATERIALS, materialId));
};

export const upsertTaskMaterialAllocation = async ({
  organizationId,
  projectId,
  taskId,
  materialId,
  quantityRequired,
  updatedBy,
}) => {
  if (!organizationId || !projectId || !taskId || !materialId) {
    throw new Error("organizationId, projectId, taskId, and materialId are required");
  }

  const normalized = normalizeTaskAllocation({ materialId, quantityRequired });
  const allocationId = buildTaskMaterialAllocationId(taskId, normalized.materialId);
  const allocationRef = doc(db, MATERIAL_COLLECTIONS.TASK_ALLOCATIONS, allocationId);

  await setDoc(
    allocationRef,
    {
      organizationId,
      projectId,
      taskId,
      materialId: normalized.materialId,
      quantityRequired: normalized.quantityRequired,
      updatedBy: updatedBy || "",
      updatedAt: serverTimestamp(),
      createdBy: updatedBy || "",
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  return {
    id: allocationId,
    organizationId,
    projectId,
    taskId,
    materialId: normalized.materialId,
    quantityRequired: normalized.quantityRequired,
  };
};

export const removeTaskMaterialAllocation = async ({ taskId, materialId }) => {
  if (!taskId || !materialId) {
    throw new Error("taskId and materialId are required");
  }

  const allocationId = buildTaskMaterialAllocationId(taskId, materialId);
  await deleteDoc(doc(db, MATERIAL_COLLECTIONS.TASK_ALLOCATIONS, allocationId));
};

export const assignMaterialsToTaskWithDeduction = async ({
  organizationId,
  projectId,
  taskId,
  allocations = [],
  performedBy,
  note,
}) => {
  if (!organizationId || !projectId || !taskId) {
    throw new Error("organizationId, projectId, and taskId are required");
  }

  const mergedAllocations = mergeAllocationsByMaterial(allocations);
  if (mergedAllocations.length === 0) {
    return { deductionLog: [], allocationIds: [] };
  }

  const deductionLog = [];
  const allocationIds = [];

  await runTransaction(db, async (transaction) => {
    for (const allocation of mergedAllocations) {
      const materialRef = doc(
        db,
        MATERIAL_COLLECTIONS.MATERIALS,
        allocation.materialId,
      );

      const materialSnap = await transaction.get(materialRef);
      if (!materialSnap.exists()) {
        const err = new Error("Material not found");
        err.code = "MATERIAL_NOT_FOUND";
        err.details = { materialId: allocation.materialId };
        throw err;
      }

      const materialData = materialSnap.data() || {};
      const material = normalizeInventoryMaterial({
        id: materialSnap.id,
        ...materialData,
      });

      if (
        materialData.organizationId !== organizationId ||
        materialData.projectId !== projectId
      ) {
        const err = new Error("Material does not belong to this project");
        err.code = "MATERIAL_SCOPE_MISMATCH";
        err.details = { materialId: allocation.materialId };
        throw err;
      }

      if (material.quantityOnHand < allocation.quantityRequired) {
        const err = new Error("Insufficient stock");
        err.code = "INSUFFICIENT_STOCK";
        err.details = {
          materialId: allocation.materialId,
          available: material.quantityOnHand,
          required: allocation.quantityRequired,
        };
        throw err;
      }

      const beforeQty = material.quantityOnHand;
      const afterQty = Math.max(0, beforeQty - allocation.quantityRequired);
      const nextStatus =
        afterQty === 0 ? MATERIAL_STATUS.DEPLETED : MATERIAL_STATUS.ACTIVE;

      transaction.update(materialRef, {
        quantityOnHand: afterQty,
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });

      const allocationId = buildTaskMaterialAllocationId(taskId, allocation.materialId);
      const allocationRef = doc(db, MATERIAL_COLLECTIONS.TASK_ALLOCATIONS, allocationId);

      transaction.set(
        allocationRef,
        {
          organizationId,
          projectId,
          taskId,
          materialId: allocation.materialId,
          quantityRequired: allocation.quantityRequired,
          updatedBy: performedBy || "",
          updatedAt: serverTimestamp(),
          createdBy: performedBy || "",
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );

      const transactionRef = doc(collection(db, MATERIAL_COLLECTIONS.TRANSACTIONS));
      transaction.set(transactionRef, {
        organizationId,
        projectId,
        taskId,
        materialId: allocation.materialId,
        type: MATERIAL_TRANSACTION_TYPE.TASK_ASSIGNMENT_DEDUCTION,
        quantityDelta: -allocation.quantityRequired,
        beforeQty,
        afterQty,
        performedBy: performedBy || "",
        performedAt: serverTimestamp(),
        note: note || "Assigned to task",
      });

      allocationIds.push(allocationId);
      deductionLog.push({
        materialId: allocation.materialId,
        deducted: allocation.quantityRequired,
        beforeQty,
        afterQty,
      });
    }
  });

  return { deductionLog, allocationIds };
};
