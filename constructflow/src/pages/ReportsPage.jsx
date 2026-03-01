/**
 * ReportsPage.jsx
 *
 * Analytics and reporting page providing insights into project performance and statistics.
 * Displays key metrics like total projects, completion rates, average project duration,
 * and worker utilization. Managers can generate and download various reports including
 * monthly summaries, worker performance reports, and budget analyses.
 */

import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { MdBarChart, MdTrendingUp, MdAttachMoney } from "react-icons/md";
import "../styles/Dashboard.css";

function ReportsPage() {
  return (
    <div className="dashboard">
      <Sidebar role="manager" />
      <div className="dashboard-content">
        <Header title="Reports & Analytics" role="manager" />

        <div className="dashboard-main">
          <div className="dashboard-stats">
            <div className="stat-card">
              <h3>Total Projects</h3>
              <p className="stat-number">24</p>
              <span className="stat-change positive">
                ↑ 12% from last month
              </span>
            </div>
            <div className="stat-card">
              <h3>Completion Rate</h3>
              <p className="stat-number">87%</p>
              <span className="stat-change positive">↑ 5% from last month</span>
            </div>
            <div className="stat-card">
              <h3>Average Time</h3>
              <p className="stat-number">14d</p>
              <span className="stat-change negative">↑ 2d from last month</span>
            </div>
            <div className="stat-card">
              <h3>Worker Utilization</h3>
              <p className="stat-number">92%</p>
              <span className="stat-change positive">↑ 8% from last month</span>
            </div>
          </div>

          <div className="section">
            <div className="section-header">
              <h2>Recent Reports</h2>
              <button className="btn-secondary">Generate Report</button>
            </div>

            <div className="reports-list">
              <div className="report-item">
                <div className="report-icon">
                  <MdBarChart />
                </div>
                <div className="report-info">
                  <h4>Monthly Project Summary - January 2026</h4>
                  <p>Generated on Feb 1, 2026</p>
                </div>
                <button className="btn-secondary">Download</button>
              </div>
              <div className="report-item">
                <div className="report-icon">
                  <MdTrendingUp />
                </div>
                <div className="report-info">
                  <h4>Worker Performance Report</h4>
                  <p>Generated on Jan 28, 2026</p>
                </div>
                <button className="btn-secondary">Download</button>
              </div>
              <div className="report-item">
                <div className="report-icon">
                  <MdAttachMoney />
                </div>
                <div className="report-info">
                  <h4>Budget Analysis - Q4 2025</h4>
                  <p>Generated on Jan 15, 2026</p>
                </div>
                <button className="btn-secondary">Download</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReportsPage;
