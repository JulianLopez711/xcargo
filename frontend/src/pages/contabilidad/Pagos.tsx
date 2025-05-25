// ... importaciones
import "../../styles/contabilidad/Pagos.css";
import { useEffect, useState } from "react";
import { saveAs } from "file-saver";

interface Pago {
  referencia_pago: string;
  valor: number;
  fecha: string;
  entidad: string;
  estado: string;
  tipo: string;
  imagen: string;
  novedades?: string;
  num_guias: number;
  trackings_preview: string;
}

interface DetalleTracking {
  tracking: string;
  referencia: string;
  valor: number;
}

export default function PagosContabilidad() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [filtroReferencia, setFiltroReferencia] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [novedad, setNovedad] = useState("");
  const [refPagoSeleccionada, setRefPagoSeleccionada] = useState("");
  const [imagenSeleccionada, setImagenSeleccionada] = useState<string | null>(null);
  const [detalleTracking, setDetalleTracking] = useState<DetalleTracking[]>([]);
  const [modalDetallesVisible, setModalDetallesVisible] = useState(false);

  const obtenerPagos = async () => {
    try {
      const res = await fetch("http://localhost:8000/pagos/pagos-conductor");
      const data = await res.json();

      if (!Array.isArray(data)) {
        console.error("Respuesta inesperada:", data);
        setPagos([]);
        return;
      }

      setPagos(data);
    } catch (err) {
      console.error("Error cargando pagos:", err);
      alert("Error al cargar pagos desde el servidor.");
      setPagos([]);
    }
  };

  useEffect(() => {
    obtenerPagos();
  }, []);

  const pagosFiltrados = pagos.filter((p) => {
    const cumpleReferencia = p.referencia_pago
      .toLowerCase()
      .includes(filtroReferencia.toLowerCase());
    const cumpleDesde = !fechaDesde || p.fecha >= fechaDesde;
    const cumpleHasta = !fechaHasta || p.fecha <= fechaHasta;
    return cumpleReferencia && cumpleDesde && cumpleHasta;
  });

  const descargarCSV = () => {
    const encabezado = "ID,Referencia_Pago,Valor_Total,Fecha,Entidad,Estado,Tipo,Num_Guias\n";
    const filas = pagosFiltrados
      .map(
        (p, idx) =>
          `${idx + 1},${p.referencia_pago},${p.valor},${p.fecha},${p.entidad},${p.estado},${p.tipo},${p.num_guias}`
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

  const verImagen = (src: string) => {
    setImagenSeleccionada(src);
  };

  const verDetallesPago = async (referenciaPago: string) => {
    try {
      const res = await fetch(`http://localhost:8000/pagos/detalles-pago/${referenciaPago}`);
      const data = await res.json();
      setDetalleTracking(data);
      setModalDetallesVisible(true);
    } catch (err) {
      console.error("Error cargando detalles:", err);
      alert("Error al cargar detalles del pago.");
    }
  };

  const aprobarPago = async (referenciaPago: string) => {
    try {
      const user = JSON.parse(localStorage.getItem("user")!);
      const res = await fetch("http://localhost:8000/pagos/aprobar-pago", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referencia_pago: referenciaPago,
          modificado_por: user.email,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.detail || "Error desconocido");

      alert("✅ Pago aprobado correctamente.");
      obtenerPagos();
    } catch (error: any) {
      console.error(error);
      alert("❌ Error al aprobar el pago: " + error.message);
    }
  };

  const confirmarRechazo = async () => {
    if (!novedad.trim()) {
      alert("Debes escribir una observación.");
      return;
    }

    try {
      const user = JSON.parse(localStorage.getItem("user")!);
      const res = await fetch("http://localhost:8000/pagos/rechazar-pago", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referencia_pago: refPagoSeleccionada,
          novedad,
          modificado_por: user.email,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.detail || "Error desconocido");

      alert("❌ Pago rechazado correctamente.");
      setModalVisible(false);
      setNovedad("");
      setRefPagoSeleccionada("");
      obtenerPagos();
    } catch (error: any) {
      console.error(error);
      alert("❌ Error al rechazar el pago: " + error.message);
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
          📥 Descargar Informe
        </button>
      </div>

      <div className="pagos-tabla-container">
        <table className="pagos-tabla">
          <thead>
            <tr>
              <th>ID</th>
              <th>Ref. Pago</th>
              <th>Valor Total</th>
              <th>Guías</th>
              <th>Fecha</th>
              <th>Entidad</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Comprobante</th>
              <th>Trackings</th>
              <th>Novedades</th>
              <th>Acción</th>
            </tr>
          </thead>

          <tbody>
            {pagosFiltrados.length > 0 ? (
              pagosFiltrados.map((p, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>{p.referencia_pago}</td>
                  <td>${p.valor.toLocaleString()}</td>
                  <td>{p.num_guias}</td>
                  <td>{p.fecha}</td>
                  <td>{p.entidad}</td>
                  <td>{p.tipo}</td>
                  <td
                    style={{
                      color: p.estado === "rechazado" ? "crimson" : 
                             p.estado === "aprobado" ? "green" : undefined,
                    }}
                  >
                    {p.estado}
                  </td>
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
                      onClick={() => verDetallesPago(p.referencia_pago)}
                      className="btn-ver"
                      title={p.trackings_preview}
                    >
                      Detalles ({p.num_guias})
                    </button>
                  </td>
                  <td>
                    {p.novedades ? (
                      <span style={{ fontStyle: "italic", color: "#6b7280" }}>
                        {p.novedades}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    <button
                      onClick={() => aprobarPago(p.referencia_pago)}
                      className="boton-aprobar"
                      disabled={p.estado === "aprobado"}
                    >
                      {p.estado === "aprobado" ? "Aprobado" : "Aprobar"}
                    </button>
                    <button
                      onClick={() => {
                        setRefPagoSeleccionada(p.referencia_pago);
                        setModalVisible(true);
                      }}
                      className="boton-rechazar"
                      disabled={p.estado === "rechazado"}
                    >
                      Rechazar
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={12}
                  style={{ textAlign: "center", padding: "1rem" }}
                >
                  No hay pagos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {modalDetallesVisible && (
          <div className="modal-overlay" onClick={() => setModalDetallesVisible(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>Detalles del Pago</h3>
              {detalleTracking.length > 0 ? (
                <div>
                  <table style={{ width: '100%', marginTop: '1rem' }}>
                    <thead>
                      <tr>
                        <th>Tracking</th>
                        <th>Referencia</th>
                        <th>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalleTracking.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.tracking}</td>
                          <td>{item.referencia}</td>
                          <td>${item.valor.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: '1rem', fontWeight: 'bold' }}>
                    Total: ${detalleTracking.reduce((sum, item) => sum + item.valor, 0).toLocaleString()}
                  </div>
                </div>
              ) : (
                <p>No hay guías asociadas.</p>
              )}
              <button
                onClick={() => setModalDetallesVisible(false)}
                className="cerrar-modal"
                style={{ marginTop: "1rem" }}
              >
                ✕ Cerrar
              </button>
            </div>
          </div>
        )}
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

      {modalVisible && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>¿Por qué deseas rechazar este pago?</h3>
            <textarea
              value={novedad}
              onChange={(e) => setNovedad(e.target.value)}
              rows={5}
              placeholder="Ej: El valor no coincide con las guías."
              style={{ width: "100%", marginBottom: "1rem" }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <button
                className="boton-secundario"
                onClick={() => {
                  setModalVisible(false);
                  setNovedad("");
                  setRefPagoSeleccionada("");
                }}
              >
                Cancelar
              </button>
              <button className="boton-registrar" onClick={confirmarRechazo}>
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}