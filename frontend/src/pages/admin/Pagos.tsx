// src/pages/admin/Pagos.tsx
import "../../styles/admin/Pagos.css";
import PagosTable from "../../components/Admin/PagosTable";

export default function PagosAdmin() {
  return (
    <div className="pagos-admin">
      <div className="pagos-header">
        <h1>Gestión de Pagos</h1>
        <button className="export-button">Exportar</button>
      </div>

      <PagosTable />
    </div>
  );
}
