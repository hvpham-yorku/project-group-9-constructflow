import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../firebase", () => ({ db: {} }));

const mockCollection = vi.fn((database, name) => ({ database, name }));
const mockWhere = vi.fn((field, op, value) => ({ field, op, value }));
const mockQuery = vi.fn((ref, ...clauses) => ({ ref, clauses }));
const mockGetDocs = vi.fn();
const mockAddDoc = vi.fn();
const mockUpdateDoc = vi.fn(() => Promise.resolve());
const mockDeleteDoc = vi.fn(() => Promise.resolve());
const mockSetDoc = vi.fn(() => Promise.resolve());
const mockServerTimestamp = vi.fn(() => "__ts__");

const mockDoc = vi.fn((refOrDb, nameOrId, maybeId) => {
  if (maybeId !== undefined) {
    return { database: refOrDb, name: nameOrId, id: maybeId };
  }
  if (
    nameOrId !== undefined &&
    refOrDb &&
    typeof refOrDb === "object" &&
    "name" in refOrDb
  ) {
    return { database: refOrDb.database, name: refOrDb.name, id: nameOrId };
  }
  return { database: refOrDb, name: "", id: nameOrId };
});

let transactionGet = vi.fn();
let transactionUpdate = vi.fn();
let transactionSet = vi.fn();
const mockRunTransaction = vi.fn(async (_db, callback) =>
  callback({
    get: transactionGet,
    update: transactionUpdate,
    set: transactionSet,
  }),
);

vi.mock("firebase/firestore", () => ({
  addDoc: (...args) => mockAddDoc(...args),
  collection: (...args) => mockCollection(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  doc: (...args) => mockDoc(...args),
  runTransaction: (...args) => mockRunTransaction(...args),
  serverTimestamp: (...args) => mockServerTimestamp(...args),
  setDoc: (...args) => mockSetDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  where: (...args) => mockWhere(...args),
  query: (...args) => mockQuery(...args),
  getDocs: (...args) => mockGetDocs(...args),
}));

import {
  assignMaterialsToTaskWithDeduction,
  buildTaskMaterialAllocationId,
  createMaterial,
  listProjectMaterials,
  listProjectMaterialTransactions,
  listTaskMaterialAllocations,
  listTaskMaterialTransactions,
  removeMaterial,
  removeTaskMaterialAllocation,
  updateMaterial,
  upsertTaskMaterialAllocation,
} from "../utils/materialsRepository";

const makeSnap = (rows) => ({
  docs: rows.map((row) => ({
    id: row.id,
    data: () => row,
  })),
});

const makeTxDocSnap = ({ id, data, exists = true }) => ({
  id,
  exists: () => exists,
  data: () => data,
});

describe("materialsRepository reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionGet = vi.fn();
    transactionUpdate = vi.fn();
    transactionSet = vi.fn();
  });

  it("returns empty list when project materials params are missing", async () => {
    const result = await listProjectMaterials({ organizationId: "", projectId: "p1" });
    expect(result).toEqual([]);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it("loads and normalizes project materials", async () => {
    mockGetDocs.mockResolvedValueOnce(
      makeSnap([
        {
          id: "m1",
          organizationId: "org-1",
          projectId: "p1",
          name: " Copper Pipe ",
          quantityOnHand: "12",
          minimumThreshold: "2",
          status: "active",
        },
      ]),
    );

    const rows = await listProjectMaterials({
      organizationId: "org-1",
      projectId: "p1",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        id: "m1",
        name: "Copper Pipe",
        quantityOnHand: 12,
        minimumThreshold: 2,
      }),
    );

    expect(mockCollection).toHaveBeenCalledWith(expect.anything(), "materials");
    expect(mockWhere).toHaveBeenCalledWith("organizationId", "==", "org-1");
    expect(mockWhere).toHaveBeenCalledWith("projectId", "==", "p1");
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });

  it("loads and normalizes task allocations", async () => {
    mockGetDocs.mockResolvedValueOnce(
      makeSnap([
        {
          id: "a1",
          organizationId: "org-1",
          projectId: "p1",
          taskId: "t1",
          materialId: "m1",
          quantityRequired: "3",
        },
      ]),
    );

    const rows = await listTaskMaterialAllocations({
      organizationId: "org-1",
      projectId: "p1",
      taskId: "t1",
    });

    expect(rows).toEqual([
      expect.objectContaining({
        id: "a1",
        taskId: "t1",
        materialId: "m1",
        quantityRequired: 3,
      }),
    ]);

    expect(mockCollection).toHaveBeenCalledWith(
      expect.anything(),
      "taskMaterialAllocations",
    );
    expect(mockWhere).toHaveBeenCalledWith("taskId", "==", "t1");
  });

  it("loads project-level material transactions", async () => {
    mockGetDocs.mockResolvedValueOnce(
      makeSnap([
        {
          id: "tx-1",
          organizationId: "org-1",
          projectId: "p1",
          taskId: "t1",
          materialId: "m1",
          type: "TASK_ASSIGNMENT_DEDUCTION",
          quantityDelta: -2,
          beforeQty: 7,
          afterQty: 5,
          performedBy: "mgr-1",
          note: "Assigned to task",
        },
      ]),
    );

    const rows = await listProjectMaterialTransactions({
      organizationId: "org-1",
      projectId: "p1",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        id: "tx-1",
        type: "TASK_ASSIGNMENT_DEDUCTION",
        quantityDelta: -2,
        beforeQty: 7,
        afterQty: 5,
      }),
    );
  });

  it("filters transactions by task id", async () => {
    mockGetDocs.mockResolvedValueOnce(
      makeSnap([
        {
          id: "tx-2",
          organizationId: "org-1",
          projectId: "p1",
          taskId: "task-22",
          materialId: "m5",
          type: "TASK_ASSIGNMENT_DEDUCTION",
          quantityDelta: -1,
          beforeQty: 8,
          afterQty: 7,
          performedBy: "mgr-1",
        },
      ]),
    );

    const rows = await listTaskMaterialTransactions({
      organizationId: "org-1",
      projectId: "p1",
      taskId: "task-22",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].taskId).toBe("task-22");
    expect(mockWhere).toHaveBeenCalledWith("taskId", "==", "task-22");
  });
});

describe("materialsRepository writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionGet = vi.fn();
    transactionUpdate = vi.fn();
    transactionSet = vi.fn();
  });

  it("creates a material with normalized values", async () => {
    mockAddDoc.mockResolvedValueOnce({ id: "m-new" });

    const result = await createMaterial({
      organizationId: "org-1",
      projectId: "p1",
      name: "  PVC Pipe  ",
      unit: "pcs",
      quantityOnHand: "12",
      minimumThreshold: "2",
      createdBy: "mgr-1",
    });

    expect(result.id).toBe("m-new");
    expect(mockAddDoc).toHaveBeenCalledWith(
      expect.objectContaining({ name: "materials" }),
      expect.objectContaining({
        organizationId: "org-1",
        projectId: "p1",
        name: "PVC Pipe",
        quantityOnHand: 12,
        minimumThreshold: 2,
        status: "active",
      }),
    );
  });

  it("updates material quantity and auto-sets status", async () => {
    await updateMaterial({
      materialId: "m1",
      updates: { quantityOnHand: 0, minimumThreshold: 3 },
    });

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ name: "materials", id: "m1" }),
      expect.objectContaining({
        quantityOnHand: 0,
        minimumThreshold: 3,
        status: "depleted",
      }),
    );
  });

  it("removes a material document", async () => {
    await removeMaterial({ materialId: "m9" });

    expect(mockDeleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ name: "materials", id: "m9" }),
    );
  });

  it("upserts a task material allocation with deterministic id", async () => {
    const result = await upsertTaskMaterialAllocation({
      organizationId: "org-1",
      projectId: "p1",
      taskId: "t1",
      materialId: "m1",
      quantityRequired: "5",
      updatedBy: "mgr-1",
    });

    expect(result.id).toBe("t1_m1");
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ name: "taskMaterialAllocations", id: "t1_m1" }),
      expect.objectContaining({ quantityRequired: 5 }),
      { merge: true },
    );
  });

  it("removes a task material allocation by deterministic id", async () => {
    await removeTaskMaterialAllocation({ taskId: "t1", materialId: "m1" });

    expect(mockDeleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ name: "taskMaterialAllocations", id: "t1_m1" }),
    );
  });

  it("builds deterministic task material allocation id", () => {
    expect(buildTaskMaterialAllocationId(" task-2 ", " mat-7 ")).toBe(
      "task-2_mat-7",
    );
  });

  it("assigns materials with atomic stock deduction", async () => {
    transactionGet = vi.fn(async (ref) => {
      if (ref.id === "m1") {
        return makeTxDocSnap({
          id: "m1",
          data: {
            organizationId: "org-1",
            projectId: "p1",
            name: "Wire",
            unit: "roll",
            quantityOnHand: 10,
          },
        });
      }
      return makeTxDocSnap({
        id: "m2",
        data: {
          organizationId: "org-1",
          projectId: "p1",
          name: "Pipe",
          unit: "m",
          quantityOnHand: 5,
        },
      });
    });

    const result = await assignMaterialsToTaskWithDeduction({
      organizationId: "org-1",
      projectId: "p1",
      taskId: "task-1",
      allocations: [
        { materialId: "m1", quantityRequired: 2 },
        { materialId: "m1", quantityRequired: 1 },
        { materialId: "m2", quantityRequired: 5 },
      ],
      performedBy: "mgr-1",
    });

    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(transactionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "materials", id: "m1" }),
      expect.objectContaining({ quantityOnHand: 7, status: "active" }),
    );
    expect(transactionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "materials", id: "m2" }),
      expect.objectContaining({ quantityOnHand: 0, status: "depleted" }),
    );

    const assignmentWrites = transactionSet.mock.calls.filter(
      ([ref]) => ref.name === "taskMaterialAllocations",
    );
    const logWrites = transactionSet.mock.calls.filter(
      ([, payload]) => payload.type === "TASK_ASSIGNMENT_DEDUCTION",
    );

    expect(assignmentWrites).toHaveLength(2);
    expect(logWrites).toHaveLength(2);
    expect(result.allocationIds).toEqual(["task-1_m1", "task-1_m2"]);
    expect(result.deductionLog).toHaveLength(2);
  });

  it("fails atomic deduction when stock is insufficient", async () => {
    transactionGet = vi.fn(async () =>
      makeTxDocSnap({
        id: "m1",
        data: {
          organizationId: "org-1",
          projectId: "p1",
          name: "Pipe",
          quantityOnHand: 1,
        },
      }),
    );

    await expect(
      assignMaterialsToTaskWithDeduction({
        organizationId: "org-1",
        projectId: "p1",
        taskId: "task-1",
        allocations: [{ materialId: "m1", quantityRequired: 2 }],
      }),
    ).rejects.toThrow("Insufficient stock");

    expect(transactionUpdate).not.toHaveBeenCalled();
  });
});
