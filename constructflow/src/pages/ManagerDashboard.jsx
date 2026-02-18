/**
 * ManagerDashboard.jsx
 *
 * Main dashboard page for project managers. Displays an overview of all active projects,
 * key statistics (active projects, workers, tasks), and provides quick action buttons
 * for common tasks like uploading blueprints and managing workers. This is the default
 * landing page when users first access the application.
 */

import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import ProjectCard from "../components/ProjectCard";
import "../styles/Dashboard.css";

function ManagerDashboard() {
  // Placeholder data for demonstration
  const projects = [
    {
      id: 1,
      name: "Building A - Phase 1",
      status: "In Progress",
      completion: 65,
    },
    {
      id: 2,
      name: "Building B - Electrical",
      status: "Pending",
      completion: 30,
    },
    {
      id: 3,
      name: "Building C - Plumbing",
      status: "In Progress",
      completion: 80,
    },
  ];

  return (
    <div className="dashboard">
      <Sidebar />
      <div className="dashboard-content">
        <Header title="Manager Dashboard" role="manager" />

        <div className="dashboard-main">
          <div className="dashboard-stats">
            <div className="stat-card">
              <h3>Active Projects</h3>
              <p className="stat-number">12</p>
            </div>
            <div className="stat-card">
              <h3>Total Workers</h3>
              <p className="stat-number">48</p>
            </div>
            <div className="stat-card">
              <h3>Completed Tasks</h3>
              <p className="stat-number">156</p>
            </div>
            <div className="stat-card">
              <h3>Pending Tasks</h3>
              <p className="stat-number">23</p>
            </div>
          </div>

          <div className="section">
            <div className="section-header">
              <h2>Recent Projects</h2>
              <button className="btn-secondary">View All</button>
            </div>
            <div className="projects-grid">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          </div>

          <div className="section">
            <div className="section-header">
              <h2>Quick Actions</h2>
            </div>
            <div className="quick-actions">
              <button className="action-btn">
                <span className="icon">📤</span>
                Upload Blueprint
              </button>
              <button className="action-btn">
                <span className="icon">📊</span>
                View Reports
              </button>
              <button className="action-btn">
                <span className="icon">👥</span>
                Manage Workers
              </button>
              <button className="action-btn">
                <span className="icon">⚙️</span>
                Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ManagerDashboard;
