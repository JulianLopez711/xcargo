import { useState, useEffect } from "react";
import "../../styles/admin/Historial.css";
import { saveAs } from "file-saver";

interface HistorialItem {
  id: number;
  operador: string;
  tipo: "Pago" | "Entrega" | "Cruce";
  valor: number;
  referencia: string;
  fecha: string;
}

const historialMock: HistorialItem[] = [
  {
    id: 1,
    operador: "Dafity",
    tipo: "Pago",
    valor: 150000,
    referencia: "DAF-12345",
    fecha: "2025-05-11",
  },
  {
    id: 2,
    operador: "Dropy",
    tipo: "Entrega",
    valor: 0,
    referencia: "DRO-45678",
    fecha: "2025-05-10",
  },
  {
    id: 3,
    operador: "Trady",
    tipo: "Cruce",
    valor: 80000,
    referencia: "TRA-78901",
    fecha: "2025-05-09",
  },
];

export default function Historial() {
  const [filtros, setFiltros] = useState({ operador: "", fecha: "" });
  const [items, setItems] = useState<HistorialItem[]>(historialMock);

  useEffect(() => {
    const filtrados = historialMock.filter((item) => {
      const coincideFecha = !filtros.fecha || item.fecha === filtros.fecha;
      const coincideOperador = !filtros.operador || item.operador === filtros.operador;
      return coincideFecha && coincideOperador;
    });
    setItems(filtrados);
  }, [filtros]);

  const exportarCSV = () => {
    const encabezado = "ID,Operador,Tipo,Valor,Referencia,Fecha\n";
    const filas = items.map(
      (i) => `${i.id},${i.operador},${i.tipo},${i.valor},${i.referencia},${i.fecha}`
    ).join("\n");
    const blob = new Blob([encabezado + filas], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `historial_admin_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="historial-admin">
      <div className="historial-header">
        <h1>Historial de Operaciones</h1>
        <p>Consulta y exporta operaciones históricas realizadas por operadores.</p>
      </div>

      <div className="filtros-historial">
        <select
          value={filtros.operador}
          onChange={(e) => setFiltros({ ...filtros, operador: e.target.value })}
        >
          <option value="">Todos los operadores</option>
          <option value="Dafity">Dafity</option>
          <option value="Dropy">Dropy</option>
          <option value="Trady">Trady</option>
        </select>
        <input
          type="date"
          value={filtros.fecha}
          onChange={(e) => setFiltros({ ...filtros, fecha: e.target.value })}
        />
        <button onClick={exportarCSV} className="btn-exportar">📥 Exportar</button>
      </div>

      <div className="tabla-historial">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Operador</th>
              <th>Tipo</th>
              <th>Valor</th>
              <th>Referencia</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? (
              items.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.operador}</td>
                  <td>{item.tipo}</td>
                  <td>{item.valor ? `$${item.valor.toLocaleString()}` : "—"}</td>
                  <td>{item.referencia}</td>
                  <td>{item.fecha}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "1rem" }}>
                  No se encontraron registros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
