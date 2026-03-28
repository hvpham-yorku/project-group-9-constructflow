import { describe, it, expect } from "vitest";
import {
  normalizeInventoryMaterial,
  normalizeTaskAllocation,
  mergeAllocationsByMaterial,
  validateAssignmentDeduction,
  applyAssignmentDeduction,
} from "../utils/inventoryDomain";

describe("inventoryDomain", () => {
  it("normalizes inventory fields and clamps negative quantities", () => {
    const result = normalizeInventoryMaterial({
      id: " m1 ",
      name: " Copper Pipe ",
      quantityOnHand: -5,
      minimumThreshold: -2,
      status: "anything",
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: "m1",
        name: "Copper Pipe",
        quantityOnHand: 0,
        minimumThreshold: 0,
        status: "active",
      }),
    );
  });

  it("normalizes task allocations", () => {
    const result = normalizeTaskAllocation({
      materialId: " mat-1 ",
      quantityRequired: "3",
    });

    expect(result).toEqual({
      materialId: "mat-1",
      quantityRequired: 3,
    });
  });

  it("merges duplicate allocations by materialId", () => {
    const merged = mergeAllocationsByMaterial([
      { materialId: "a", quantityRequired: 2 },
      { materialId: "a", quantityRequired: 1.5 },
      { materialId: "b", quantityRequired: 4 },
    ]);

    expect(merged).toEqual([
      { materialId: "a", quantityRequired: 3.5 },
      { materialId: "b", quantityRequired: 4 },
    ]);
  });

  it("validates missing materials", () => {
    const validation = validateAssignmentDeduction(
      [{ id: "a", name: "PVC", quantityOnHand: 10 }],
      [{ materialId: "missing", quantityRequired: 2 }],
    );

    expect(validation.ok).toBe(false);
    expect(validation.errors[0].code).toBe("MATERIAL_NOT_FOUND");
  });

  it("validates insufficient stock", () => {
    const validation = validateAssignmentDeduction(
      [{ id: "a", name: "PVC", quantityOnHand: 1 }],
      [{ materialId: "a", quantityRequired: 2 }],
    );

    expect(validation.ok).toBe(false);
    expect(validation.errors[0].code).toBe("INSUFFICIENT_STOCK");
  });

  it("deducts material quantities when validation passes", () => {
    const { updatedInventory, deductionLog } = applyAssignmentDeduction(
      [
        { id: "a", name: "PVC", quantityOnHand: 10, status: "active" },
        { id: "b", name: "Wire", quantityOnHand: 5, status: "active" },
      ],
      [
        { materialId: "a", quantityRequired: 2 },
        { materialId: "b", quantityRequired: 5 },
      ],
    );

    expect(updatedInventory.find((m) => m.id === "a").quantityOnHand).toBe(8);
    expect(updatedInventory.find((m) => m.id === "b").quantityOnHand).toBe(0);
    expect(updatedInventory.find((m) => m.id === "b").status).toBe("depleted");
    expect(deductionLog).toHaveLength(2);
  });

  it("throws with details when deduction is invalid", () => {
    expect(() =>
      applyAssignmentDeduction(
        [{ id: "a", name: "PVC", quantityOnHand: 1 }],
        [{ materialId: "a", quantityRequired: 2 }],
      ),
    ).toThrow("Inventory assignment deduction failed");
  });

  it("does not mutate the original inventory array", () => {
    const source = [{ id: "a", name: "PVC", quantityOnHand: 4 }];
    const copy = JSON.parse(JSON.stringify(source));

    applyAssignmentDeduction(source, [{ materialId: "a", quantityRequired: 1 }]);

    expect(source).toEqual(copy);
  });
});
