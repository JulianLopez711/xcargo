import "../../styles/admin/Entregas.css";
import { useState } from "react";

const entregasMock = [
  {
    id: 1,
    tracking: "TRK001",
    operador: "Dafity",
    carrier: "Servientrega",
    ciudad: "Bogotá",
    fecha: "2025-05-11",
    estado: "Entregado",
  },
  {
    id: 2,
    tracking: "TRK002",
    operador: "Dropy",
    carrier: "Coordinadora",
    ciudad: "Medellín",
    fecha: "2025-05-10",
    estado: "Pendiente",
  },
];

export default function EntregasAdmin() {
  const [filtroOperador, setFiltroOperador] = useState("");
  const [filtroFecha, setFiltroFecha] = useState("");

  const entregasFiltradas = entregasMock.filter((e) =>
    (!filtroOperador || e.operador === filtroOperador) &&
    (!filtroFecha || e.fecha === filtroFecha)
  );

  return (
    <div className="entregas-admin">
      <div className="entregas-header">
        <h1>Entregas Realizadas</h1>
        <div className="filtros">
          <select value={filtroOperador} onChange={(e) => setFiltroOperador(e.target.value)}>
            <option value="">Todos los operadores</option>
            <option value="Dafity">Dafity</option>
            <option value="Dropy">Dropy</option>
            <option value="tridy">tridy</option>
          </select>
          <input
            type="date"
            value={filtroFecha}
            onChange={(e) => setFiltroFecha(e.target.value)}
          />
        </div>
      </div>

      <div className="tabla-container">
        <table className="tabla-entregas">
          <thead>
            <tr>
              <th>Tracking</th>
              <th>Operador</th>
              <th>Carrier</th>
              <th>Ciudad</th>
              <th>Fecha</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {entregasFiltradas.length > 0 ? (
              entregasFiltradas.map((e) => (
                <tr key={e.id}>
                  <td>{e.tracking}</td>
                  <td>{e.operador}</td>
                  <td>{e.carrier}</td>
                  <td>{e.ciudad}</td>
                  <td>{e.fecha}</td>
                  <td>{e.estado}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>No hay entregas registradas.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
