import { describe, it, expect } from "vitest";
import {
  MATERIAL_COLLECTIONS,
  MATERIAL_STATUS,
  MATERIAL_TRANSACTION_TYPE,
  TASK_STATUS,
  DEFAULT_MATERIAL_UNIT,
  MATERIAL_UNITS,
} from "../utils/materialsConstants";

describe("materialsConstants", () => {
  it("has stable collection names", () => {
    expect(MATERIAL_COLLECTIONS).toEqual({
      MATERIALS: "materials",
      TASK_ALLOCATIONS: "taskMaterialAllocations",
      TRANSACTIONS: "materialTransactions",
    });
  });

  it("has expected material statuses", () => {
    expect(MATERIAL_STATUS.ACTIVE).toBe("active");
    expect(MATERIAL_STATUS.DEPLETED).toBe("depleted");
  });

  it("has expected transaction types", () => {
    expect(MATERIAL_TRANSACTION_TYPE.TASK_ASSIGNMENT_DEDUCTION).toBe(
      "TASK_ASSIGNMENT_DEDUCTION",
    );
    expect(MATERIAL_TRANSACTION_TYPE.RESTOCK).toBe("RESTOCK");
    expect(MATERIAL_TRANSACTION_TYPE.MANUAL_ADJUSTMENT).toBe(
      "MANUAL_ADJUSTMENT",
    );
  });

  it("has expected task statuses", () => {
    expect(TASK_STATUS.OPEN).toBe("open");
    expect(TASK_STATUS.IN_PROGRESS).toBe("in_progress");
    expect(TASK_STATUS.COMPLETED).toBe("completed");
  });

  it("contains default unit in unit list", () => {
    expect(DEFAULT_MATERIAL_UNIT).toBe("unit");
    expect(MATERIAL_UNITS).toContain(DEFAULT_MATERIAL_UNIT);
    expect(MATERIAL_UNITS.length).toBeGreaterThan(1);
  });
});
