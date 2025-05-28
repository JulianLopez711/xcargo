
import { useEffect, useState } from "react";
import "../../styles/contabilidad/HistorialPagos.css";

interface Pago {
  referencia_pago: string;
  valor: number;
  fecha: string;
  entidad: string;
  estado: string;
  tipo: string;
  imagen: string;
  novedades?: string;
}

export default function HistorialPagos() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [estado, setEstado] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [referencia, setReferencia] = useState("");

  const obtenerHistorial = async () => {
    const params = new URLSearchParams();
    if (estado) params.append("estado", estado);
    if (desde) params.append("desde", desde);
    if (hasta) params.append("hasta", hasta);
    if (referencia) params.append("referencia", referencia);

    try {
      const res = await fetch(`http://localhost:8000pagos/historial?${params.toString()}`);
      const data = await res.json();
      setPagos(data);
    } catch (error) {
      console.error("Error al obtener historial de pagos:", error);
      alert("❌ Error al cargar historial de pagos.");
    }
  };

  useEffect(() => {
    obtenerHistorial();
  }, []);

  return (
    <div className="historial-pagos">
      <h2>Historial de Pagos</h2>

      <div className="filtros">
        <label>
          Estado:
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="aprobado">Aprobado</option>
            <option value="rechazado">Rechazado</option>
            <option value="pagado">Pagado</option>
            <option value="pendiente">Pendiente</option>
          </select>
        </label>
        <label>
          Desde:
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label>
          Hasta:
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <label>
          Referencia:
          <input type="text" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
        </label>
        <button onClick={obtenerHistorial}>🔍 Buscar</button>
      </div>

      <table className="tabla-historial">
        <thead>
          <tr>
            <th>#</th>
            <th>Referencia</th>
            <th>Valor</th>
            <th>Fecha</th>
            <th>Entidad</th>
            <th>Tipo</th>
            <th>Estado</th>
            <th>Comprobante</th>
            <th>Novedades</th>
          </tr>
        </thead>
        <tbody>
          {pagos.length > 0 ? (
            pagos.map((pago, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>{pago.referencia_pago}</td>
                <td>${pago.valor.toLocaleString()}</td>
                <td>{pago.fecha}</td>
                <td>{pago.entidad}</td>
                <td>{pago.tipo}</td>
                <td>{pago.estado}</td>
                <td>
                  <a href={pago.imagen} target="_blank" rel="noopener noreferrer">
                    Ver
                  </a>
                </td>
                <td>{pago.novedades || "-"}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={9} style={{ textAlign: "center" }}>
                No se encontraron pagos.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
