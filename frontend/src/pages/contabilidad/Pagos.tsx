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
  referencia_pago: string;
  novedades?: string;
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

  const obtenerPagos = () => {
    fetch("https://api.x-cargo.co/pagos/pagos-conductor")
      .then((res) => res.json())
      .then((data) => setPagos(data))
      .catch((err) => {
        console.error("Error cargando pagos:", err);
        alert("Error al cargar los pagos desde el servidor.");
      });
  };

  useEffect(() => {
    obtenerPagos();
  }, []);

  const pagosFiltrados = pagos.filter((p) => {
    const cumpleReferencia = p.referencia.toLowerCase().includes(filtroReferencia.toLowerCase());
    const cumpleDesde = !fechaDesde || p.fecha >= fechaDesde;
    const cumpleHasta = !fechaHasta || p.fecha <= fechaHasta;
    return cumpleReferencia && cumpleDesde && cumpleHasta;
  });

  const descargarCSV = () => {
    const encabezado = "ID,Referencia,Valor,Fecha,Entidad,Estado,Tipo\n";
    const filas = pagosFiltrados
      .map(
        (p, idx) =>
          `${idx + 1},${p.referencia},${p.valor},${p.fecha},${p.entidad},${p.estado},${p.tipo}`
      )
      .join("\n");

    const blob = new Blob([encabezado + filas], {
      type: "text/csv;charset=utf-8;",
    });
    saveAs(blob, `pagos-consolidados-${new Date().toISOString().split("T")[0]}.csv`);
  };

  const verImagen = (src: string) => {
    setImagenSeleccionada(src);
  };

  const confirmarRechazo = async () => {
    if (!novedad.trim()) {
      alert("Debes escribir una observación.");
      return;
    }

    try {
      const user = JSON.parse(localStorage.getItem("user")!);
      const res = await fetch("https://api.x-cargo.co/pagos/rechazar-pago", {
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
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
        </label>
        <label>
          Hasta:
          <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
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
              <th>Ref. Comprobante</th>
              <th>Valor</th>
              <th>Fecha</th>
              <th>Entidad</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Comprobante</th>
              <th>Rechazar</th>
              <th>Novedades</th>
            </tr>
          </thead>
          <tbody>
            {pagosFiltrados.length > 0 ? (
              pagosFiltrados.map((p, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>{p.referencia_pago}</td>
                  <td>{p.referencia}</td>
                  <td>${p.valor.toLocaleString()}</td>
                  <td>{p.fecha}</td>
                  <td>{p.entidad}</td>
                  <td>{p.tipo}</td>
                  <td style={{ color: p.estado === "rechazado" ? "crimson" : undefined }}>{p.estado}</td>
                  <td>
                    <button onClick={() => verImagen(p.imagen)} className="btn-ver">👁 Ver</button>
                  </td>
                  <td>
                    <button
                      onClick={() => {
                        setRefPagoSeleccionada(p.referencia_pago);
                        setModalVisible(true);
                      }}
                      className="boton-rechazar"
                    >
                      Rechazar
                    </button>
                  </td>
                  <td>
                    {p.novedades ? (
                      <span style={{ fontStyle: "italic", color: "#6b7280" }}>{p.novedades}</span>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={11} style={{ textAlign: "center", padding: "1rem" }}>
                  No hay pagos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {imagenSeleccionada && (
        <div className="modal-overlay" onClick={() => setImagenSeleccionada(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <img src={imagenSeleccionada} alt="Vista previa" />
            <button onClick={() => setImagenSeleccionada(null)} className="cerrar-modal">
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
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
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
