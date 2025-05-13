// src/pages/operador/HistorialOperador.tsx
import { useEffect, useState } from "react";
import "../../styles/HistorialOperador.css";
import { saveAs } from "file-saver";

interface RegistroPago {
  id: number;
  valor: number;
  referencia: string;
  fecha: string;
}

const registrosMock: RegistroPago[] = [
  { id: 1, valor: 22000, referencia: "MI8158035", fecha: "2025-05-10" },
  { id: 2, valor: 18000, referencia: "NE9910012", fecha: "2025-05-11" },
  { id: 3, valor: 25000, referencia: "TR5599884", fecha: "2025-05-11" },
];

export default function HistorialOperador() {
  const [fechaFiltro, setFechaFiltro] = useState("");
  const [filtrados, setFiltrados] = useState<RegistroPago[]>(registrosMock);

  useEffect(() => {
    if (!fechaFiltro) {
      setFiltrados(registrosMock);
    } else {
      setFiltrados(registrosMock.filter((r) => r.fecha === fechaFiltro));
    }
  }, [fechaFiltro]);

  const exportarCSV = () => {
    const encabezado = "ID,Valor,Referencia,Fecha\n";
    const filas = filtrados.map(r =>
      `${r.id},${r.valor},${r.referencia},${r.fecha}`
    ).join("\n");

    const blob = new Blob([encabezado + filas], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `historial-operador-${new Date().toISOString().split("T")[0]}.csv`);
  };

  return (
    <div className="historial-operador">
      <h2>Historial de Consignaciones</h2>

      <div className="filtros">
        <input
          type="date"
          value={fechaFiltro}
          onChange={(e) => setFechaFiltro(e.target.value)}
        />
        <button onClick={exportarCSV} className="boton-exportar">📥 Exportar CSV</button>
      </div>

      <table className="tabla-historial">
        <thead>
          <tr>
            <th>ID</th>
            <th>Valor</th>
            <th>Referencia</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          {filtrados.length > 0 ? (
            filtrados.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>${r.valor.toLocaleString()}</td>
                <td>{r.referencia}</td>
                <td>{r.fecha}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4}>No hay registros para esta fecha.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
