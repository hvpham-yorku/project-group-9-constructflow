/**
 * workflow.test.jsx
 *
 * End-to-end workflow tests for ConstructFlow covering:
 *
 *  1.  Manager signs up with name, email, and password
 *  2.  Sign-up rejects mismatched passwords
 *  3.  Manager creates an organisation (invite code generated)
 *  4.  Worker submitting an invalid invite code sees an error
 *  5.  Worker submitting a valid invite code advances to the role picker
 *  6.  Worker selects "Plumber" and joins the organisation
 *  7.  Manager creates a new project
 *  8.  Manager creates a task with a description assigned to a worker
 *  9.  Task form validates that all required fields are present
 * 10.  Worker sees their assigned tasks on the dashboard
 * 11.  Task progress averages completion across all task blueprints
 */

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import * as firestoreModule from "firebase/firestore";

import AuthModal from "../components/AuthModal";
import OrganizationPage from "../pages/OrganizationPage";
import ProjectsPage from "../pages/ProjectsPage";
import TasksPage from "../pages/TasksPage";
import WorkerDashboard from "../pages/WorkerDashboard";

// ── react-router-dom ────────────────────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: "/dashboard" }),
  useParams: () => ({ projectId: "proj-1" }),
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

// ── react-icons/md ─────────────────────────────────────────────────────────
vi.mock("react-icons/md", () => ({
  MdConstruction: () => <span />,
  MdClose: () => <span />,
  MdLogin: () => <span />,
  MdElectricBolt: () => <span />,
  MdPlumbing: () => <span />,
  MdEngineering: () => <span />,
  MdArrowBack: () => <span />,
  MdArrowForward: () => <span />,
  MdFolder: () => <span />,
  MdCheckCircle: () => <span />,
  MdDashboard: () => <span />,
  MdPeople: () => <span />,
  MdSettings: () => <span />,
  MdLogout: () => <span />,
  MdBusiness: () => <span />,
  MdPerson: () => <span />,
  MdAssignment: () => <span />,
  MdSchedule: () => <span />,
  MdEdit: () => <span />,
  MdCheck: () => <span />,
  MdPersonRemove: () => <span />,
  MdImage: () => <span />,
  MdSave: () => <span />,
  MdExpandMore: () => <span />,
  MdUpload: () => <span />,
}));

// ── AuthContext ─────────────────────────────────────────────────────────────
const mockSignup = vi.fn();
const mockLogin = vi.fn();
const mockUpdateUserProfile = vi.fn();
const mockLogout = vi.fn();

vi.mock("../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }) => <>{children}</>,
}));

import { useAuth } from "../contexts/AuthContext";

// ── Firebase ────────────────────────────────────────────────────────────────
vi.mock("../firebase", () => ({ auth: {}, db: {} }));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((database, name) => ({
    kind: "collection",
    database,
    name,
  })),
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(() => "doc-ref"),
  updateDoc: vi.fn(() => Promise.resolve()),
  query: vi.fn((ref, ...clauses) => ({ kind: "query", ref, clauses })),
  where: vi.fn((field, op, value) => ({ kind: "where", field, op, value })),
  serverTimestamp: vi.fn(() => new Date()),
  Timestamp: {
    fromDate: vi.fn((date) => date),
  },
  deleteField: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn((auth, cb) => {
    cb(null);
    return vi.fn();
  }),
}));

// ── Stub heavy sub-components ───────────────────────────────────────────────
vi.mock("../components/Sidebar", () => ({
  default: () => <nav data-testid="sidebar" />,
}));
vi.mock("../components/Header", () => ({
  default: ({ title }) => <header data-testid="header">{title}</header>,
}));

// ── Firestore helpers ───────────────────────────────────────────────────────
/** Build a getDocs snapshot from an array of { id, data } pairs. */
const makeSnap = (docs) => ({
  docs,
  size: docs.length,
  empty: docs.length === 0,
  // WorkerDashboard iterates the project snapshot with forEach
  forEach: (cb) => docs.forEach(cb),
});

/** Build a single Firestore document snapshot. */
const makeDocSnap = (id, data) => ({
  id,
  exists: () => true,
  data: () => data,
});

// ── Auth context profiles ───────────────────────────────────────────────────
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
  hasOrg: true,
  organizationId: "org-1",
  signup: mockSignup,
  login: mockLogin,
  logout: mockLogout,
  updateUserProfile: mockUpdateUserProfile,
  loading: false,
};

const WORKER = {
  currentUser: { uid: "wkr-1", email: "worker@test.com" },
  userProfile: {
    uid: "wkr-1",
    name: "Bob Plumber",
    role: "plumber",
    organizationId: "org-1",
  },
  isManager: false,
  isWorker: true,
  hasOrg: true,
  organizationId: "org-1",
  signup: mockSignup,
  login: mockLogin,
  logout: mockLogout,
  updateUserProfile: mockUpdateUserProfile,
  loading: false,
};

const NEW_USER = {
  currentUser: { uid: "new-1", email: "new@test.com" },
  userProfile: {
    uid: "new-1",
    name: "Carol New",
    role: "general",
    organizationId: null,
  },
  isManager: false,
  isWorker: false,
  hasOrg: false,
  organizationId: null,
  signup: mockSignup,
  login: mockLogin,
  logout: mockLogout,
  updateUserProfile: mockUpdateUserProfile,
  loading: false,
};

// ── Tests ───────────────────────────────────────────────────────────────────
describe("ConstructFlow End-to-End Workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const getCollectionName = (queryRef) =>
    queryRef?.ref?.name || queryRef?.name || null;

  // ── Test 1 ── Manager signs up ─────────────────────────────────────────
  it("1. Manager can sign up with their full name, email, and password", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ signup: mockSignup, login: mockLogin });
    mockSignup.mockResolvedValue({ user: { uid: "mgr-1" } });

    render(<AuthModal isOpen={true} onClose={vi.fn()} />);

    // The modal opens in sign-in mode; switch to sign-up
    await user.click(screen.getByRole("button", { name: /^sign up$/i }));

    await user.type(screen.getByLabelText(/full name/i), "Alice Manager");
    await user.type(screen.getByLabelText(/email/i), "manager@test.com");
    await user.type(screen.getByLabelText(/^password$/i), "securePass1");
    await user.type(screen.getByLabelText(/confirm password/i), "securePass1");

    await user.click(screen.getByRole("button", { name: /^create account$/i }));

    await waitFor(() => {
      expect(mockSignup).toHaveBeenCalledWith(
        "manager@test.com",
        "securePass1",
        "Alice Manager",
      );
    });
  });

  // ── Test 2 ── Password mismatch validation ─────────────────────────────
  it("2. Sign-up shows an error and does not submit when passwords do not match", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ signup: mockSignup, login: mockLogin });

    render(<AuthModal isOpen={true} onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));

    await user.type(screen.getByLabelText(/full name/i), "Alice Manager");
    await user.type(screen.getByLabelText(/email/i), "manager@test.com");
    await user.type(screen.getByLabelText(/^password$/i), "pass123");
    await user.type(screen.getByLabelText(/confirm password/i), "different99");

    await user.click(screen.getByRole("button", { name: /^create account$/i }));

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  // ── Test 3 ── Manager creates an organisation ──────────────────────────
  it("3. Manager can create a new organisation, generating an invite code", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(NEW_USER);
    firestoreModule.addDoc.mockResolvedValueOnce({ id: "org-1" });
    mockUpdateUserProfile.mockResolvedValue(undefined);

    render(<OrganizationPage />);

    // Default tab is "Create Organization"
    const textbox = screen.getByRole("textbox");
    await user.type(textbox, "BuildCo Construction");

    // Both the active tab and the submit button share the label text;
    // click the last matched element which is the submit button.
    const createOrgBtns = screen.getAllByRole("button", {
      name: /create organization/i,
    });
    await user.click(createOrgBtns[createOrgBtns.length - 1]);

    await waitFor(() => {
      expect(firestoreModule.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: "BuildCo Construction",
          managerId: "new-1",
        }),
      );
    });
  });

  // ── Test 4 ── Invalid invite code shows error ──────────────────────────
  it("4. Worker sees an error when they enter an invalid invite code", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(NEW_USER);
    // getDocs returns empty snapshot (code not found)
    firestoreModule.getDocs.mockResolvedValueOnce(makeSnap([]));

    render(<OrganizationPage />);

    // Switch to "Join Organization" tab
    await user.click(
      screen.getByRole("button", { name: /join organization/i }),
    );

    const textbox = screen.getByRole("textbox");
    await user.type(textbox, "BADCODE");

    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid invite code/i)).toBeInTheDocument();
    });
  });

  // ── Test 5 ── Valid invite code advances to role picker ────────────────
  it("5. Worker entering a valid invite code sees the trade role picker", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(NEW_USER);
    firestoreModule.getDocs.mockResolvedValueOnce(
      makeSnap([
        makeDocSnap("org-1", {
          name: "BuildCo Construction",
          inviteCode: "VALID1",
        }),
      ]),
    );

    render(<OrganizationPage />);

    await user.click(
      screen.getByRole("button", { name: /join organization/i }),
    );

    await user.type(screen.getByRole("textbox"), "VALID1");
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText(/BuildCo Construction/i)).toBeInTheDocument();
      // The role picker step shows both trade options
      expect(screen.getByText(/electrician/i)).toBeInTheDocument();
      expect(screen.getByText(/plumber/i)).toBeInTheDocument();
    });
  });

  // ── Test 6 ── Worker selects Plumber and joins ─────────────────────────
  it("6. Worker selects the Plumber trade and joins the organisation", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(NEW_USER);
    firestoreModule.getDocs.mockResolvedValueOnce(
      makeSnap([
        makeDocSnap("org-1", {
          name: "BuildCo Construction",
          inviteCode: "VALID1",
        }),
      ]),
    );
    firestoreModule.updateDoc.mockResolvedValue(undefined);
    mockUpdateUserProfile.mockResolvedValue(undefined);

    render(<OrganizationPage />);

    // Step 1: enter invite code
    await user.click(
      screen.getByRole("button", { name: /join organization/i }),
    );
    await user.type(screen.getByRole("textbox"), "VALID1");
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 2: pick trade — click the Plumber card
    await waitFor(() => {
      expect(screen.getByText(/plumber/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /plumber/i }));
    await user.click(
      screen.getByRole("button", { name: /join organization/i }),
    );

    await waitFor(() => {
      expect(mockUpdateUserProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "plumber",
          organizationId: "org-1",
        }),
      );
    });
  });

  // ── Test 7 ── Manager creates a project ───────────────────────────────
  it("7. Manager can create a new project inside their organisation", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(MANAGER);

    let created = false;
    firestoreModule.getDocs.mockImplementation((queryRef) => {
      const collectionName = getCollectionName(queryRef);
      if (collectionName === "projects") {
        if (!created) return Promise.resolve(makeSnap([]));
        return Promise.resolve(
          makeSnap([
            makeDocSnap("proj-1", {
              name: "Riverside Tower",
              description: "Main site",
              status: "active",
              organizationId: "org-1",
            }),
          ]),
        );
      }
      if (collectionName === "tasks" || collectionName === "blueprints") {
        return Promise.resolve(makeSnap([]));
      }
      return Promise.resolve(makeSnap([]));
    });

    firestoreModule.addDoc.mockImplementationOnce(async () => {
      created = true;
      return { id: "proj-1" };
    });

    render(<ProjectsPage />);

    // Open the "New Project" modal
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /\+ new project/i }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /\+ new project/i }));

    // Labels in ProjectsPage are not aria-associated with inputs;
    // the first textbox in the modal is the required Project Name field.
    const [nameInput] = screen.getAllByRole("textbox");
    await user.type(nameInput, "Riverside Tower");

    await user.click(screen.getByRole("button", { name: /^create project$/i }));

    await waitFor(() => {
      expect(firestoreModule.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: "Riverside Tower",
          organizationId: "org-1",
          status: "active",
        }),
      );
    });
  });

  // ── Test 8 ── Manager creates a task assigned to a worker ──────────────
  it("8. Manager can create a task with a description and assign it to a worker", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(MANAGER);

    const projectSnap = makeDocSnap("proj-1", {
      name: "Riverside Tower",
      status: "active",
      organizationId: "org-1",
    });
    const workerSnap = makeDocSnap("wkr-1", {
      name: "Bob Plumber",
      email: "bob@test.com",
      role: "plumber",
      organizationId: "org-1",
    });

    // getDoc calls: initial project load, then reload after task creation
    firestoreModule.getDoc
      .mockResolvedValueOnce(projectSnap)
      .mockResolvedValueOnce(projectSnap);

    firestoreModule.getDocs.mockImplementation((queryRef) => {
      const collectionName = getCollectionName(queryRef);
      if (collectionName === "users") {
        return Promise.resolve(makeSnap([workerSnap]));
      }
      if (collectionName === "tasks") {
        return Promise.resolve(makeSnap([]));
      }
      if (collectionName === "blueprints") {
        return Promise.resolve(makeSnap([]));
      }
      return Promise.resolve(makeSnap([]));
    });

    firestoreModule.addDoc.mockResolvedValueOnce({ id: "task-1" });

    const { container } = render(<TasksPage />);

    // Wait until the Create Task button is enabled (workers have loaded)
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^create task$/i }),
      ).not.toBeDisabled();
    });

    // Fill task title and description
    const textboxes = container.querySelectorAll(
      ".task-create-form input[type='text'], .task-create-form textarea",
    );
    await user.type(textboxes[0], "Install Floor 1 Pipes"); // Task Title
    await user.type(
      textboxes[1],
      "Run cold-water supply lines under Floor 1 slab",
    ); // Description

    // Set due date via fireEvent.change (userEvent.type is unreliable for date inputs)
    const dateInput = container.querySelector("input[type='date']");
    fireEvent.change(dateInput, { target: { value: "2026-04-15" } });

    await user.click(screen.getByRole("button", { name: /^create task$/i }));

    await waitFor(() => {
      expect(firestoreModule.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          title: "Install Floor 1 Pipes",
          description: "Run cold-water supply lines under Floor 1 slab",
          projectId: "proj-1",
          assignedWorkerId: "wkr-1",
          assignedWorkerName: "Bob Plumber",
        }),
      );
    });
  });

  // ── Test 9 ── Task form validates required fields ─────────────────────
  it("9. Task form shows a validation error when required fields are missing", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue(MANAGER);

    const projectSnap = makeDocSnap("proj-1", {
      name: "Riverside Tower",
      status: "active",
      organizationId: "org-1",
    });
    const workerSnap = makeDocSnap("wkr-1", {
      name: "Bob Plumber",
      email: "bob@test.com",
      role: "plumber",
      organizationId: "org-1",
    });

    firestoreModule.getDoc.mockResolvedValueOnce(projectSnap);
    firestoreModule.getDocs.mockImplementation((queryRef) => {
      const collectionName = getCollectionName(queryRef);
      if (collectionName === "users") {
        return Promise.resolve(makeSnap([workerSnap]));
      }
      if (collectionName === "tasks") {
        return Promise.resolve(makeSnap([]));
      }
      if (collectionName === "blueprints") {
        return Promise.resolve(makeSnap([]));
      }
      return Promise.resolve(makeSnap([]));
    });

    const { container } = render(<TasksPage />);

    // Wait until workers load so the button is enabled
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^create task$/i }),
      ).not.toBeDisabled();
    });

    // Fill only the task title — leave description and due date intentionally empty
    const titleInput = container.querySelector(
      ".task-create-form input[type='text']",
    );
    await user.type(titleInput, "Incomplete Task");

    // Use fireEvent.submit to bypass HTML5 required-attribute constraint
    // so that React's own validation logic (setError) is exercised.
    fireEvent.submit(container.querySelector(".task-create-form"));

    // React validation fires because description and dueDate are still empty
    await waitFor(() => {
      expect(
        screen.getByText(/please fill title, description, due date/i),
      ).toBeInTheDocument();
    });
    expect(firestoreModule.addDoc).not.toHaveBeenCalled();
  });

  // ── Test 10 ── Worker sees their assigned tasks ────────────────────────
  it("10. Worker sees their assigned tasks listed on the Worker Dashboard", async () => {
    useAuth.mockReturnValue(WORKER);

    firestoreModule.getDoc.mockResolvedValueOnce(
      makeDocSnap("wkr-1", {
        name: "Bob Plumber",
        role: "plumber",
        organizationId: "org-1",
      }),
    );

    firestoreModule.getDocs.mockImplementation((queryRef) => {
      const collectionName = getCollectionName(queryRef);
      if (collectionName === "projects") {
        return Promise.resolve(
          makeSnap([
            makeDocSnap("proj-1", {
              name: "Riverside Tower",
              status: "active",
              organizationId: "org-1",
            }),
          ]),
        );
      }

      if (collectionName === "tasks") {
        return Promise.resolve(
          makeSnap([
            makeDocSnap("task-1", {
              title: "Fix Pipes Floor 2",
              dueDate: "2026-04-20",
              projectId: "proj-1",
              completed: false,
              assignedWorkerId: "wkr-1",
              organizationId: "org-1",
            }),
            makeDocSnap("task-2", {
              title: "Install Valve Room 3",
              dueDate: "2026-04-25",
              projectId: "proj-1",
              completed: true,
              assignedWorkerId: "wkr-1",
              organizationId: "org-1",
            }),
          ]),
        );
      }

      return Promise.resolve(makeSnap([]));
    });

    render(<WorkerDashboard />);

    // Both tasks should appear in the dashboard
    await waitFor(() => {
      expect(screen.getByText("Fix Pipes Floor 2")).toBeInTheDocument();
      expect(screen.getByText("Install Valve Room 3")).toBeInTheDocument();
    });

    // The completed task should be marked "Done"
    expect(screen.getByText("Done")).toBeInTheDocument();
    // The pending task shows "Pending" — appears in both the stat card and the task row
    expect(screen.getAllByText("Pending").length).toBeGreaterThanOrEqual(1);
  });

  it("11. Task progress averages completion across all blueprints linked to the task", async () => {
    useAuth.mockReturnValue(MANAGER);

    const projectSnap = makeDocSnap("proj-1", {
      name: "Riverside Tower",
      status: "active",
      organizationId: "org-1",
    });
    const workerSnap = makeDocSnap("wkr-1", {
      name: "Bob Plumber",
      email: "bob@test.com",
      role: "plumber",
      organizationId: "org-1",
    });

    firestoreModule.getDoc.mockResolvedValueOnce(projectSnap);
    firestoreModule.getDocs.mockImplementation((queryRef) => {
      const collectionName = getCollectionName(queryRef);
      if (collectionName === "users") {
        return Promise.resolve(makeSnap([workerSnap]));
      }
      if (collectionName === "tasks") {
        return Promise.resolve(
          makeSnap([
            makeDocSnap("task-1", {
              title: "Hello",
              description: "Main washroom rough-in",
              dueDate: "2026-03-19",
              assignedWorkerId: "wkr-1",
              assignedWorkerName: "Bob Plumber",
              projectId: "proj-1",
            }),
          ]),
        );
      }
      if (collectionName === "blueprints") {
        return Promise.resolve(
          makeSnap([
            makeDocSnap("bp-1", {
              taskId: "task-1",
              projectId: "proj-1",
              objects: {
                pipeA: { completed: true, pointTasks: [] },
                pipeB: { completed: false, pointTasks: [] },
              },
            }),
            makeDocSnap("bp-2", {
              taskId: "task-1",
              projectId: "proj-1",
              objects: {
                fixturePipe: {
                  completed: false,
                  pointTasks: [
                    { requiredType: "valve", completed: true },
                    { requiredType: "join_2_way", completed: false },
                  ],
                },
              },
            }),
          ]),
        );
      }
      return Promise.resolve(makeSnap([]));
    });

    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByLabelText("Task progress 50%")).toBeInTheDocument();
  });
});
