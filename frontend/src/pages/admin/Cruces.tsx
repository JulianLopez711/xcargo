import { useState, useEffect } from "react";
import "../../styles/admin/Cruces.css";
import sampleComprobante from "../../../public/comprobantes/4.jpeg";
import { saveAs } from "file-saver";

interface Cruce {
  id: number;
  operador: string;
  fecha: string;
  valor: number;
  referencia: string;
  comprobante: string;
  estado: string;
}

const crucesMock: Cruce[] = [
  {
    id: 1,
    operador: "Dafity",
    fecha: "2025-05-11",
    valor: 150000,
    referencia: "DAF-54321",
    comprobante: sampleComprobante,
    estado: "Conciliado",
  },
  {
    id: 2,
    operador: "Dropy",
    fecha: "2025-05-10",
    valor: 120000,
    referencia: "DRO-98234",
    comprobante: sampleComprobante,
    estado: "Pendiente",
  },
];

export default function CrucesAdmin() {
  const [filtros, setFiltros] = useState({ operador: "", fecha: "", estado: "" });
  const [cruces, setCruces] = useState<Cruce[]>(crucesMock);
  const [imagen, setImagen] = useState<string | null>(null);

  useEffect(() => {
    const filtrados = crucesMock.filter((c) => {
      const porFecha = !filtros.fecha || c.fecha === filtros.fecha;
      const porOperador = !filtros.operador || c.operador === filtros.operador;
      const porEstado = !filtros.estado || c.estado === filtros.estado;
      return porFecha && porOperador && porEstado;
    });
    setCruces(filtrados);
  }, [filtros]);

  const exportarCSV = () => {
    const encabezado = "ID,Operador,Fecha,Valor,Referencia,Estado\n";
    const filas = cruces.map(
      (c) => `${c.id},${c.operador},${c.fecha},${c.valor},${c.referencia},${c.estado}`
    ).join("\n");
    const blob = new Blob([encabezado + filas], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `cruces_admin_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="cruces-admin">
      <div className="cruces-header">
        <h1>Cruce de Pagos</h1>
        <p>Consulta, filtra y exporta los cruces de pago de operadores.</p>
      </div>

      <div className="filtros-cruces">
        <select value={filtros.operador} onChange={(e) => setFiltros({ ...filtros, operador: e.target.value })}>
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
        <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}>
          <option value="">Todos los estados</option>
          <option value="Conciliado">Conciliado</option>
          <option value="Pendiente">Pendiente</option>
        </select>
        <button className="btn-exportar" onClick={exportarCSV}>📁 Exportar</button>
      </div>

      <div className="tabla-cruces">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Operador</th>
              <th>Fecha</th>
              <th>Valor</th>
              <th>Referencia</th>
              <th>Comprobante</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {cruces.map((cruce) => (
              <tr key={cruce.id}>
                <td>{cruce.id}</td>
                <td>{cruce.operador}</td>
                <td>{cruce.fecha}</td>
                <td>${cruce.valor.toLocaleString()}</td>
                <td>{cruce.referencia}</td>
                <td>
                  <button onClick={() => setImagen(cruce.comprobante)}>👁 Ver</button>
                </td>
                <td className={`estado ${cruce.estado.toLowerCase()}`}>{cruce.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {imagen && (
        <div className="modal-overlay" onClick={() => setImagen(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <img src={imagen} alt="Vista comprobante" />
            <button className="cerrar-modal" onClick={() => setImagen(null)}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
