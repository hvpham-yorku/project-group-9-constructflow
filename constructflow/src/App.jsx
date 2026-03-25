// Main app component - sets up routing and authentication context
// Routing logic:
//   Not logged in          → LoginPage  (shows sign-in / sign-up modal)
//   Logged in, no org      → OrganizationPage  (create or join an org)
//   Manager                → full manager routes
//   Worker (any trade)     → worker routes
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import LoginPage from "./pages/LoginPage";
import OrganizationPage from "./pages/OrganizationPage";
import ManagerDashboard from "./pages/ManagerDashboard";
import WorkerDashboard from "./pages/WorkerDashboard";
import BlueprintViewer from "./pages/BlueprintViewer";
import ProjectsPage from "./pages/ProjectsPage";
import TasksPage from "./pages/TasksPage";
import WorkersPage from "./pages/WorkersPage";
// import ReportsPage from "./pages/ReportsPage"; // Temporarily disabled
import SettingsPage from "./pages/SettingsPage";
import "./App.css";

function Spinner() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1a1f2e",
      }}
    >
      <div style={{ color: "#1e3a8a", fontSize: 18, fontWeight: 600 }}>
        Loading…
      </div>
    </div>
  );
}

function DashboardRouter() {
  const { currentUser, userProfile, isManager, isWorker, hasOrg, loading } =
    useAuth();

  if (loading) return <Spinner />;

  // Not authenticated → show login/signup
  if (!currentUser) {
    return <LoginPage />;
  }

  // Authenticated but not in any org yet → org setup
  if (!hasOrg) {
    return <OrganizationPage />;
  }

  // ── Manager routes ─────────────────────────────────────────────────────
  if (isManager) {
    return (
      <Routes>
        <Route path="/dashboard" element={<ManagerDashboard />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId/tasks" element={<TasksPage />} />
        <Route
          path="/projects/:projectId/tasks/:taskId/blueprints"
          element={<BlueprintViewer />}
        />
        <Route
          path="/projects/:projectId/blueprints"
          element={<BlueprintViewer />}
        />
        <Route path="/workers" element={<WorkersPage />} />
        {/* <Route path="/reports" element={<ReportsPage />} /> */}
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    );
  }

  // ── Worker routes ──────────────────────────────────────────────────────
  if (isWorker) {
    return (
      <Routes>
        <Route path="/dashboard" element={<WorkerDashboard />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId/tasks" element={<TasksPage />} />
        <Route
          path="/projects/:projectId/tasks/:taskId/blueprints"
          element={<BlueprintViewer />}
        />
        <Route
          path="/projects/:projectId/blueprints"
          element={<BlueprintViewer />}
        />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    );
  }

  // Fallback — shouldn't reach here (general users land on org page)
  return <OrganizationPage />;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <DashboardRouter />
      </Router>
    </AuthProvider>
  );
}

export default App;
