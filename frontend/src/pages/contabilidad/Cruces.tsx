import "../../styles/Cruces.css";
import sampleComprobante from "../../assets/comprobantes/4.jpeg";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

const pagosPendientes = [
  {
    id: 1,
    fecha: "2025-05-08",
    conductor: "Juan Pérez",
    valor: 22000,
    imagen: sampleComprobante,
    estado: "Pendiente",
  },
  {
    id: 2,
    fecha: "2025-05-08",
    conductor: "Pedro López",
    valor: 18000,
    imagen: sampleComprobante,
    estado: "Conciliado",
  },
];

export default function CrucesContabilidad() {
  const navigate = useNavigate();
  const [imagenSeleccionada, setImagenSeleccionada] = useState<string | null>(null);

  const verDetalles = (pagoId: number) => {
    navigate(`/contabilidad/detalle/${pagoId}`);
  };

  return (
    <div className="cruces-contabilidad">
      <h1>Conciliación de Pagos</h1>
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
          {pagosPendientes.map((pago) => (
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
                  Ver
                </button>
              </td>
              <td>
                <span className={`estado ${pago.estado.toLowerCase()}`}>{pago.estado}</span>
              </td>
              <td>
                <button onClick={() => verDetalles(pago.id)} className="btn-detalle">
                  Ver Detalles
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Modal dentro del return */}
      {imagenSeleccionada && (
        <div className="modal-overlay" onClick={() => setImagenSeleccionada(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <img src={imagenSeleccionada} alt="Vista previa" />
            <button
              onClick={() => setImagenSeleccionada(null)}
              className="cerrar-modal"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
