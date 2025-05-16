import "../../styles/admin/Pagos.css";
import PagosTable from "../../components/Admin/PagosTable";
import { useState } from "react";

export default function PagosAdmin() {
  const [filtroOperador, setFiltroOperador] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");

  return (
    <div className="pagos-admin">
      <div className="pagos-header">
        <h1>Gestión de Pagos</h1>
        <button className="export-button">Exportar</button>
      </div>

      <div className="pagos-filtros">
        <select value={filtroOperador} onChange={(e) => setFiltroOperador(e.target.value)}>
          <option value="">Todos los operadores</option>
          <option value="Dafiti">Dafiti</option>
          <option value="Dropy">Dropy</option>
          <option value="Tridy">Tridy</option>
        </select>
        <input
          type="date"
          value={fechaInicio}
          onChange={(e) => setFechaInicio(e.target.value)}
        />
        <input
          type="date"
          value={fechaFin}
          onChange={(e) => setFechaFin(e.target.value)}
        />
      </div>

      <PagosTable
        operador={filtroOperador}
        fechaInicio={fechaInicio}
        fechaFin={fechaFin}
      />
    </div>
  );
}
