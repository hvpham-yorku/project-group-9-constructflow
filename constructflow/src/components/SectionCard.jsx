/**
 * SectionCard.jsx
 *
 * Card component representing a defined section on a blueprint (e.g., Plumbing - Floor 1).
 * Displays section name, assigned worker, status with color indicator, and action buttons
 * for editing and deleting sections. Used in the Blueprint Viewer sidebar.
 */

import { MdEdit, MdDelete } from "react-icons/md";
import "../styles/SectionCard.css";

function SectionCard({ section }) {
  const statusColors = {
    completed: "#10b981",
    "in-progress": "#f59e0b",
    pending: "#6b7280",
  };

  return (
    <div className="section-card">
      <div className="section-header">
        <div
          className="section-color-indicator"
          style={{ backgroundColor: statusColors[section.status] }}
        ></div>
        <h4>{section.name}</h4>
      </div>

      <div className="section-body">
        <p className="section-assigned">Assigned to: {section.assignedTo}</p>
        <span className={`status-badge ${section.status}`}>
          {section.status.replace("-", " ")}
        </span>
      </div>

      <div className="section-actions">
        <button className="btn-icon">
          <MdEdit />
        </button>
        <button className="btn-icon">
          <MdDelete />
        </button>
      </div>
    </div>
  );
}

export default SectionCard;
