import "../../styles/contabilidad/Cruces.css";
import sampleComprobante from "../../assets/comprobantes/4.jpeg";
import { useState, useEffect } from "react";
import { saveAs } from "file-saver";

interface Pago {
  id: number;
  fecha: string;
  conductor: string;
  valor: number;
  imagen: string;
  estado: string;
  entidad?: string;
  tipo_pago?: string;
  referencia?: string;
}

const pagosMock: Pago[] = [
  {
    id: 1,
    fecha: "2025-05-08",
    conductor: "Juan Pérez",
    valor: 22000,
    imagen: sampleComprobante,
    estado: "Pendiente",
    entidad: "Nequi",
    tipo_pago: "Transferencia",
    referencia: "M2305695"
  },
  {
    id: 2,
    fecha: "2025-05-08",
    conductor: "Pedro López",
    valor: 18000,
    imagen: sampleComprobante,
    estado: "Conciliado",
    entidad: "Bancolombia",
    tipo_pago: "Consignación",
    referencia: "X1948223"
  }
];

export default function CrucesContabilidad() {
  const [imagenSeleccionada, setImagenSeleccionada] = useState<string | null>(null);
  const [pagoSeleccionado, setPagoSeleccionado] = useState<Pago | null>(null);
  const [filtros, setFiltros] = useState({ fecha: "", conductor: "", estado: "" });
  const [pagosFiltrados, setPagosFiltrados] = useState<Pago[]>(pagosMock);

  useEffect(() => {
    const filtrados = pagosMock.filter((p) => {
      const coincideFecha = !filtros.fecha || p.fecha === filtros.fecha;
      const coincideConductor = !filtros.conductor || p.conductor.toLowerCase().includes(filtros.conductor.toLowerCase());
      const coincideEstado = !filtros.estado || p.estado === filtros.estado;
      return coincideFecha && coincideConductor && coincideEstado;
    });
    setPagosFiltrados(filtrados);
  }, [filtros]);

  const descargarCSV = () => {
    const encabezado = "ID,Fecha,Conductor,Valor,Estado\n";
    const filas = pagosFiltrados.map(p =>
      `${p.id},${p.fecha},${p.conductor},${p.valor},${p.estado}`
    ).join("\n");

    const blob = new Blob([encabezado + filas], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `cruces-${new Date().toISOString().split("T")[0]}.csv`);
  };

  return (
    <div className="cruces-contabilidad">
      <h1>Conciliación de Pagos</h1>

      <div className="cruces-filtros">
        <input
          type="date"
          value={filtros.fecha}
          onChange={(e) => setFiltros({ ...filtros, fecha: e.target.value })}
        />
        <input
          type="text"
          placeholder="Conductor"
          value={filtros.conductor}
          onChange={(e) => setFiltros({ ...filtros, conductor: e.target.value })}
        />
        <select
          value={filtros.estado}
          onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}
        >
          <option value="">Todos</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Conciliado">Conciliado</option>
        </select>
        <button className="boton-accion" onClick={descargarCSV}>📥 Exportar CSV</button>
      </div>

      <table className="cruces-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Fecha</th>
            <th>Conductor</th>
            <th>Valor</th>
            <th>Comprobante</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pagosFiltrados.length > 0 ? (
            pagosFiltrados.map((pago) => (
              <tr key={pago.id}>
                <td>{pago.id}</td>
                <td>{pago.fecha}</td>
                <td>{pago.conductor}</td>
                <td>${pago.valor.toLocaleString()}</td>
                <td>
                  <button
                    onClick={() => setImagenSeleccionada(pago.imagen)}
                    className="btn-img-preview"
                  >
                    👁 Ver
                  </button>
                </td>
                <td>
                  <span className={`estado ${pago.estado.toLowerCase()}`}>{pago.estado}</span>
                </td>
                <td>
                  <button onClick={() => setPagoSeleccionado(pago)} className="btn-detalle">
                    Detalles
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", padding: "1rem" }}>
                No hay pagos encontrados.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Modal de imagen */}
      {imagenSeleccionada && (
        <div className="modal-overlay" onClick={() => setImagenSeleccionada(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <img src={imagenSeleccionada} alt="Vista previa" />
            <button onClick={() => setImagenSeleccionada(null)} className="cerrar-modal">✕</button>
          </div>
        </div>
      )}

      {/* Modal de detalles */}
      {pagoSeleccionado && (
        <div className="modal-overlay" onClick={() => setPagoSeleccionado(null)}>
          <div className="modal-detalle" onClick={(e) => e.stopPropagation()}>
            <h3>Detalles del Pago</h3>
            <ul>
              <li><strong>Conductor:</strong> {pagoSeleccionado.conductor}</li>
              <li><strong>Fecha:</strong> {pagoSeleccionado.fecha}</li>
              <li><strong>Valor:</strong> ${pagoSeleccionado.valor.toLocaleString()}</li>
              <li><strong>Entidad:</strong> {pagoSeleccionado.entidad}</li>
              <li><strong>Tipo de Pago:</strong> {pagoSeleccionado.tipo_pago}</li>
              <li><strong>Referencia:</strong> {pagoSeleccionado.referencia}</li>
              <li><strong>Estado:</strong> {pagoSeleccionado.estado}</li>
            </ul>
            <button className="cerrar-modal" onClick={() => setPagoSeleccionado(null)}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
