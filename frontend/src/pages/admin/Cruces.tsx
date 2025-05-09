// src/pages/admin/Cruces.tsx
import "../../styles/Cruces.css";
import CrucesTable from "../../components/Admin/CrucesTable";

export default function CrucesAdmin() {
  return (
    <div className="cruces-admin">
      <div className="cruces-header">
        <h1>Cruce de Pagos</h1>
        <p>Verifica que los pagos coincidan con las referencias asociadas</p>
      </div>

      <CrucesTable />
    </div>
  );
}
