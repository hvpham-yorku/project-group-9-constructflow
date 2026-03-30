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

const mockListProjectMaterials = vi.fn(async () => []);
const mockListTaskMaterialAllocations = vi.fn(async () => []);

vi.mock("../utils/materialsRepository", () => ({
  listProjectMaterials: (...args) => mockListProjectMaterials(...args),
  listTaskMaterialAllocations: (...args) =>
    mockListTaskMaterialAllocations(...args),
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
    name: "Bob Worker",
    role: "plumber",
    organizationId: "org-1",
  },
  organizationId: "org-1",
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

const setupPage = ({ workerRecord, projects, tasks }) => {
  mockGetDoc.mockResolvedValue(makeDocSnap("wkr-1", workerRecord));

  mockGetDocs.mockImplementation(async (queryRef) => {
    const collectionName = queryRef?.ref?.name || queryRef?.name || "";

    if (collectionName === "projects") {
      return makeSnap(projects);
    }

    if (collectionName === "tasks") {
      return makeSnap(tasks);
    }

    return makeSnap([]);
  });

  render(<WorkerDashboard />);
};

const getStatValue = (label) => {
  const labelNode = screen
    .getAllByText(label)
    .find((node) => node.classList.contains("stat-label"));
  const wrapper = labelNode.parentElement;
  return wrapper?.querySelector(".stat-number")?.textContent || "";
};

describe("Worker sees assigned tasks on dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockReturnValue(AUTH);
  });

  it("Test 1: worker sees assigned tasks with due date, status, and correct counts", async () => {
    setupPage({
      workerRecord: {
        organizationId: "org-1",
        role: "plumber",
        isClockedIn: false,
      },
      projects: [
        { id: "p1", organizationId: "org-1", name: "Tower A", status: "active" },
      ],
      tasks: [
        {
          id: "t2",
          organizationId: "org-1",
          projectId: "p1",
          assignedWorkerId: "wkr-1",
          title: "Install Sink",
          dueDate: "2026-04-10",
          completed: true,
        },
        {
          id: "t1",
          organizationId: "org-1",
          projectId: "p1",
          assignedWorkerId: "wkr-1",
          title: "Lay Pipe",
          dueDate: "2026-04-01",
          completed: false,
        },
      ],
    });

    await screen.findByText("My Assignments");

    expect(screen.getByText("Lay Pipe")).toBeInTheDocument();
    expect(screen.getByText("Install Sink")).toBeInTheDocument();
    expect(screen.getByText("Due: 2026-04-01")).toBeInTheDocument();
    expect(screen.getByText("Due: 2026-04-10")).toBeInTheDocument();
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Done").length).toBeGreaterThan(0);

    expect(getStatValue("Assigned")).toBe("2");
    expect(getStatValue("Completed")).toBe("1");
    expect(getStatValue("Pending")).toBe("1");

    fireEvent.click(screen.getByText("Lay Pipe"));
    expect(mockNavigate).toHaveBeenCalledWith(
      "/projects/p1/tasks/t1/blueprints",
    );
  });

  it("Test 2: worker does not see tasks from completed projects", async () => {
    setupPage({
      workerRecord: {
        organizationId: "org-1",
        role: "plumber",
        isClockedIn: false,
      },
      projects: [
        { id: "p1", organizationId: "org-1", name: "Active Project", status: "active" },
        {
          id: "p2",
          organizationId: "org-1",
          name: "Finished Project",
          status: "completed",
        },
      ],
      tasks: [
        {
          id: "active-task",
          organizationId: "org-1",
          projectId: "p1",
          assignedWorkerId: "wkr-1",
          title: "Active Task",
          dueDate: "2026-04-02",
          completed: false,
        },
        {
          id: "completed-project-task",
          organizationId: "org-1",
          projectId: "p2",
          assignedWorkerId: "wkr-1",
          title: "Should Not Show",
          dueDate: "2026-04-03",
          completed: false,
        },
      ],
    });

    await screen.findByText("Active Task");
    expect(screen.queryByText("Should Not Show")).not.toBeInTheDocument();
    expect(getStatValue("Assigned")).toBe("1");
  });

  it("Test 3: worker sees empty message when no assigned tasks are available", async () => {
    setupPage({
      workerRecord: {
        organizationId: "org-1",
        role: "plumber",
        isClockedIn: false,
      },
      projects: [
        { id: "p1", organizationId: "org-1", name: "Tower A", status: "active" },
      ],
      tasks: [],
    });

    await screen.findByText("No tasks yet. Ask your manager to assign work to you.");

    expect(getStatValue("Assigned")).toBe("0");
    expect(getStatValue("Completed")).toBe("0");
    expect(getStatValue("Pending")).toBe("0");
  });
});
