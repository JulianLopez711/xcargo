// ... importaciones
import "../../styles/contabilidad/Pagos.css";
import { useEffect, useState } from "react";
import { saveAs } from "file-saver";

interface Pago {
  referencia: string;
  valor: number;
  fecha: string;
  entidad: string;
  estado: string;
  tipo: string;
  imagen: string;
}

export default function PagosContabilidad() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [filtroReferencia, setFiltroReferencia] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  useEffect(() => {
  fetch("http://localhost:8000/pagos/pagos-conductor")
    .then((res) => res.json())
    .then((data) => setPagos(data))
    .catch((err) => {
      console.error("Error cargando pagos:", err);
      alert("Error al cargar los pagos desde el servidor.");
    });
}, []);


  const pagosFiltrados = pagos.filter((p) => {
    const cumpleReferencia = p.referencia
      .toLowerCase()
      .includes(filtroReferencia.toLowerCase());
    const cumpleDesde = !fechaDesde || p.fecha >= fechaDesde;
    const cumpleHasta = !fechaHasta || p.fecha <= fechaHasta;
    return cumpleReferencia && cumpleDesde && cumpleHasta;
  });

  const descargarCSV = () => {
    const encabezado = "ID,Referencia,Valor,Fecha,Entidad,Estado,Tipo\n";
    const filas = pagosFiltrados
      .map(
        (p, idx) =>
          `${idx + 1},${p.referencia},${p.valor},${p.fecha},${p.entidad},${
            p.estado
          },${p.tipo}`
      )
      .join("\n");

    const blob = new Blob([encabezado + filas], {
      type: "text/csv;charset=utf-8;",
    });
    saveAs(
      blob,
      `pagos-consolidados-${new Date().toISOString().split("T")[0]}.csv`
    );
  };
  const [imagenSeleccionada, setImagenSeleccionada] = useState<string | null>(
    null
  );

  const verImagen = (src: string) => {
    setImagenSeleccionada(src);
  };

  const manejarAprobacion = (referencia: string) => {
    alert(`✅ Pago con referencia ${referencia} aprobado.`);
    // Aquí podrías hacer un fetch para notificar al backend
  };

  const manejarRechazo = (referencia: string) => {
    const observacion = prompt(
      `❌ Ingresa el motivo de rechazo del pago con referencia ${referencia}:`
    );
    if (observacion && observacion.trim() !== "") {
      console.log(`Rechazo registrado para ${referencia}: ${observacion}`);
      alert(`❌ Pago rechazado con observación:\n"${observacion}"`);
      // Aquí podrías hacer un fetch con { referencia, observacion }
    } else {
      alert("Debe ingresar una observación válida para rechazar el pago.");
    }
  };

  return (
    <div className="pagos-page">
      <h2 className="pagos-title">Módulo de Pagos</h2>

      <div className="pagos-filtros">
        <label>
          Buscar referencia:
          <input
            type="text"
            placeholder="Ej: REF123"
            value={filtroReferencia}
            onChange={(e) => setFiltroReferencia(e.target.value)}
          />
        </label>
        <label>
          Desde:
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
          />
        </label>
        <label>
          Hasta:
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
          />
        </label>
        <button onClick={descargarCSV} className="boton-accion">
          📥 Descargar CSV
        </button>
      </div>

      <div className="pagos-tabla-container">
        <table className="pagos-tabla">
          <thead>
            <tr>
              <th>ID</th>
              <th>Referencia</th>
              <th>Valor</th>
              <th>Fecha</th>
              <th>Entidad</th>
              <th>Estado</th>
              <th>Tipo</th>
              <th>Comprobante</th>
              <th>Novedades</th>
            </tr>
          </thead>
          <tbody>
            {pagosFiltrados.length > 0 ? (
              pagosFiltrados.map((p, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>{p.referencia}</td>
                  <td>${p.valor.toLocaleString()}</td>
                  <td>{p.fecha}</td>
                  <td>{p.entidad}</td>
                  <td>{p.estado}</td>
                  <td>{p.tipo}</td>
                  <td>
                    <button
                      onClick={() => verImagen(p.imagen)}
                      className="btn-ver"
                    >
                     👁 Ver
                    </button>
                  </td>

                  <td>
                    <button
                      onClick={() => manejarAprobacion(p.referencia)}
                      className="boton-aprobar"
                    >
                      Aprobar
                    </button>
                    <button
                      onClick={() => manejarRechazo(p.referencia)}
                      className="boton-rechazar"
                    >
                      Rechazar
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={9}
                  style={{ textAlign: "center", padding: "1rem" }}
                >
                  No hay pagos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {imagenSeleccionada && (
        <div
          className="modal-overlay"
          onClick={() => setImagenSeleccionada(null)}
        >
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
