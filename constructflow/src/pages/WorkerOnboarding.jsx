import { useState } from "react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { useAuth } from "../contexts/AuthContext";
import "../styles/Dashboard.css";

function WorkerOnboarding() {
  const { currentUser, userProfile } = useAuth();
  const [projectCode, setProjectCode] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!projectCode.trim()) {
      setError("Please enter a project code");
      return;
    }

    // TODO: Validate project code and add worker to project
    console.log("Project code submitted:", projectCode);
  };

  return (
    <div className="dashboard">
      <Sidebar />
      <div className="dashboard-content">
        <Header title="Welcome" role="worker" />
        <div className="dashboard-main">
          <div style={{ maxWidth: "500px", margin: "0 auto", padding: "40px 20px" }}>
            <h2>Join a Project</h2>
            <p>Enter the project code provided by your manager to get started.</p>

            {error && <div className="error-message">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="projectCode">Project Code</label>
                <input
                  id="projectCode"
                  type="text"
                  placeholder=""
                  value={projectCode}
                  onChange={(e) => setProjectCode(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-primary">
                Join Project
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WorkerOnboarding;