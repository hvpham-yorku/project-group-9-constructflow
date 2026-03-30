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

describe("Clock in during assigned shift", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockReturnValue(AUTH);
  });

  it("Test 1: worker can clock in during active shift", async () => {
    const shift = buildShift({ startOffsetMin: -10, endOffsetMin: 120 });

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

    const clockInBtn = screen.getByRole("button", { name: /clock in/i });
    const clockOutBtn = screen.getByRole("button", { name: /clock out/i });

    expect(clockInBtn).toBeEnabled();
    expect(clockOutBtn).toBeDisabled();

    fireEvent.click(clockInBtn);

    await screen.findByText("Clocked in successfully.");

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ id: "wkr-1" }),
      expect.objectContaining({
        isClockedIn: true,
        clockedInAt: "__ts__",
        clockedOutAt: null,
      }),
    );

    expect(screen.getByRole("button", { name: /clock in/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /clock out/i })).toBeEnabled();
    expect(screen.getByText("In shift now")).toBeInTheDocument();
  });

  it("Test 2: worker cannot clock in before shift starts", async () => {
    const shift = buildShift({ startOffsetMin: 60, endOffsetMin: 9 * 60 });

    setupPage({
      organizationId: "org-1",
      role: "plumber",
      shiftStartAt: shift.shiftStartAt,
      shiftEndAt: shift.shiftEndAt,
      isClockedIn: false,
      clockedInAt: null,
      clockedOutAt: null,
    });

    await screen.findByText("Upcoming shift");

    fireEvent.click(screen.getByRole("button", { name: /clock in/i }));

    await screen.findByText("Clock in is only available during your assigned shift.");
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it("Test 3: worker cannot clock in after shift ends", async () => {
    const shift = buildShift({ startOffsetMin: -9 * 60, endOffsetMin: -60 });

    setupPage({
      organizationId: "org-1",
      role: "plumber",
      shiftStartAt: shift.shiftStartAt,
      shiftEndAt: shift.shiftEndAt,
      isClockedIn: false,
      clockedInAt: null,
      clockedOutAt: null,
    });

    await screen.findByText("Shift ended");

    fireEvent.click(screen.getByRole("button", { name: /clock in/i }));

    await screen.findByText("Clock in is only available during your assigned shift.");
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });
});
