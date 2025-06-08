import { useEffect, useState } from "react";
import { saveAs } from "file-saver";
import "../../styles/contabilidad/Pagos.css";

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
  correo_conductor: string;
  fecha_creacion?: string;
  fecha_modificacion?: string;
}

interface DetalleTracking {
  tracking: string;
  referencia: string;
  valor: number;
  cliente: string;
  entidad: string;
  tipo: string;
  fecha_pago: string;
  hora_pago: string;
  estado: string;
  novedades: string;
  comprobante: string;
}

interface ApiError {
  message: string;
  status?: number;
}

export default function PagosContabilidad() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [, setCargando] = useState(true);
  const [filtroReferencia, setFiltroReferencia] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [novedad, setNovedad] = useState("");
  const [refPagoSeleccionada, setRefPagoSeleccionada] = useState("");
  const [imagenSeleccionada, setImagenSeleccionada] = useState<string | null>(null);
  const [detalleTracking, setDetalleTracking] = useState<DetalleTracking[] | null>(null);
  const [modalDetallesVisible, setModalDetallesVisible] = useState(false);
  const [procesando, setProcesando] = useState<string | null>(null);

  const obtenerPagos = async () => {
    setCargando(true);
    
    try {
      const response = await fetch("http://192.168.0.38:8000/pagos/pagos-conductor", {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        throw new ApiError(`Error ${response.status}: ${response.statusText}`, response.status);
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        console.error("Respuesta inesperada:", data);
        throw new ApiError("Formato de respuesta inválido del servidor");
      }

      setPagos(data);
    } catch (err: unknown) {
      console.error("Error cargando pagos:", err);
      
      let mensajeError = "Error desconocido";
      
      if (err instanceof TypeError && err.message.includes('fetch')) {
        mensajeError = "No se pudo conectar al servidor";
      } else if (err instanceof Error) {
        if (err.name === 'AbortError') {
          mensajeError = "La consulta tardó demasiado tiempo";
        } else {
          mensajeError = err.message;
        }
      }
      
      alert(`Error al cargar pagos: ${mensajeError}`);
      setPagos([]);
    } finally {
      setCargando(false);
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
    const cumpleEstado = !filtroEstado || p.estado === filtroEstado;
    
    return cumpleReferencia && cumpleDesde && cumpleHasta && cumpleEstado;
  });

  const descargarCSV = () => {
    if (pagosFiltrados.length === 0) {
      alert("No hay datos para exportar");
      return;
    }

    const encabezado = "ID,Referencia_Pago,Valor_Total,Fecha,Entidad,Estado,Tipo,Num_Guias,Conductor,Fecha_Creacion\n";
    const filas = pagosFiltrados
      .map((p, idx) =>
        `${idx + 1},"${p.referencia_pago}",${p.valor},"${p.fecha}","${p.entidad}","${p.estado}","${p.tipo}",${p.num_guias},"${p.correo_conductor}","${p.fecha_creacion || ''}"`
      )
      .join("\n");

    const blob = new Blob([encabezado + filas], {
      type: "text/csv;charset=utf-8;",
    });
    
    const fechaHoy = new Date().toISOString().split("T")[0];
    saveAs(blob, `pagos-consolidados-${fechaHoy}.csv`);
  };

  const verImagen = (src: string) => {
    if (!src) {
      alert("No hay comprobante disponible");
      return;
    }
    setImagenSeleccionada(src);
  };

  const verDetallesPago = async (referenciaPago: string) => {
    try {
      const response = await fetch(`http://192.168.0.38:8000/pagos/detalles-pago/${referenciaPago}`);
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setDetalleTracking(data.detalles || []);
      setModalDetallesVisible(true);
    } catch (err: any) {
      console.error("Error cargando detalles:", err);
      alert(`Error al cargar detalles del pago: ${err.message}`);
    }
  };

  const aprobarPago = async (referenciaPago: string) => {
    if (procesando) return;
    
    const confirmacion = window.confirm(`¿Está seguro de aprobar el pago ${referenciaPago}?`);
    if (!confirmacion) return;

    setProcesando(referenciaPago);

    try {
      const user = JSON.parse(localStorage.getItem("user") || '{"email":"usuario@sistema.com"}');
      
      const response = await fetch("http://192.168.0.38:8000/pagos/aprobar-pago", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referencia_pago: referenciaPago,
          modificado_por: user.email,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Error desconocido");
      }

      const result = await response.json();
      
      alert(`✅ Pago aprobado correctamente. ${result.total_guias || 0} guías liberadas.`);
      await obtenerPagos();
      
    } catch (error: any) {
      console.error("Error aprobando pago:", error);
      alert(`❌ Error al aprobar el pago: ${error.message}`);
    } finally {
      setProcesando(null);
    }
  };

  const confirmarRechazo = async () => {
    if (!novedad.trim()) {
      alert("Debe escribir una observación para rechazar el pago");
      return;
    }

    if (procesando) return;
    setProcesando(refPagoSeleccionada);

    try {
      const user = JSON.parse(localStorage.getItem("user") || '{"email":"usuario@sistema.com"}');
      
      const response = await fetch("http://192.168.0.38:8000/pagos/rechazar-pago", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referencia_pago: refPagoSeleccionada,
          novedad,
          modificado_por: user.email,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Error desconocido");
      }

      const result = await response.json();
      
      alert(`❌ Pago rechazado correctamente. Razón: ${novedad}`);
      
      setModalVisible(false);
      setNovedad("");
      setRefPagoSeleccionada("");
      
      await obtenerPagos();
      
    } catch (error: any) {
      console.error("Error rechazando pago:", error);
      alert(`❌ Error al rechazar el pago: ${error.message}`);
    } finally {
      setProcesando(null);
    }
  };

  const getEstadoColor = (estado: string): string => {
    const colores: { [key: string]: string } = {
      'pagado': '#3b82f6',
      'aprobado': '#22c55e',
      'rechazado': '#ef4444',
      'pendiente': '#f59e0b',
    };
    return colores[estado.toLowerCase()] || '#6b7280';
  };

  const getEstadoTexto = (estado: string): string => {
    const textos: { [key: string]: string } = {
      'pagado': '💳 Pagado',
      'aprobado': '✅ Aprobado',
      'rechazado': '❌ Rechazado',
      'pendiente': '⏳ Pendiente',
    };
    return textos[estado.toLowerCase()] || estado;
  };

  const limpiarFiltros = () => {
    setFiltroReferencia("");
    setFechaDesde("");
    setFechaHasta("");
    setFiltroEstado("");
  };

  const estadosUnicos = Array.from(new Set(pagos.map(p => p.estado))).sort();

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
          Estado:
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="">Todos</option>
            {estadosUnicos.map(estado => (
              <option key={estado} value={estado}>{getEstadoTexto(estado)}</option>
            ))}
          </select>
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
        <button onClick={limpiarFiltros} className="boton-accion">
          🗑️ Limpiar
        </button>
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
      </div>

      {/* Modal de Detalles Mejorado */}
      {modalDetallesVisible && detalleTracking && (
        <div className="modal-detalles-overlay" onClick={() => setModalDetallesVisible(false)}>
          <div className="modal-detalles-content" onClick={(e) => e.stopPropagation()}>
            
            {/* Header del Modal */}
            <div className="modal-detalles-header">
              <h2 className="modal-detalles-title">
                Detalles del Pago
              </h2>
              <p className="modal-detalles-subtitle">
                Referencia: {detalleTracking[0]?.referencia || 'N/A'}
              </p>
              <button 
                className="modal-cerrar-btn"
                onClick={() => setModalDetallesVisible(false)}
                title="Cerrar"
              >
                ×
              </button>
            </div>

            {/* Cuerpo del Modal */}
            <div className="modal-detalles-body">
              
              {/* Información del Pago */}
              <div className="pago-info-card">
                <div className="pago-info-grid">
                  <div className="pago-info-item">
                    <span className="pago-info-label">Referencia</span>
                    <span className="pago-info-value">{detalleTracking[0]?.referencia || 'N/A'}</span>
                  </div>
                  
                  <div className="pago-info-item">
                    <span className="pago-info-label">Total</span>
                    <span className="pago-info-value">
                      ${detalleTracking.reduce((sum, item) => sum + item.valor, 0).toLocaleString('es-ES')}
                    </span>
                  </div>
                  
                  <div className="pago-info-item">
                    <span className="pago-info-label">Cantidad de Guías</span>
                    <span className="pago-info-value">{detalleTracking.length}</span>
                  </div>
                </div>
              </div>

              {/* Lista de Trackings */}
              {detalleTracking && detalleTracking.length > 0 && (
                <div>
                  <h3 className="trackings-section-title">
                    Guías Incluidas
                    <span className="trackings-count">
                      {detalleTracking.length}
                    </span>
                  </h3>
                  
                  <div className="trackings-lista">
                    {detalleTracking.map((item: DetalleTracking, index: number) => (
                      <div key={index} className="tracking-item">
                        
                        <div className="tracking-header">
                          <div className="tracking-numero">
                            #{item.tracking}
                          </div>
                          <div className="tracking-valor">
                            ${item.valor.toLocaleString('es-ES')}
                          </div>
                        </div>
                        
                        <div className="tracking-detalles">
                          <div className="tracking-detail-item">
                            <span className="tracking-detail-label">Referencia</span>
                            <span className="tracking-detail-value">{item.referencia}</span>
                          </div>
                          
                          <div className="tracking-detail-item">
                            <span className="tracking-detail-label">Número de Guía</span>
                            <span className="tracking-detail-value">{item.tracking}</span>
                          </div>
                          
                          <div className="tracking-detail-item">
                            <span className="tracking-detail-label">Valor Individual</span>
                            <span className="tracking-detail-value">${item.valor.toLocaleString('es-ES')}</span>
                          </div>
                        </div>
                        
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Mensaje si no hay trackings */}
              {(!detalleTracking || detalleTracking.length === 0) && (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '2rem', 
                  color: '#64748b',
                  fontStyle: 'italic'
                }}>
                  No se encontraron guías asociadas a este pago.
                </div>
              )}
              
            </div>
          </div>
        </div>
      )}

      {/* Modal de Imagen */}
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

      {/* Modal de Rechazo */}
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


// Clase de error personalizada
class ApiError extends Error {
  status?: number;
  
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}