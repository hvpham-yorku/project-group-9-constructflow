const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toNonNegative = (value, fallback = 0) =>
  Math.max(0, toNumber(value, fallback));

export const normalizeInventoryMaterial = (raw = {}) => ({
  id: String(raw.id || "").trim(),
  projectId: String(raw.projectId || "").trim(),
  name: String(raw.name || "").trim(),
  unit: String(raw.unit || "unit").trim(),
  quantityOnHand: toNonNegative(raw.quantityOnHand, 0),
  minimumThreshold: toNonNegative(raw.minimumThreshold, 0),
  status: raw.status === "depleted" ? "depleted" : "active",
  updatedAt: raw.updatedAt || null,
});

export const normalizeTaskAllocation = (raw = {}) => ({
  materialId: String(raw.materialId || "").trim(),
  quantityRequired: toNonNegative(raw.quantityRequired, 0),
});

export const mergeAllocationsByMaterial = (allocations = []) => {
  const totals = new Map();

  allocations
    .map(normalizeTaskAllocation)
    .filter((row) => row.materialId && row.quantityRequired > 0)
    .forEach((row) => {
      const prev = totals.get(row.materialId) || 0;
      totals.set(row.materialId, prev + row.quantityRequired);
    });

  return Array.from(totals.entries()).map(([materialId, quantityRequired]) => ({
    materialId,
    quantityRequired,
  }));
};

export const buildInventoryById = (inventoryItems = []) =>
  inventoryItems
    .map(normalizeInventoryMaterial)
    .filter((item) => item.id)
    .reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});

export const validateAssignmentDeduction = (inventoryItems = [], allocations = []) => {
  const inventoryById = buildInventoryById(inventoryItems);
  const mergedAllocations = mergeAllocationsByMaterial(allocations);
  const errors = [];

  mergedAllocations.forEach((allocation) => {
    const material = inventoryById[allocation.materialId];

    if (!material) {
      errors.push({
        code: "MATERIAL_NOT_FOUND",
        materialId: allocation.materialId,
        required: allocation.quantityRequired,
      });
      return;
    }

    if (material.quantityOnHand < allocation.quantityRequired) {
      errors.push({
        code: "INSUFFICIENT_STOCK",
        materialId: allocation.materialId,
        materialName: material.name,
        available: material.quantityOnHand,
        required: allocation.quantityRequired,
      });
    }
  });

  return {
    ok: errors.length === 0,
    errors,
  };
};

export const applyAssignmentDeduction = (inventoryItems = [], allocations = []) => {
  const normalizedInventory = inventoryItems.map(normalizeInventoryMaterial);
  const mergedAllocations = mergeAllocationsByMaterial(allocations);
  const validation = validateAssignmentDeduction(normalizedInventory, mergedAllocations);

  if (!validation.ok) {
    const err = new Error("Inventory assignment deduction failed");
    err.details = validation.errors;
    throw err;
  }

  const deductionById = mergedAllocations.reduce((acc, row) => {
    acc[row.materialId] = row.quantityRequired;
    return acc;
  }, {});

  const deductionLog = [];
  const updatedInventory = normalizedInventory.map((item) => {
    const deductQty = deductionById[item.id] || 0;
    if (deductQty <= 0) return item;

    const beforeQty = item.quantityOnHand;
    const afterQty = Math.max(0, beforeQty - deductQty);

    const updated = {
      ...item,
      quantityOnHand: afterQty,
      status: afterQty === 0 ? "depleted" : "active",
    };

    deductionLog.push({
      materialId: item.id,
      materialName: item.name,
      deducted: deductQty,
      beforeQty,
      afterQty,
    });

    return updated;
  });

  return {
    updatedInventory,
    deductionLog,
  };
};
