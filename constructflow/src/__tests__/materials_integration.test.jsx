/**
 * materials_integration.test.jsx
 *
 * End-to-end integration tests for materials workflow covering:
 *
 *  1. Manager can create multiple materials for a project
 *  2. Manager can attach single material to task (deducts stock)
 *  3. Manager can attach same material to multiple tasks (deducts cumulatively)
 *  4. Manager cannot attach more than available stock (error caught)
 *  5. Worker can see all material attachments for their tasks
 *  6. Transaction log records all deductions with before/after quantities
 *  7. Material status transitions to "Depleted" when quantity reaches zero
 *  8. Project-level transaction log shows all material deductions
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Firebase
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
  createMaterial,
  listProjectMaterials,
  listTaskMaterialAllocations,
  listProjectMaterialTransactions,
  updateMaterial,
  removeMaterial,
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

// ── Tests ───────────────────────────────────────────────────────────────────
describe("Materials Integration Workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionGet = vi.fn();
    transactionUpdate = vi.fn();
    transactionSet = vi.fn();
  });

  // ── Test 1 ── Manager creates multiple materials ─────────────────────────
  it("1. Manager can create multiple materials for a project", async () => {
    mockAddDoc
      .mockResolvedValueOnce({ id: "m-1" })
      .mockResolvedValueOnce({ id: "m-2" });

    const mat1 = await createMaterial({
      organizationId: "org-1",
      projectId: "proj-1",
      name: "Copper Pipe",
      unit: "meters",
      quantityOnHand: "50",
      createdBy: "mgr-1",
    });

    const mat2 = await createMaterial({
      organizationId: "org-1",
      projectId: "proj-1",
      name: "PVC Pipe",
      unit: "pcs",
      quantityOnHand: "30",
      createdBy: "mgr-1",
    });

    expect(mat1.id).toBe("m-1");
    expect(mat2.id).toBe("m-2");
    expect(mockAddDoc).toHaveBeenCalledTimes(2);
    expect(mockAddDoc).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        name: "Copper Pipe",
        unit: "meters",
        quantityOnHand: 50,
        organizationId: "org-1",
        projectId: "proj-1",
      }),
    );
    expect(mockAddDoc).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        name: "PVC Pipe",
        unit: "pcs",
        quantityOnHand: 30,
      }),
    );
  });

  // ── Test 2 ── Manager attaches material to task with stock deduction ────
  it("2. Manager can attach a single material to a task and stock deducts", async () => {
    const orgId = "org-1";
    const projId = "proj-1";
    const taskId = "task-1";
    const matId = "m-1";

    transactionGet.mockResolvedValueOnce(
      makeTxDocSnap({
        id: matId,
        data: {
          organizationId: orgId,
          projectId: projId,
          name: "Copper Pipe",
          unit: "meters",
          quantityOnHand: 50,
          status: "active",
        },
      }),
    );

    const result = await assignMaterialsToTaskWithDeduction({
      organizationId: orgId,
      projectId: projId,
      taskId,
      allocations: [{ materialId: matId, quantityRequired: 10 }],
      performedBy: "mgr-1",
    });

    // Verify material stock was deducted
    expect(transactionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: matId }),
      expect.objectContaining({
        quantityOnHand: 40, // 50 - 10
        status: "active",
      }),
    );

    // Verify allocation created
    expect(transactionSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: `${taskId}_${matId}` }),
      expect.objectContaining({
        taskId,
        materialId: matId,
        quantityRequired: 10,
      }),
      expect.any(Object),
    );

    // Verify transaction log created
    const logCalls = transactionSet.mock.calls.filter(
      ([, payload]) => payload?.type === "TASK_ASSIGNMENT_DEDUCTION",
    );
    expect(logCalls).toHaveLength(1);
    expect(logCalls[0][1]).toEqual(
      expect.objectContaining({
        type: "TASK_ASSIGNMENT_DEDUCTION",
        quantityDelta: -10,
        beforeQty: 50,
        afterQty: 40,
      }),
    );

    expect(result.allocationIds).toContain(`${taskId}_${matId}`);
  });

  // ── Test 3 ── Same material attached to multiple tasks deducts cumulatively
  it("3. Manager attaching same material to multiple tasks deducts stock cumulatively", async () => {
    const orgId = "org-1";
    const projId = "proj-1";
    const matId = "m-1";
    const deductionLogs = [];

    // First assignment: task-1 gets 10 units
    transactionGet.mockResolvedValueOnce(
      makeTxDocSnap({
        id: matId,
        data: {
          organizationId: orgId,
          projectId: projId,
          name: "Copper Pipe",
          unit: "meters",
          quantityOnHand: 50,
          status: "active",
        },
      }),
    );

    mockRunTransaction.mockImplementationOnce(async (_db, callback) => {
      return callback({
        get: transactionGet,
        update: transactionUpdate,
        set: (ref, payload) => {
          if (payload?.type === "TASK_ASSIGNMENT_DEDUCTION") {
            deductionLogs.push(payload);
          }
          transactionSet(ref, payload);
        },
      });
    });

    await assignMaterialsToTaskWithDeduction({
      organizationId: orgId,
      projectId: projId,
      taskId: "task-1",
      allocations: [{ materialId: matId, quantityRequired: 10 }],
      performedBy: "mgr-1",
    });

    // Second assignment: task-2 gets 15 units (from remaining 40)
    vi.clearAllMocks();
    transactionGet = vi.fn();
    transactionUpdate = vi.fn();
    transactionSet = vi.fn();

    transactionGet.mockResolvedValueOnce(
      makeTxDocSnap({
        id: matId,
        data: {
          organizationId: orgId,
          projectId: projId,
          name: "Copper Pipe",
          unit: "meters",
          quantityOnHand: 40,
          status: "active",
        },
      }),
    );

    mockRunTransaction.mockImplementationOnce(async (_db, callback) => {
      return callback({
        get: transactionGet,
        update: transactionUpdate,
        set: (ref, payload) => {
          if (payload?.type === "TASK_ASSIGNMENT_DEDUCTION") {
            deductionLogs.push(payload);
          }
          transactionSet(ref, payload);
        },
      });
    });

    await assignMaterialsToTaskWithDeduction({
      organizationId: orgId,
      projectId: projId,
      taskId: "task-2",
      allocations: [{ materialId: matId, quantityRequired: 15 }],
      performedBy: "mgr-1",
    });

    // Verify cumulative deductions
    expect(deductionLogs).toHaveLength(2);
    expect(deductionLogs[0]).toEqual(
      expect.objectContaining({
        quantityDelta: -10,
        beforeQty: 50,
        afterQty: 40,
      }),
    );
    expect(deductionLogs[1]).toEqual(
      expect.objectContaining({
        quantityDelta: -15,
        beforeQty: 40,
        afterQty: 25,
      }),
    );
  });

  // ── Test 4 ── Attached material exceeding stock is rejected ──────────────
  it("4. Manager cannot attach more material than available (insufficient stock error)", async () => {
    const orgId = "org-1";
    const projId = "proj-1";
    const taskId = "task-1";
    const matId = "m-1";

    transactionGet.mockResolvedValueOnce(
      makeTxDocSnap({
        id: matId,
        data: {
          organizationId: orgId,
          projectId: projId,
          name: "Copper Pipe",
          unit: "meters",
          quantityOnHand: 20, // Only 20 available
          status: "active",
        },
      }),
    );

    // Test that insufficient stock triggers an error in the transaction
    await expect(
      assignMaterialsToTaskWithDeduction({
        organizationId: orgId,
        projectId: projId,
        taskId,
        allocations: [{ materialId: matId, quantityRequired: 50 }], // More than available
        performedBy: "mgr-1",
      }),
    ).rejects.toThrow(/insufficient stock/i);

    // The repository function should have called runTransaction
    expect(mockRunTransaction).toHaveBeenCalled();
  });

  // ── Test 5 ── Worker sees materials through allocation lookup ──────────────
  it("5. Worker can see all material attachments for their tasks via allocations", async () => {
    const orgId = "org-1";
    const projId = "proj-1";
    const taskId = "task-1";

    mockGetDocs.mockImplementation((queryRef) => {
      if (queryRef.ref?.name === "taskMaterialAllocations") {
        return Promise.resolve(
          makeSnap([
            {
              id: `${taskId}_m-1`,
              taskId,
              materialId: "m-1",
              quantityRequired: 10,
              organizationId: orgId,
              projectId: projId,
            },
            {
              id: `${taskId}_m-2`,
              taskId,
              materialId: "m-2",
              quantityRequired: 20,
              organizationId: orgId,
              projectId: projId,
            },
          ]),
        );
      }
      return Promise.resolve(makeSnap([]));
    });

    const allocations = await listTaskMaterialAllocations({
      organizationId: orgId,
      projectId: projId,
      taskId,
    });

    expect(allocations).toHaveLength(2);
    expect(allocations[0]).toEqual(
      expect.objectContaining({
        materialId: "m-1",
        quantityRequired: 10,
      }),
    );
    expect(allocations[1]).toEqual(
      expect.objectContaining({
        materialId: "m-2",
        quantityRequired: 20,
      }),
    );
  });

  // ── Test 6 ── Transaction log records deductions ───────────────────────
  it("6. Transaction log records all deductions with before/after quantities", async () => {
    const orgId = "org-1";
    const projId = "proj-1";
    const taskId = "task-1";
    const matId = "m-1";

    const transactionLogs = [];

    transactionGet.mockResolvedValueOnce(
      makeTxDocSnap({
        id: matId,
        data: {
          organizationId: orgId,
          projectId: projId,
          name: "Wire",
          unit: "roll",
          quantityOnHand: 100,
          status: "active",
        },
      }),
    );

    mockRunTransaction.mockImplementationOnce(async (_db, callback) => {
      return callback({
        get: transactionGet,
        update: transactionUpdate,
        set: (ref, payload) => {
          if (payload?.type === "TASK_ASSIGNMENT_DEDUCTION") {
            transactionLogs.push(payload);
          }
          transactionSet(ref, payload);
        },
      });
    });

    await assignMaterialsToTaskWithDeduction({
      organizationId: orgId,
      projectId: projId,
      taskId,
      allocations: [{ materialId: matId, quantityRequired: 25 }],
      performedBy: "mgr-1",
    });

    expect(transactionLogs).toHaveLength(1);
    expect(transactionLogs[0]).toEqual(
      expect.objectContaining({
        type: "TASK_ASSIGNMENT_DEDUCTION",
        organizationId: orgId,
        projectId: projId,
        taskId,
        materialId: matId,
        quantityDelta: -25,
        beforeQty: 100,
        afterQty: 75,
        performedBy: "mgr-1",
      }),
    );
  });

  // ── Test 7 ── Status transitions to Depleted at zero quantity ───────────
  it("7. Material status transitions to Depleted when quantity reaches zero", async () => {
    const orgId = "org-1";
    const projId = "proj-1";
    const taskId = "task-1";
    const matId = "m-1";

    transactionGet.mockResolvedValueOnce(
      makeTxDocSnap({
        id: matId,
        data: {
          organizationId: orgId,
          projectId: projId,
          name: "Rare Wire",
          unit: "roll",
          quantityOnHand: 10, // Exactly the amount to be used
          status: "active",
        },
      }),
    );

    await assignMaterialsToTaskWithDeduction({
      organizationId: orgId,
      projectId: projId,
      taskId,
      allocations: [{ materialId: matId, quantityRequired: 10 }],
      performedBy: "mgr-1",
    });

    // Verify material was updated with depleted status
    expect(transactionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: matId }),
      expect.objectContaining({
        quantityOnHand: 0,
        status: "depleted", // Should transition to depleted
      }),
    );
  });

  // ── Test 8 ── Transaction log entries can be queried by project ─────────
  it("8. Project-level transaction log shows all material deductions", async () => {
    const orgId = "org-1";
    const projId = "proj-1";

    mockGetDocs.mockResolvedValueOnce(
      makeSnap([
        {
          id: "tx-1",
          organizationId: orgId,
          projectId: projId,
          taskId: "task-1",
          materialId: "m-1",
          type: "TASK_ASSIGNMENT_DEDUCTION",
          quantityDelta: -10,
          beforeQty: 50,
          afterQty: 40,
          performedBy: "mgr-1",
          performedAt: new Date(),
        },
        {
          id: "tx-2",
          organizationId: orgId,
          projectId: projId,
          taskId: "task-2",
          materialId: "m-1",
          type: "TASK_ASSIGNMENT_DEDUCTION",
          quantityDelta: -15,
          beforeQty: 40,
          afterQty: 25,
          performedBy: "mgr-1",
          performedAt: new Date(),
        },
      ]),
    );

    const txns = await listProjectMaterialTransactions({
      organizationId: orgId,
      projectId: projId,
    });

    expect(txns).toHaveLength(2);
    expect(txns[0].quantityDelta).toBe(-10);
    expect(txns[1].quantityDelta).toBe(-15);
    // Total deducted: 25
  });
});
