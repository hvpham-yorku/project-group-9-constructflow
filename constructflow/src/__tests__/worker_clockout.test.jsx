import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkerDashboard from "../pages/WorkerDashboard";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("../components/Sidebar", () => ({
  default: () => <nav data-testid="sidebar" />,
}));

vi.mock("../components/Header", () => ({
  default: ({ title }) => <header data-testid="header">{title}</header>,
}));

const mockAuth = vi.fn();
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => mockAuth(),
}));

vi.mock("../firebase", () => ({ db: {} }));

vi.mock("../utils/materialsRepository", () => ({
  listProjectMaterials: vi.fn(async () => []),
  listTaskMaterialAllocations: vi.fn(async () => []),
}));

const mockCollection = vi.fn((database, name) => ({ database, name }));
const mockDoc = vi.fn((refOrDb, nameOrId, maybeId) => {
  if (maybeId !== undefined) {
    return { database: refOrDb, name: nameOrId, id: maybeId };
  }
  return { database: refOrDb, name: "", id: nameOrId };
});
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockQuery = vi.fn((ref, ...clauses) => ({ ref, clauses }));
const mockWhere = vi.fn((field, op, value) => ({ field, op, value }));
const mockUpdateDoc = vi.fn(() => Promise.resolve());
const mockSetDoc = vi.fn(() => Promise.resolve());
const mockServerTimestamp = vi.fn(() => "__ts__");

vi.mock("firebase/firestore", () => ({
  collection: (...args) => mockCollection(...args),
  doc: (...args) => mockDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  serverTimestamp: (...args) => mockServerTimestamp(...args),
}));

const AUTH = {
  currentUser: { uid: "wkr-1", email: "worker@test.com" },
  userProfile: {
    uid: "wkr-1",
    name: "Bob Plumber",
    role: "plumber",
    organizationId: "org-1",
  },
  organizationId: "org-1",
};

const addMinutes = (date, mins) => new Date(date.getTime() + mins * 60 * 1000);

const buildShift = ({ startOffsetMin, endOffsetMin }) => {
  const now = new Date();
  return {
    shiftStartAt: addMinutes(now, startOffsetMin),
    shiftEndAt: addMinutes(now, endOffsetMin),
  };
};

const toDayKey = (date) => {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const makeDocSnap = (id, data) => ({
  id,
  exists: () => true,
  data: () => data,
});

const makeSnap = (rows) => {
  const docs = rows.map((row) => ({
    id: row.id,
    data: () => row,
  }));

  return {
    docs,
    forEach: (cb) => docs.forEach(cb),
  };
};

const setupPage = (workerRecord) => {
  mockGetDoc.mockResolvedValue(makeDocSnap("wkr-1", workerRecord));

  mockGetDocs.mockImplementation(async (queryRef) => {
    const collectionName = queryRef?.ref?.name || queryRef?.name || "";

    if (collectionName === "projects") {
      return makeSnap([
        {
          id: "p1",
          organizationId: "org-1",
          name: "Project 1",
          status: "active",
        },
      ]);
    }

    if (collectionName === "tasks") {
      return makeSnap([]);
    }

    return makeSnap([]);
  });

  render(<WorkerDashboard />);
};

describe("Clock out and record daily attendance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockReturnValue(AUTH);
  });

  it("Test 1: worker can clock out and attendance is recorded", async () => {
    const shift = buildShift({ startOffsetMin: -120, endOffsetMin: 120 });
    const clockInAt = addMinutes(new Date(), -90);
    const expectedDayKey = toDayKey(clockInAt);

    setupPage({
      organizationId: "org-1",
      role: "plumber",
      shiftStartAt: shift.shiftStartAt,
      shiftEndAt: shift.shiftEndAt,
      isClockedIn: true,
      clockedInAt: clockInAt,
      clockedOutAt: null,
    });

    await screen.findByText("In shift now");

    const clockInBtn = screen.getByRole("button", { name: /clock in/i });
    const clockOutBtn = screen.getByRole("button", { name: /clock out/i });

    expect(clockInBtn).toBeDisabled();
    expect(clockOutBtn).toBeEnabled();

    fireEvent.click(clockOutBtn);

    await screen.findByText("Clocked out successfully.");

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ id: "wkr-1" }),
      expect.objectContaining({
        isClockedIn: false,
        clockedOutAt: "__ts__",
      }),
    );

    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ name: "workerAttendance", id: `wkr-1_${expectedDayKey}` }),
      expect.objectContaining({
        organizationId: "org-1",
        workerId: "wkr-1",
        workerName: "Bob Plumber",
        dayKey: expectedDayKey,
        updatedAt: "__ts__",
      }),
      { merge: true },
    );

    expect(screen.getByRole("button", { name: /clock out/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /clock in/i })).toBeDisabled();
  });

  it("Test 2: worker cannot clock out if not clocked in", async () => {
    const shift = buildShift({ startOffsetMin: -120, endOffsetMin: 120 });

    setupPage({
      organizationId: "org-1",
      role: "plumber",
      shiftStartAt: shift.shiftStartAt,
      shiftEndAt: shift.shiftEndAt,
      isClockedIn: false,
      clockedInAt: null,
      clockedOutAt: null,
    });

    await screen.findByText("Shift active - clock in required");

    const clockOutBtn = screen.getByRole("button", { name: /clock out/i });
    expect(clockOutBtn).toBeDisabled();

    fireEvent.click(clockOutBtn);

    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("Test 3: shows error when clock out write fails", async () => {
    mockUpdateDoc.mockRejectedValueOnce(new Error("write failed"));

    const shift = buildShift({ startOffsetMin: -120, endOffsetMin: 120 });
    const clockInAt = addMinutes(new Date(), -60);

    setupPage({
      organizationId: "org-1",
      role: "plumber",
      shiftStartAt: shift.shiftStartAt,
      shiftEndAt: shift.shiftEndAt,
      isClockedIn: true,
      clockedInAt: clockInAt,
      clockedOutAt: null,
    });

    await screen.findByText("In shift now");

    fireEvent.click(screen.getByRole("button", { name: /clock out/i }));

    await screen.findByText("Failed to clock out.");
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    expect(mockSetDoc).not.toHaveBeenCalled();

    expect(screen.getByRole("button", { name: /clock out/i })).toBeEnabled();
  });
});
