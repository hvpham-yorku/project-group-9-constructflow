import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";

import ProjectsPage from "../pages/ProjectsPage";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

const mockAuth = vi.fn();
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => mockAuth(),
}));

vi.mock("../firebase", () => ({ db: {} }));

vi.mock("../components/Sidebar", () => ({
  default: () => <nav data-testid="sidebar" />,
}));

vi.mock("../components/Header", () => ({
  default: ({ title }) => <header>{title}</header>,
}));

vi.mock("react-icons/md", () => ({
  MdFolder: () => <span />,
  MdConstruction: () => <span />,
  MdClose: () => <span />,
  MdArrowForward: () => <span />,
}));

const mockCollection = vi.fn((database, name) => ({ name, database }));
const mockQuery = vi.fn((ref, ...clauses) => ({ ref, clauses }));
const mockWhere = vi.fn((field, op, value) => ({ field, op, value }));
const mockGetDocs = vi.fn();
const mockUpdateDoc = vi.fn(() => Promise.resolve());
const mockDoc = vi.fn((database, name, id) => ({ database, name, id }));

vi.mock("firebase/firestore", () => ({
  collection: (...args) => mockCollection(...args),
  addDoc: vi.fn(),
  getDocs: (...args) => mockGetDocs(...args),
  deleteDoc: vi.fn(),
  doc: (...args) => mockDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  serverTimestamp: vi.fn(),
}));

const MANAGER_AUTH = {
  organizationId: "org-1",
  isManager: true,
  userProfile: { uid: "mgr-1" },
};

const WORKER_AUTH = {
  organizationId: "org-1",
  isManager: false,
  userProfile: { uid: "worker-1" },
};

const ts = (millis) => ({
  toMillis: () => millis,
  toDate: () => new Date(millis),
});

const makeSnap = (rows) => ({
  docs: rows.map((row) => ({
    id: row.id,
    data: () => row,
  })),
});

const setupFirestoreData = ({
  projects = [],
  tasks = [],
  blueprints = [],
  workerAssignedTasks = [],
}) => {
  mockGetDocs.mockImplementation(async (queryRef) => {
    const collectionName = queryRef?.ref?.name || queryRef?.name;
    const assignedWorkerFilter = queryRef?.clauses?.find(
      (clause) => clause.field === "assignedWorkerId",
    );

    if (assignedWorkerFilter) {
      return makeSnap(workerAssignedTasks);
    }

    if (collectionName === "projects") return makeSnap(projects);
    if (collectionName === "tasks") return makeSnap(tasks);
    if (collectionName === "blueprints") return makeSnap(blueprints);

    return makeSnap([]);
  });
};

const renderProjectsPage = () => {
  render(<ProjectsPage />);
};

describe("Project Progress Tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockReturnValue(MANAGER_AUTH);
  });

  it("shows 0% progress when a project has no tasks", async () => {
    setupFirestoreData({
      projects: [
        {
          id: "p1",
          name: "No Tasks Project",
          organizationId: "org-1",
          status: "active",
          createdAt: ts(1000),
        },
      ],
      tasks: [],
      blueprints: [],
    });

    renderProjectsPage();

    await screen.findByText("No Tasks Project");
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByLabelText("Project progress 0%")).toBeInTheDocument();
  });

  it("calculates progress from required point tasks and completed objects", async () => {
    setupFirestoreData({
      projects: [
        {
          id: "p1",
          name: "Build A",
          organizationId: "org-1",
          status: "active",
          createdAt: ts(1000),
        },
      ],
      tasks: [
        {
          id: "t1",
          projectId: "p1",
          organizationId: "org-1",
        },
      ],
      blueprints: [
        {
          id: "b1",
          organizationId: "org-1",
          taskId: "t1",
          objects: {
            a: {
              pointTasks: [
                { requiredType: "electric", completed: true },
                { requiredType: "plumbing", completed: false },
              ],
            },
            b: {
              pointTasks: [{ requiredType: "wiring", completed: true }],
            },
            c: { completed: true },
          },
        },
      ],
    });

    renderProjectsPage();

    await screen.findByText("Build A");
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByLabelText("Project progress 75%")).toBeInTheDocument();
  });

  it("averages completion across blueprints belonging to the same task", async () => {
    setupFirestoreData({
      projects: [
        {
          id: "p1",
          name: "Multi Blueprint Task",
          organizationId: "org-1",
          status: "active",
          createdAt: ts(1000),
        },
      ],
      tasks: [{ id: "t1", projectId: "p1", organizationId: "org-1" }],
      blueprints: [
        {
          id: "b1",
          organizationId: "org-1",
          taskId: "t1",
          objects: { a: { completed: true } },
        },
        {
          id: "b2",
          organizationId: "org-1",
          taskId: "t1",
          objects: { a: { completed: false } },
        },
      ],
    });

    renderProjectsPage();

    await screen.findByText("Multi Blueprint Task");
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("averages completion across all tasks in a project", async () => {
    setupFirestoreData({
      projects: [
        {
          id: "p1",
          name: "Two Tasks",
          organizationId: "org-1",
          status: "active",
          createdAt: ts(1000),
        },
      ],
      tasks: [
        { id: "t1", projectId: "p1", organizationId: "org-1" },
        { id: "t2", projectId: "p1", organizationId: "org-1" },
      ],
      blueprints: [
        {
          id: "b1",
          organizationId: "org-1",
          taskId: "t1",
          objects: { a: { completed: true } },
        },
        {
          id: "b2",
          organizationId: "org-1",
          taskId: "t2",
          objects: {
            a: {
              pointTasks: [
                { requiredType: "x", completed: true },
                { requiredType: "y", completed: false },
              ],
            },
          },
        },
      ],
    });

    renderProjectsPage();

    await screen.findByText("Two Tasks");
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("treats task completion as 0 when a task has no blueprints", async () => {
    setupFirestoreData({
      projects: [
        {
          id: "p1",
          name: "Missing Blueprints",
          organizationId: "org-1",
          status: "active",
          createdAt: ts(1000),
        },
      ],
      tasks: [{ id: "t1", projectId: "p1", organizationId: "org-1" }],
      blueprints: [],
    });

    renderProjectsPage();

    await screen.findByText("Missing Blueprints");
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("ignores optional point tasks and falls back to object completion", async () => {
    setupFirestoreData({
      projects: [
        {
          id: "p1",
          name: "Optional Points",
          organizationId: "org-1",
          status: "active",
          createdAt: ts(1000),
        },
      ],
      tasks: [{ id: "t1", projectId: "p1", organizationId: "org-1" }],
      blueprints: [
        {
          id: "b1",
          organizationId: "org-1",
          taskId: "t1",
          objects: {
            a: {
              completed: true,
              pointTasks: [
                { requiredType: "", completed: false },
                { completed: true },
              ],
            },
          },
        },
      ],
    });

    renderProjectsPage();

    await screen.findByText("Optional Points");
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("shows a completed badge when calculated completion reaches 100%", async () => {
    setupFirestoreData({
      projects: [
        {
          id: "p1",
          name: "Finished Project",
          organizationId: "org-1",
          status: "active",
          createdAt: ts(1000),
        },
      ],
      tasks: [{ id: "t1", projectId: "p1", organizationId: "org-1" }],
      blueprints: [
        {
          id: "b1",
          organizationId: "org-1",
          taskId: "t1",
          objects: { a: { completed: true } },
        },
      ],
    });

    renderProjectsPage();

    await screen.findByText("Finished Project");
    expect(screen.getAllByText("Completed")[1]).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("updates Firestore status to completed when manager view computes completion as 100%", async () => {
    setupFirestoreData({
      projects: [
        {
          id: "p1",
          name: "Sync Status",
          organizationId: "org-1",
          status: "active",
          createdAt: ts(1000),
        },
      ],
      tasks: [{ id: "t1", projectId: "p1", organizationId: "org-1" }],
      blueprints: [
        {
          id: "b1",
          organizationId: "org-1",
          taskId: "t1",
          objects: { a: { completed: true } },
        },
      ],
    });

    renderProjectsPage();

    await screen.findByText("Sync Status");

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    });

    expect(mockDoc).toHaveBeenCalledWith(expect.anything(), "projects", "p1");
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ name: "projects", id: "p1" }),
      { status: "completed" },
    );
  });

  it("does not update Firestore when stored status already matches computed status", async () => {
    setupFirestoreData({
      projects: [
        {
          id: "p1",
          name: "Already Complete",
          organizationId: "org-1",
          status: "completed",
          createdAt: ts(1000),
        },
      ],
      tasks: [{ id: "t1", projectId: "p1", organizationId: "org-1" }],
      blueprints: [
        {
          id: "b1",
          organizationId: "org-1",
          taskId: "t1",
          objects: { a: { completed: true } },
        },
      ],
    });

    renderProjectsPage();

    await screen.findByText("Already Complete");
    await waitFor(() => {
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });
  });

  it("filters projects correctly between all, active, and completed", async () => {
    const user = userEvent.setup();

    setupFirestoreData({
      projects: [
        {
          id: "p1",
          name: "Active One",
          organizationId: "org-1",
          status: "active",
          createdAt: ts(2000),
        },
        {
          id: "p2",
          name: "Completed One",
          organizationId: "org-1",
          status: "completed",
          createdAt: ts(1000),
        },
      ],
      tasks: [
        { id: "t1", projectId: "p1", organizationId: "org-1" },
        { id: "t2", projectId: "p2", organizationId: "org-1" },
      ],
      blueprints: [
        {
          id: "b1",
          organizationId: "org-1",
          taskId: "t1",
          objects: { a: { completed: false } },
        },
        {
          id: "b2",
          organizationId: "org-1",
          taskId: "t2",
          objects: { a: { completed: true } },
        },
      ],
    });

    renderProjectsPage();

    await screen.findByText("Active One");
    expect(screen.getByText("Completed One")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Active" }));
    expect(screen.getByText("Active One")).toBeInTheDocument();
    expect(screen.queryByText("Completed One")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Completed" }));
    expect(screen.getByText("Completed One")).toBeInTheDocument();
    expect(screen.queryByText("Active One")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("Active One")).toBeInTheDocument();
    expect(screen.getByText("Completed One")).toBeInTheDocument();
  });

  it("shows only projects assigned to the worker through task assignments", async () => {
    mockAuth.mockReturnValue(WORKER_AUTH);

    setupFirestoreData({
      projects: [
        {
          id: "p1",
          name: "Assigned Project",
          organizationId: "org-1",
          status: "active",
          createdAt: ts(2000),
        },
        {
          id: "p2",
          name: "Unassigned Project",
          organizationId: "org-1",
          status: "active",
          createdAt: ts(1000),
        },
      ],
      tasks: [
        { id: "t1", projectId: "p1", organizationId: "org-1" },
        { id: "t2", projectId: "p2", organizationId: "org-1" },
      ],
      blueprints: [
        {
          id: "b1",
          organizationId: "org-1",
          taskId: "t1",
          objects: { a: { completed: false } },
        },
      ],
      workerAssignedTasks: [
        {
          id: "wt1",
          projectId: "p1",
          organizationId: "org-1",
          assignedWorkerId: "worker-1",
        },
      ],
    });

    renderProjectsPage();

    await screen.findByText("Assigned Project");
    expect(screen.queryByText("Unassigned Project")).not.toBeInTheDocument();
  });
});
