// src/pages/admin/UserManagement.tsx
import "../../styles/admin/UserManagement.css";
import UserTable from "../../components/Admin/UserTable";

export default function UserManagement() {
  return (
    <div className="user-management">
      <div className="user-management-header">
        <h1>Gestión de Usuarios</h1>
        <button className="add-user-button">+ Agregar usuario</button>
      </div>

      <UserTable />
    </div>
  );
}
