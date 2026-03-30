import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ShiftPlannerPage from "../pages/ShiftPlannerPage";

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

const mockCollection = vi.fn((database, name) => ({ database, name }));
const mockWhere = vi.fn((field, op, value) => ({ field, op, value }));
const mockQuery = vi.fn((ref, ...clauses) => ({ ref, clauses }));
const mockGetDocs = vi.fn();
const mockAddDoc = vi.fn();
const mockDeleteDoc = vi.fn(() => Promise.resolve());
const mockServerTimestamp = vi.fn(() => "__ts__");
const mockUpdateDoc = vi.fn(() => Promise.resolve());
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

vi.mock("firebase/firestore", () => ({
  addDoc: (...args) => mockAddDoc(...args),
  collection: (...args) => mockCollection(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  doc: (...args) => mockDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  query: (...args) => mockQuery(...args),
  serverTimestamp: (...args) => mockServerTimestamp(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  where: (...args) => mockWhere(...args),
}));

const AUTH = {
  currentUser: { uid: "mgr-1", email: "manager@test.com" },
  userProfile: {
    uid: "mgr-1",
    name: "Alice Manager",
    role: "manager",
    organizationId: "org-1",
  },
  organizationId: "org-1",
};

const makeSnap = (rows) => ({
  docs: rows.map((row) => ({
    id: row.id,
    data: () => row,
  })),
});

const setupFirestore = () => {
  mockGetDocs.mockImplementation(async (queryRef) => {
    const collectionName = queryRef?.ref?.name || queryRef?.name || "";

    if (collectionName === "users") {
      return makeSnap([
        {
          id: "wkr-1",
          organizationId: "org-1",
          role: "plumber",
          name: "Bob Worker",
          email: "bob@test.com",
        },
      ]);
    }

    if (collectionName === "workerShifts") {
      return makeSnap([]);
    }

    if (collectionName === "workerAttendance") {
      return makeSnap([]);
    }

    return makeSnap([]);
  });

  mockAddDoc.mockResolvedValue({ id: "shift-1" });
};

const getCellIndex = (dayIndex, hour) => dayIndex * 24 + hour;

const dragShift = ({ container, dayIndex = 0, startHour, endHour }) => {
  const cells = container.querySelectorAll(".grid-cell");
  const startCell = cells[getCellIndex(dayIndex, startHour)];
  const endCell = cells[getCellIndex(dayIndex, endHour)];

  fireEvent.mouseDown(startCell);
  if (endCell !== startCell) {
    fireEvent.mouseEnter(endCell);
  }
  fireEvent.mouseUp(window);
};

describe("Manager plans and publishes worker shifts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockReturnValue(AUTH);
    setupFirestore();
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  it("Test 1: manager can create and publish a weekly shift", async () => {
    const { container } = render(<ShiftPlannerPage />);

    await screen.findByText("Bob Worker");

    const saveBtnBefore = screen.getByRole("button", { name: /save shifts/i });
    expect(saveBtnBefore).toBeDisabled();

    // Create a 1-hour shift block (09:00-10:00) on first day.
    dragShift({ container, dayIndex: 0, startHour: 9, endHour: 9 });

    await screen.findByText(
      "You have unsaved shift changes. Workers still see the last saved plan.",
    );

    const saveBtn = screen.getByRole("button", { name: /save shifts/i });
    expect(saveBtn).toBeEnabled();

    fireEvent.click(saveBtn);

    await screen.findByText("Shift plan saved. Workers now see this final version.");

    expect(mockAddDoc).toHaveBeenCalledTimes(1);
    expect(mockAddDoc).toHaveBeenCalledWith(
      expect.objectContaining({ name: "workerShifts" }),
      expect.objectContaining({
        organizationId: "org-1",
        workerId: "wkr-1",
        workerName: "Bob Worker",
        workerRole: "plumber",
        createdBy: "mgr-1",
        createdAt: "__ts__",
      }),
    );

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ name: "users", id: "wkr-1" }),
      expect.objectContaining({
        shiftStartAt: expect.any(Date),
        shiftEndAt: expect.any(Date),
      }),
    );
  });

  it("Test 2: manager cannot create overlapping shifts on same day", async () => {
    const { container } = render(<ShiftPlannerPage />);

    await screen.findByText("Bob Worker");

    // First shift: 09:00-11:00
    dragShift({ container, dayIndex: 0, startHour: 9, endHour: 10 });

    // Overlapping shift: 10:00-12:00 (overlaps previous)
    dragShift({ container, dayIndex: 0, startHour: 10, endHour: 11 });

    expect(window.alert).toHaveBeenCalledWith(
      "This shift overlaps with an existing shift on the same day.",
    );

    await waitFor(() => {
      expect(container.querySelectorAll(".shift-block")).toHaveLength(1);
    });
  });

  it("Test 3: manager cannot schedule more than 8 hours in one day", async () => {
    const { container } = render(<ShiftPlannerPage />);

    await screen.findByText("Bob Worker");

    // 8-hour shift: 09:00-17:00
    dragShift({ container, dayIndex: 0, startHour: 9, endHour: 16 });

    // Add 1 more hour: 17:00-18:00 (should exceed 8h/day)
    dragShift({ container, dayIndex: 0, startHour: 17, endHour: 17 });

    expect(window.alert).toHaveBeenCalledWith(
      expect.stringContaining("Adding this shift would exceed 8 hours for this day."),
    );

    await waitFor(() => {
      expect(container.querySelectorAll(".shift-block")).toHaveLength(1);
    });
  });
});
