import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import {
  normalizeInventoryMaterial,
  normalizeTaskAllocation,
} from "./inventoryDomain";

const MATERIALS_COLLECTION = "materials";
const ALLOCATIONS_COLLECTION = "taskMaterialAllocations";
const TRANSACTIONS_COLLECTION = "materialTransactions";

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
    collection(db, MATERIALS_COLLECTION),
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
    collection(db, ALLOCATIONS_COLLECTION),
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
    collection(db, TRANSACTIONS_COLLECTION),
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
    collection(db, TRANSACTIONS_COLLECTION),
    where("organizationId", "==", organizationId),
    where("projectId", "==", projectId),
    where("taskId", "==", taskId),
  );

  const snap = await getDocs(ref);
  return snap.docs.map(normalizeTransactionDoc);
};
