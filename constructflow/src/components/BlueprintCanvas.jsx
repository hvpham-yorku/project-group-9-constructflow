/**
 * BlueprintCanvas.jsx
 *
 * Canvas component for displaying and interacting with construction blueprints. Currently shows
 * a placeholder when no blueprint is uploaded. Will be extended to support blueprint image display,
 * section drawing tools, and interactive highlighting of defined sections.
 */

import { MdArchitecture } from "react-icons/md";
import "../styles/BlueprintCanvas.css";

function BlueprintCanvas() {
  return (
    <div className="blueprint-canvas">
      <div className="blueprint-placeholder">
        <div className="placeholder-content">
          <MdArchitecture className="placeholder-icon" />
          <p>No blueprint uploaded</p>
          <p className="placeholder-hint">Upload a blueprint to get started</p>
          <button className="btn-primary">Upload Blueprint</button>
        </div>
      </div>
    </div>
  );
}

export default BlueprintCanvas;
