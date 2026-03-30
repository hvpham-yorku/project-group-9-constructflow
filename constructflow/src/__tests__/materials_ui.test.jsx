import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as firestoreModule from "firebase/firestore";

import TasksPage from "../pages/TasksPage";
import WorkerDashboard from "../pages/WorkerDashboard";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: "/projects/proj-1/tasks" }),
  useParams: () => ({ projectId: "proj-1" }),
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("react-icons/md", () => ({
  MdArrowBack: () => <span />,
  MdArrowForward: () => <span />,
  MdAssignment: () => <span />,
  MdCheckCircle: () => <span />,
  MdDashboard: () => <span />,
  MdFolder: () => <span />,
  MdLogin: () => <span />,
  MdLogout: () => <span />,
  MdPeople: () => <span />,
  MdPerson: () => <span />,
  MdSchedule: () => <span />,
  MdSettings: () => <span />,
}));

const mockUseAuth = vi.fn();

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("../firebase", () => ({ db: {} }));

vi.mock("../components/Sidebar", () => ({
  default: () => <nav data-testid="sidebar" />,
}));

vi.mock("../components/Header", () => ({
  default: ({ title }) => <header data-testid="header">{title}</header>,
}));

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: vi.fn((database, name) => ({ kind: "collection", database, name })),
  doc: vi.fn((database, name, id) => ({ kind: "doc", database, name, id })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn((ref, ...clauses) => ({ kind: "query", ref, clauses })),
  serverTimestamp: vi.fn(() => new Date()),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  where: vi.fn((field, op, value) => ({ kind: "where", field, op, value })),
}));

const mockAssignMaterialsToTaskWithDeduction = vi.fn();
const mockCreateMaterial = vi.fn();
const mockListProjectMaterials = vi.fn();
const mockListTaskMaterialAllocations = vi.fn();
const mockRemoveMaterial = vi.fn();
const mockUpdateMaterial = vi.fn();

vi.mock("../utils/materialsRepository", () => ({
  assignMaterialsToTaskWithDeduction: (...args) =>
    mockAssignMaterialsToTaskWithDeduction(...args),
  createMaterial: (...args) => mockCreateMaterial(...args),
  listProjectMaterials: (...args) => mockListProjectMaterials(...args),
  listTaskMaterialAllocations: (...args) => mockListTaskMaterialAllocations(...args),
  removeMaterial: (...args) => mockRemoveMaterial(...args),
  updateMaterial: (...args) => mockUpdateMaterial(...args),
}));

const MANAGER = {
  currentUser: { uid: "mgr-1", email: "manager@test.com" },
  userProfile: {
    uid: "mgr-1",
    name: "Alice Manager",
    role: "manager",
    organizationId: "org-1",
  },
  isManager: true,
  isWorker: false,
  organizationId: "org-1",
};

const WORKER = {
  currentUser: { uid: "wkr-1", email: "worker@test.com" },
  userProfile: {
    uid: "wkr-1",
    name: "Bob Worker",
    role: "plumber",
    organizationId: "org-1",
  },
  isManager: false,
  isWorker: true,
  organizationId: "org-1",
};

const DEFAULT_PROJECT = {
  name: "North Tower",
  status: "active",
  organizationId: "org-1",
};

const DEFAULT_WORKER = {
  uid: "wkr-1",
  name: "Bob Worker",
  role: "plumber",
  organizationId: "org-1",
};

const makeSnap = (docs) => ({
  docs,
  size: docs.length,
  empty: docs.length === 0,
  forEach: (callback) => docs.forEach(callback),
});

const makeDocSnap = (id, data, exists = true) => ({
  id,
  exists: () => exists,
  data: () => data,
});

const getCollectionName = (queryRef) => queryRef?.ref?.name || queryRef?.name || "";

const primeTasksPageData = ({ tasks = [], blueprints = [], workers = [DEFAULT_WORKER] } = {}) => {
  firestoreModule.getDoc.mockImplementation((docRef) => {
    if (docRef.name === "projects") {
      return Promise.resolve(makeDocSnap(docRef.id, DEFAULT_PROJECT));
    }

    return Promise.resolve(makeDocSnap(docRef.id, {}));
  });

  firestoreModule.getDocs.mockImplementation((queryRef) => {
    const collectionName = getCollectionName(queryRef);

    if (collectionName === "users") {
      return Promise.resolve(
        makeSnap(workers.map((worker) => makeDocSnap(worker.uid, worker))),
      );
    }

    if (collectionName === "tasks") {
      return Promise.resolve(makeSnap(tasks.map((task) => makeDocSnap(task.id, task))));
    }

    if (collectionName === "blueprints") {
      return Promise.resolve(
        makeSnap(blueprints.map((blueprint) => makeDocSnap(blueprint.id, blueprint))),
      );
    }

    return Promise.resolve(makeSnap([]));
  });
};

const primeWorkerDashboardData = ({ tasks = [], projects = [DEFAULT_PROJECT], userRecord = {} } = {}) => {
  firestoreModule.getDoc.mockImplementation((docRef) => {
    if (docRef.name === "users") {
      return Promise.resolve(
        makeDocSnap(docRef.id, {
          ...WORKER.userProfile,
          ...userRecord,
        }),
      );
    }

    return Promise.resolve(makeDocSnap(docRef.id, {}));
  });

  firestoreModule.getDocs.mockImplementation((queryRef) => {
    const collectionName = getCollectionName(queryRef);

    if (collectionName === "projects") {
      return Promise.resolve(
        makeSnap(projects.map((project, index) => makeDocSnap(project.id || `proj-${index + 1}`, project))),
      );
    }

    if (collectionName === "tasks") {
      return Promise.resolve(makeSnap(tasks.map((task) => makeDocSnap(task.id, task))));
    }

    return Promise.resolve(makeSnap([]));
  });
};

describe("materials UI flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    mockUseAuth.mockReturnValue(MANAGER);
    mockAssignMaterialsToTaskWithDeduction.mockResolvedValue({
      deductionLog: [],
      allocationIds: [],
    });
    mockCreateMaterial.mockResolvedValue({ id: "mat-new" });
    mockListProjectMaterials.mockResolvedValue([]);
    mockListTaskMaterialAllocations.mockResolvedValue([]);
    mockRemoveMaterial.mockResolvedValue();
    mockUpdateMaterial.mockResolvedValue({});
  });

  it("lets a manager edit inventory items from the project tasks page", async () => {
    const user = userEvent.setup();

    primeTasksPageData();
    mockListProjectMaterials
      .mockResolvedValueOnce([
        {
          id: "mat-1",
          name: "Copper Pipe",
          unit: "m",
          quantityOnHand: 10,
          status: "active",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "mat-1",
          name: "Copper Pipe XL",
          unit: "box",
          quantityOnHand: 12,
          status: "active",
        },
      ]);

    render(<TasksPage />);

    const materialCell = await screen.findByText("Copper Pipe");
    const materialRow = materialCell.closest("tr");
    expect(materialRow).not.toBeNull();

    await user.click(within(materialRow).getByRole("button", { name: "Edit" }));

    await user.clear(within(materialRow).getByDisplayValue("Copper Pipe"));
    await user.type(within(materialRow).getByDisplayValue(""), "Copper Pipe XL");
    await user.clear(within(materialRow).getByDisplayValue("10"));
    await user.type(within(materialRow).getByRole("spinbutton"), "12");
    await user.selectOptions(within(materialRow).getByRole("combobox"), "box");
    await user.click(within(materialRow).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockUpdateMaterial).toHaveBeenCalledWith({
        materialId: "mat-1",
        updates: {
          name: "Copper Pipe XL",
          unit: "box",
          quantityOnHand: 12,
        },
      });
    });

    expect(await screen.findByText("Material updated.")).toBeInTheDocument();
    expect(await screen.findByText("Copper Pipe XL")).toBeInTheDocument();
    expect(screen.getByText("12 box")).toBeInTheDocument();
  });

  it("lets a manager remove an inventory item after confirmation", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    primeTasksPageData();
    mockListProjectMaterials
      .mockResolvedValueOnce([
        {
          id: "mat-1",
          name: "Copper Pipe",
          unit: "m",
          quantityOnHand: 10,
          status: "active",
        },
      ])
      .mockResolvedValueOnce([]);

    render(<TasksPage />);

    const materialCell = await screen.findByText("Copper Pipe");
    const materialRow = materialCell.closest("tr");
    expect(materialRow).not.toBeNull();

    await user.click(within(materialRow).getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(mockRemoveMaterial).toHaveBeenCalledWith({ materialId: "mat-1" });
    });

    expect(await screen.findByText("Material removed.")).toBeInTheDocument();
    expect(await screen.findByText("No materials in this project yet.")).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("blocks attaching the same material to a task twice", async () => {
    const user = userEvent.setup();

    primeTasksPageData({
      tasks: [
        {
          id: "task-1",
          title: "Kitchen Rough-In",
          description: "Install the kitchen branch lines",
          dueDate: "2026-04-20",
          assignedWorkerId: "wkr-1",
          assignedWorkerName: "Bob Worker",
          projectId: "proj-1",
          organizationId: "org-1",
        },
      ],
    });

    mockListProjectMaterials.mockResolvedValue([
      {
        id: "mat-1",
        name: "Copper Pipe",
        unit: "m",
        quantityOnHand: 10,
        status: "active",
      },
    ]);

    mockListTaskMaterialAllocations.mockResolvedValue([
      {
        id: "task-1_mat-1",
        taskId: "task-1",
        materialId: "mat-1",
        quantityRequired: 2,
      },
    ]);

    render(<TasksPage />);

    const taskTitle = await screen.findByText("Kitchen Rough-In");
    const taskCard = taskTitle.closest(".task-card");
    expect(taskCard).not.toBeNull();

    await user.selectOptions(
      within(taskCard).getByLabelText("Select material for Kitchen Rough-In"),
      "mat-1",
    );
    await user.type(
      within(taskCard).getByLabelText("Material quantity for Kitchen Rough-In"),
      "1",
    );
    await user.click(within(taskCard).getByRole("button", { name: "Attach" }));

    expect(
      await within(taskCard).findByText("This material is already attached to the task."),
    ).toBeInTheDocument();
    expect(mockAssignMaterialsToTaskWithDeduction).not.toHaveBeenCalled();
  });

  it("shows only the first three task materials on the worker dashboard and collapses the rest", async () => {
    mockUseAuth.mockReturnValue(WORKER);

    primeWorkerDashboardData({
      tasks: [
        {
          id: "task-1",
          title: "Level 2 Rough-In",
          dueDate: "2026-05-01",
          projectId: "proj-1",
          completed: false,
          assignedWorkerId: "wkr-1",
          organizationId: "org-1",
        },
      ],
      projects: [
        {
          id: "proj-1",
          name: "North Tower",
          status: "active",
          organizationId: "org-1",
        },
      ],
    });

    mockListProjectMaterials.mockResolvedValue([
      { id: "mat-1", name: "Copper Pipe", unit: "m", quantityOnHand: 20, status: "active" },
      { id: "mat-2", name: "PVC Pipe", unit: "pcs", quantityOnHand: 12, status: "active" },
      { id: "mat-3", name: "Sealant", unit: "box", quantityOnHand: 6, status: "active" },
      { id: "mat-4", name: "Clamps", unit: "set", quantityOnHand: 8, status: "active" },
    ]);

    mockListTaskMaterialAllocations.mockResolvedValue([
      { materialId: "mat-1", quantityRequired: 4 },
      { materialId: "mat-2", quantityRequired: 2 },
      { materialId: "mat-3", quantityRequired: 1 },
      { materialId: "mat-4", quantityRequired: 3 },
    ]);

    render(<WorkerDashboard />);

    expect(await screen.findByText("Level 2 Rough-In")).toBeInTheDocument();
    expect(screen.getByText("Copper Pipe: 4 m")).toBeInTheDocument();
    expect(screen.getByText("PVC Pipe: 2 pcs")).toBeInTheDocument();
    expect(screen.getByText("Sealant: 1 box")).toBeInTheDocument();
    expect(screen.getByText("+1 more")).toBeInTheDocument();
    expect(screen.queryByText("Clamps: 3 set")).not.toBeInTheDocument();
  });
});
