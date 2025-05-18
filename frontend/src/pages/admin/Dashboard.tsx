// src/pages/admin/Dashboard.tsx
import "../../styles/admin/Dashboard.css";

export default function DashboardAdmin() {
  return (
    <div className="dashboard-admin">
      <h1 className="dashboard-title">Panel de Administrador</h1>
      <div className="dashboard-cards">
        <div className="dashboard-card">
          <h2>Usuarios</h2>
          <p>Gestión de usuarios registrados</p>
        </div>
        <div className="dashboard-card">
          <h2>Pagos</h2>
          <p>Ver historial y estado de pagos</p>
        </div>
        <div className="dashboard-card">
          <h2>Entregas</h2>
          <p>Revisión de entregas realizadas</p>
        </div>
        <div className="dashboard-card">
          <h2>Reportes</h2>
          <p>Visualización y descarga de reportes</p>
          
        </div>
      </div>
    </div>
  );
}
