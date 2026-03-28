import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../firebase", () => ({ db: {} }));

const mockCollection = vi.fn((database, name) => ({ database, name }));
const mockWhere = vi.fn((field, op, value) => ({ field, op, value }));
const mockQuery = vi.fn((ref, ...clauses) => ({ ref, clauses }));
const mockGetDocs = vi.fn();

vi.mock("firebase/firestore", () => ({
  collection: (...args) => mockCollection(...args),
  where: (...args) => mockWhere(...args),
  query: (...args) => mockQuery(...args),
  getDocs: (...args) => mockGetDocs(...args),
}));

import {
  listProjectMaterials,
  listTaskMaterialAllocations,
  listProjectMaterialTransactions,
  listTaskMaterialTransactions,
} from "../utils/materialsRepository";

const makeSnap = (rows) => ({
  docs: rows.map((row) => ({
    id: row.id,
    data: () => row,
  })),
});

describe("materialsRepository reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
