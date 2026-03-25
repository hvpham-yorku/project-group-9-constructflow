import Header from "../components/Header";
import Sidebar from "../components/Sidebar";

export default function MaterialsPage() {
  return (
    <div className="dashboard">
      <Sidebar />
      <div className="dashboard-content">
        <Header title="Inventory" />
        
        <div className="materials-page">
          <div className="materials-page-header">
            <h2>Project Inventory</h2>
          </div>
        </div>
      </div>
    </div>
  );
}